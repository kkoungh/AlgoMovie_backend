const axios = require('axios');
const pool = require('../config/database');
const redis = require('../config/redis');

const RECOMMEND_URL = () => process.env.RECOMMEND_SERVICE_URL || 'http://localhost:8000';
const CACHE_TTL          = 3600;
const RECOMMEND_TIMEOUT_MS = 8000;
const SHOWN_COUNT        = 30;
const SPARE_COUNT        = 20;

/** DISLIKE/REMOVE 피드백을 받은 영화 ID 목록 조회 (FR-63) */
const getNegativeFeedbackIds = async (userId) => {
  const result = await pool.query(
    `SELECT movie_id FROM feedback WHERE user_id = $1 AND feedback_type IN (0, 2)`,
    [userId]
  );
  return result.rows.map((r) => r.movie_id);
};

/**
 * Returns personalized recommendations for a user using Redis cache-aside,
 * a bounded recommendation-engine call, and a database fallback.
 *
 * @param {number} userId Authenticated user id.
 * @returns {Promise<Array<object>>} Recommendation rows sorted by final score.
 */
const getRecommendations = async (userId) => {
  // 신규 유저 체크 (평점 0개 → 장르 기반 추천)
  const countResult = await pool.query(
    'SELECT COUNT(*)::int AS cnt FROM ratings WHERE user_id = $1',
    [userId]
  );
  const ratingCount = countResult.rows[0].cnt;

  const excludeIds = await getNegativeFeedbackIds(userId);

  if (ratingCount === 0) {
    const all = await getGenreBasedRecommendations(userId, excludeIds);
    return {
      recommendations: all.slice(0, SHOWN_COUNT),
      sparePool:        all.slice(SHOWN_COUNT),
      weights: { alpha: 0, beta: 0.5, gamma: 0.5, segment: 'NEW_USER' },
      fromCache: false,
      isNewUser: true,
    };
  }

  // Redis Cache-Aside
  const cacheKey = `recommendations:${userId}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return { ...JSON.parse(cached), fromCache: true };
    }
  } catch (e) {
    console.error('Redis get failed:', e.message);
  }

  // 사용자 세그먼트에 따른 가중치 설정
  let segmentWeights;
  if (ratingCount >= 20) {
    segmentWeights = { alpha: 0.7, beta: 0.3, gamma: 0, segment: 'ACTIVE_USER' };
  } else {
    segmentWeights = { alpha: 0.5, beta: 0.5, gamma: 0, segment: 'MID_USER' };
  }

  let allRecs;
  let weights = segmentWeights;
  try {
    const response = await axios.get(`${RECOMMEND_URL()}/recommendations/${userId}`, {
      timeout: RECOMMEND_TIMEOUT_MS,
    });
    // Python은 recommendations(30) + spare_pool(20) 분리 응답
    const shown = (response.data.recommendations || []).map(normalizePythonMovie);
    const spare = (response.data.spare_pool      || []).map(normalizePythonMovie);
    allRecs = [...shown, ...spare];
    if (response.data.weights) weights = response.data.weights;
  } catch (e) {
    console.error('추천 서비스 호출 실패:', e.message);
    allRecs = await getFromDB(userId, excludeIds);
  }

  // 부정 피드백 영화 제거 (FR-63)
  if (excludeIds.length > 0) {
    allRecs = allRecs.filter(
      (r) => !excludeIds.includes(parseInt(r.movieId || r.movie_id))
    );
  }

  // Python/DB 모두 비어있으면 장르 기반 폴백
  if (allRecs.length === 0) {
    console.log(`사용자 ${userId}: 추천 결과 없음 → 장르 기반 폴백`);
    allRecs = await getGenreBasedRecommendations(userId, excludeIds);
    weights = { ...segmentWeights, fallback: true };
  }

  const result = {
    recommendations: allRecs.slice(0, SHOWN_COUNT),
    sparePool:        allRecs.slice(SHOWN_COUNT),
    weights,
    fromCache: false,
    isNewUser: false,
  };

  try {
    await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL);
  } catch (e) {
    console.error('Redis set failed:', e.message);
  }

  return result;
};

/** 장르 기반 추천 (신규 유저 or 폴백), excludeIds 필터링 포함 */
const getGenreBasedRecommendations = async (userId, excludeIds = []) => {
  const genreResult = await pool.query(
    `SELECT g.name FROM user_preferred_genres upg
     JOIN genres g ON upg.genre_id = g.genre_id
     WHERE upg.user_id = $1`,
    [userId]
  );
  const genres = genreResult.rows.map((r) => r.name);

  const excludeClause = excludeIds.length > 0
    ? `AND m.movie_id NOT IN (${excludeIds.join(',')})`
    : '';

  if (genres.length === 0) {
    const res = await pool.query(
      `SELECT movie_id, title, poster_path, avg_rating, genres, rating_count
       FROM movies m
       WHERE 1=1 ${excludeClause}
       ORDER BY avg_rating DESC, rating_count DESC
       LIMIT ${SHOWN_COUNT + SPARE_COUNT}`
    );
    return res.rows.map(formatMovie);
  }

  const res = await pool.query(
    `SELECT DISTINCT m.movie_id, m.title, m.poster_path, m.avg_rating, m.genres, m.rating_count
     FROM movies m
     WHERE EXISTS (
       SELECT 1 FROM jsonb_array_elements_text(m.genres) AS g WHERE g = ANY($1::text[])
     )
     ${excludeClause}
     ORDER BY m.avg_rating DESC, m.rating_count DESC
     LIMIT ${SHOWN_COUNT + SPARE_COUNT}`,
    [genres]
  );
  return res.rows.map(formatMovie);
};

const getFromDB = async (userId, excludeIds = []) => {
  const excludeClause = excludeIds.length > 0
    ? `AND rs.movie_id NOT IN (${excludeIds.join(',')})`
    : '';

  const result = await pool.query(
    `SELECT rs.final_score, rs.cf_score, rs.content_score, rs.popularity_score,
            m.movie_id, m.title, m.poster_path, m.avg_rating, m.genres
     FROM recommend_scores rs
     JOIN movies m ON rs.movie_id = m.movie_id
     WHERE rs.user_id = $1 ${excludeClause}
     ORDER BY rs.final_score DESC
     LIMIT ${SHOWN_COUNT + SPARE_COUNT}`,
    [userId]
  );
  return result.rows.map((row) => ({
    ...formatMovie(row),
    finalScore:      row.final_score,
    cfScore:         row.cf_score,
    contentScore:    row.content_score,
    popularityScore: row.popularity_score,
  }));
};

const formatMovie = (row) => ({
  movieId:    row.movie_id,
  title:      row.title,
  posterPath: row.poster_path,
  avgRating:  parseFloat(row.avg_rating) || 0,
  genres:     row.genres || [],
});

/** Python 서비스의 snake_case 응답 → camelCase 정규화 */
const normalizePythonMovie = (m) => ({
  movieId:    m.movie_id    ?? m.movieId,
  title:      m.title       ?? '',
  posterPath: m.poster_path ?? m.posterPath ?? null,
  avgRating:  parseFloat(m.avg_rating ?? m.avgRating) || 0,
  genres:     m.genres      || [],
  finalScore: parseFloat(m.final_score ?? m.finalScore) || 0,
});

module.exports = { getRecommendations };

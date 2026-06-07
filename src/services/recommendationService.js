const axios = require('axios');
const pool  = require('../config/database');
const redis = require('../config/redis');

const RECOMMEND_URL = () => process.env.RECOMMEND_SERVICE_URL || 'http://localhost:8000';
const CACHE_TTL     = 3600;

const getRecommendations = async (userId) => {
  // 신규 유저 체크 (평점 0개 → 장르 기반 추천)
  const countResult = await pool.query(
    'SELECT COUNT(*)::int AS cnt FROM ratings WHERE user_id = $1',
    [userId]
  );
  const ratingCount = countResult.rows[0].cnt;

  if (ratingCount === 0) {
    const recs = await getGenreBasedRecommendations(userId);
    return {
      recommendations: recs,
      weights: { alpha: 0, beta: 0, gamma: 1, segment: 'NEW_USER' },
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
    console.error('Redis get 실패:', e.message);
  }

  // Python 추천 서비스 호출
  let recommendations;
  let weights = null;
  try {
    const response = await axios.get(`${RECOMMEND_URL()}/recommendations/${userId}`, {
      timeout: 10000,
    });
    recommendations = response.data.recommendations || [];
    weights         = response.data.weights         || null;
  } catch (e) {
    console.error('추천 서비스 호출 실패:', e.message);
    recommendations = await getFromDB(userId);
  }

  const result = { recommendations, weights, fromCache: false, isNewUser: false };

  try {
    await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL);
  } catch (e) {
    console.error('Redis set 실패:', e.message);
  }

  return result;
};

// 신규 유저: 선호 장르 기반 추천
const getGenreBasedRecommendations = async (userId) => {
  const genreResult = await pool.query(
    `SELECT g.name FROM user_preferred_genres upg
     JOIN genres g ON upg.genre_id = g.genre_id
     WHERE upg.user_id = $1`,
    [userId]
  );
  const genres = genreResult.rows.map((r) => r.name);

  if (genres.length === 0) {
    // 선호 장르도 없으면 인기순
    const res = await pool.query(
      `SELECT movie_id, title, poster_path, avg_rating, genres, rating_count
       FROM movies ORDER BY avg_rating DESC, rating_count DESC LIMIT 20`
    );
    return res.rows.map(formatMovie);
  }

  const res = await pool.query(
    `SELECT DISTINCT m.movie_id, m.title, m.poster_path, m.avg_rating, m.genres, m.rating_count
     FROM movies m
     WHERE EXISTS (
       SELECT 1 FROM jsonb_array_elements_text(m.genres) AS g WHERE g = ANY($1::text[])
     )
     ORDER BY m.avg_rating DESC, m.rating_count DESC
     LIMIT 20`,
    [genres]
  );
  return res.rows.map(formatMovie);
};

const getFromDB = async (userId) => {
  const result = await pool.query(
    `SELECT rs.final_score, rs.cf_score, rs.content_score, rs.popularity_score,
            m.movie_id, m.title, m.poster_path, m.avg_rating, m.genres
     FROM recommend_scores rs
     JOIN movies m ON rs.movie_id = m.movie_id
     WHERE rs.user_id = $1
     ORDER BY rs.final_score DESC
     LIMIT 30`,
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

module.exports = { getRecommendations };

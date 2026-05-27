const axios = require('axios');
const pool  = require('../config/database');
const redis = require('../config/redis');

const RECOMMEND_URL = () => process.env.RECOMMEND_SERVICE_URL || 'http://localhost:8000';
const CACHE_TTL     = 3600; // 1시간

const getRecommendations = async (userId) => {
  // 1. Redis Cache-Aside
  const cacheKey = `recommendations:${userId}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (e) {
    console.error('Redis get 실패:', e.message);
  }

  // 2. Python 추천 서비스 호출
  let recommendations;
  try {
    const response = await axios.get(`${RECOMMEND_URL()}/recommendations/${userId}`, {
      timeout: 10000,
    });
    recommendations = response.data.recommendations || [];
  } catch (e) {
    console.error('추천 서비스 호출 실패:', e.message);
    // 추천 서비스 장애 시 DB에서 직접 조회
    recommendations = await getFromDB(userId);
  }

  // 3. Redis에 캐싱
  try {
    await redis.set(cacheKey, JSON.stringify(recommendations), 'EX', CACHE_TTL);
  } catch (e) {
    console.error('Redis set 실패:', e.message);
  }

  return recommendations;
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
    movieId:         row.movie_id,
    title:           row.title,
    posterPath:      row.poster_path,
    avgRating:       parseFloat(row.avg_rating) || 0,
    genres:          row.genres || [],
    finalScore:      row.final_score,
    cfScore:         row.cf_score,
    contentScore:    row.content_score,
    popularityScore: row.popularity_score,
  }));
};

module.exports = { getRecommendations };

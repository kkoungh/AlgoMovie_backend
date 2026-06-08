const axios = require('axios');
const pool = require('../config/database');
const redis = require('../config/redis');

const RECOMMEND_URL = () => process.env.RECOMMEND_SERVICE_URL || 'http://localhost:8000';
const CACHE_TTL = 3600;
const RECOMMEND_TIMEOUT_MS = 2500;

/**
 * Returns personalized recommendations for a user using Redis cache-aside,
 * a bounded recommendation-engine call, and a database fallback.
 *
 * @param {number} userId Authenticated user id.
 * @returns {Promise<Array<object>>} Recommendation rows sorted by final score.
 */
const getRecommendations = async (userId) => {
  const cacheKey = `recommendations:${userId}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (e) {
    console.error('Redis get failed:', e.message);
  }

  let recommendations;
  try {
    const response = await axios.get(`${RECOMMEND_URL()}/recommendations/${userId}`, {
      timeout: RECOMMEND_TIMEOUT_MS,
    });
    recommendations = response.data.recommendations || [];
  } catch (e) {
    console.error('Recommendation service call failed:', e.message);
    recommendations = await getFromDB(userId);
  }

  try {
    await redis.set(cacheKey, JSON.stringify(recommendations), 'EX', CACHE_TTL);
  } catch (e) {
    console.error('Redis set failed:', e.message);
  }

  return recommendations;
};

/**
 * Reads the latest persisted recommendation scores when the recommendation
 * engine is unavailable or too slow.
 *
 * @param {number} userId Authenticated user id.
 * @returns {Promise<Array<object>>} Up to 30 fallback recommendation rows.
 */
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
    movieId: row.movie_id,
    title: row.title,
    posterPath: row.poster_path,
    avgRating: parseFloat(row.avg_rating) || 0,
    genres: row.genres || [],
    finalScore: row.final_score,
    cfScore: row.cf_score,
    contentScore: row.content_score,
    popularityScore: row.popularity_score,
  }));
};

module.exports = { getRecommendations };

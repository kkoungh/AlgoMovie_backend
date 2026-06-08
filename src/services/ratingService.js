const pool = require('../config/database');
const redis = require('../config/redis');
const axios = require('axios');

const writeRating = async ({ userId, movieId, score, review }) => {
  // 평점 범위 검증
  if (!score || score < 1 || score > 5) {
    const err = new Error('평점은 1~5 사이여야 합니다.');
    err.status = 422;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  // 중복 평가 확인
  const dup = await pool.query(
    'SELECT rating_id FROM ratings WHERE user_id = $1 AND movie_id = $2',
    [userId, movieId]
  );
  if (dup.rows.length > 0) {
    const err = new Error('이미 평가한 영화입니다.');
    err.status = 409;
    err.code = 'DUPLICATE';
    throw err;
  }

  // 평점 저장
  const result = await pool.query(
    `INSERT INTO ratings (user_id, movie_id, score, review)
     VALUES ($1, $2, $3, $4) RETURNING rating_id`,
    [userId, movieId, score, review || null]
  );
  const ratingId = result.rows[0].rating_id;

  // 영화 평균 평점 재계산
  await pool.query(
    `UPDATE movies
     SET avg_rating   = (SELECT AVG(score) FROM ratings WHERE movie_id = $1),
         rating_count = (SELECT COUNT(*)  FROM ratings WHERE movie_id = $1)
     WHERE movie_id = $1`,
    [movieId]
  );

  // 사용자 누적 평점 수 증가
  await pool.query('UPDATE users SET rating_count = rating_count + 1 WHERE user_id = $1', [userId]);

  // 비동기 백그라운드: 추천 재계산 트리거 + 캐시 무효화
  setImmediate(async () => {
    try {
      const url = process.env.RECOMMEND_SERVICE_URL || 'http://localhost:8000';
      await axios.post(`${url}/recommendations/update/${userId}`, {}, { timeout: 30000 });
    } catch (e) {
      console.error('추천 갱신 요청 실패:', e.message);
    }
    try {
      await redis.del(`recommendations:${userId}`);
    } catch (e) {
      console.error('Redis 캐시 삭제 실패:', e.message);
    }
  });

  return { ratingId };
};

const getMyRatings = async (userId) => {
  const result = await pool.query(
    `SELECT r.rating_id, r.score, r.review, r.created_at,
            m.movie_id, m.title, m.poster_path, m.avg_rating
     FROM ratings r
     JOIN movies m ON r.movie_id = m.movie_id
     WHERE r.user_id = $1
     ORDER BY r.created_at DESC`,
    [userId]
  );

  return result.rows.map((row) => ({
    ratingId: row.rating_id,
    score: row.score,
    review: row.review,
    createdAt: row.created_at,
    movie: {
      movieId: row.movie_id,
      title: row.title,
      posterPath: row.poster_path,
      avgRating: parseFloat(row.avg_rating) || 0,
    },
  }));
};

module.exports = { writeRating, getMyRatings };

const pool  = require('../config/database');
const redis = require('../config/redis');

const TYPE_MAP = { LIKE: 1, DISLIKE: 0, REMOVE: 2 };

const submitFeedback = async ({ userId, movieId, type }) => {
  const feedbackType = TYPE_MAP[type];
  if (feedbackType === undefined) {
    const err = new Error('피드백 타입은 LIKE, DISLIKE, REMOVE 중 하나여야 합니다.');
    err.status = 422; err.code = 'VALIDATION_ERROR';
    throw err;
  }

  await pool.query(
    `INSERT INTO feedback (user_id, movie_id, feedback_type)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, movie_id) DO UPDATE SET feedback_type = $3, created_at = NOW()`,
    [userId, movieId, feedbackType]
  );

  // DISLIKE / REMOVE 시 추천 캐시 무효화
  if (feedbackType !== 1) {
    try {
      await redis.del(`recommendations:${userId}`);
    } catch (e) {
      console.error('Redis 캐시 삭제 실패:', e.message);
    }
  }
};

module.exports = { submitFeedback };

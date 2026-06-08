const pool = require('../config/database');

const getProfile = async (userId) => {
  const userResult = await pool.query(
    `SELECT user_id, email, nickname, profile_image_url, rating_count, created_at
     FROM users WHERE user_id = $1 AND status = 'ACTIVE'`,
    [userId]
  );
  if (userResult.rows.length === 0) {
    const err = new Error('사용자를 찾을 수 없습니다.');
    err.status = 404;
    err.code = 'USER_NOT_FOUND';
    throw err;
  }

  const genreResult = await pool.query(
    `SELECT g.genre_id, g.name
     FROM user_preferred_genres upg
     JOIN genres g ON upg.genre_id = g.genre_id
     WHERE upg.user_id = $1`,
    [userId]
  );

  const user = userResult.rows[0];
  return {
    userId: user.user_id,
    email: user.email,
    nickname: user.nickname,
    profileImageUrl: user.profile_image_url,
    ratingCount: user.rating_count,
    preferredGenres: genreResult.rows.map((r) => ({ genreId: r.genre_id, name: r.name })),
  };
};

const updateProfile = async (userId, { nickname, profileImageUrl }) => {
  const fields = [];
  const values = [];
  let paramIdx = 1;

  if (nickname !== undefined) {
    fields.push(`nickname = $${paramIdx++}`);
    values.push(nickname);
  }
  if (profileImageUrl !== undefined) {
    fields.push(`profile_image_url = $${paramIdx++}`);
    values.push(profileImageUrl);
  }

  if (fields.length === 0) {
    const err = new Error('수정할 항목이 없습니다.');
    err.status = 422;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  values.push(userId);
  await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE user_id = $${paramIdx}`, values);

  return getProfile(userId);
};

module.exports = { getProfile, updateProfile };

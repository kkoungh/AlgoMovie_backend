const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../config/database');

const SALT_ROUNDS = 10;

const signUp = async ({ email, password, nickname, genres }) => {
  // 이메일 중복 검사
  const existing = await pool.query('SELECT user_id FROM users WHERE email = $1', [email]);
  if (existing.rows.length > 0) {
    const err = new Error('이미 사용 중인 이메일입니다.');
    err.status = 409;
    err.code = 'EMAIL_DUPLICATE';
    throw err;
  }

  // 장르 개수 검증
  if (!genres || genres.length < 3) {
    const err = new Error('선호 장르를 최소 3개 선택해야 합니다.');
    err.status = 422;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userResult = await client.query(
      `INSERT INTO users (email, nickname, password_hash)
       VALUES ($1, $2, $3) RETURNING user_id`,
      [email, nickname, passwordHash]
    );
    const userId = userResult.rows[0].user_id;

    // 선호 장르 저장
    for (const genreId of genres) {
      await client.query(
        'INSERT INTO user_preferred_genres (user_id, genre_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [userId, genreId]
      );
    }

    await client.query('COMMIT');
    return { userId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const login = async ({ email, password }) => {
  const result = await pool.query(
    `SELECT user_id, email, nickname, password_hash, status
     FROM users WHERE email = $1`,
    [email]
  );

  if (result.rows.length === 0) {
    const err = new Error('이메일 또는 비밀번호가 올바르지 않습니다.');
    err.status = 401;
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  const user = result.rows[0];
  if (user.status === 'DELETED') {
    const err = new Error('탈퇴한 계정입니다.');
    err.status = 401;
    err.code = 'ACCOUNT_DELETED';
    throw err;
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    const err = new Error('이메일 또는 비밀번호가 올바르지 않습니다.');
    err.status = 401;
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  const accessToken = generateAccessToken(user);
  const refreshToken = await generateRefreshToken(user.user_id);

  return {
    accessToken,
    refreshToken,
    user: { userId: user.user_id, email: user.email, nickname: user.nickname },
  };
};

const refreshAccessToken = async (refreshToken) => {
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const result = await pool.query(
    `SELECT rt.user_id, u.email, u.nickname
     FROM refresh_tokens rt
     JOIN users u ON rt.user_id = u.user_id
     WHERE rt.token_hash = $1 AND rt.expires_at > NOW()`,
    [tokenHash]
  );
  if (result.rows.length === 0) {
    const err = new Error('유효하지 않은 리프레시 토큰입니다.');
    err.status = 401;
    err.code = 'INVALID_REFRESH_TOKEN';
    throw err;
  }
  const user = result.rows[0];
  return { accessToken: generateAccessToken(user) };
};

const withdraw = async (userId) => {
  await pool.query('DELETE FROM users WHERE user_id = $1', [userId]);
};

const generateAccessToken = (user) =>
  jwt.sign({ userId: user.user_id, email: user.email }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES || '1h',
  });

const generateRefreshToken = async (userId) => {
  const token = crypto.randomBytes(40).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7d

  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt]
  );
  return token;
};

module.exports = { signUp, login, refreshAccessToken, withdraw };

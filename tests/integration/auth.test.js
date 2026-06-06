jest.mock('../../src/config/database');
jest.mock('../../src/config/redis', () => ({ del: jest.fn().mockResolvedValue(1) }));
jest.mock('bcrypt');
jest.mock('jsonwebtoken');

const request = require('supertest');
const app     = require('../../src/app');
const pool    = require('../../src/config/database');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');

const mockClient = { query: jest.fn(), release: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  pool.connect = jest.fn().mockResolvedValue(mockClient);
});

describe('POST /api/auth/register', () => {
  test('필수 필드 누락 시 422 반환', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'a@a.com' });
    expect(res.status).toBe(422);
  });

  test('이메일 중복 시 409 반환', async () => {
    pool.query = jest.fn().mockResolvedValueOnce({ rows: [{ user_id: 1 }] });
    const res = await request(app).post('/api/auth/register').send({
      email: 'dup@a.com', password: 'pw1234', nickname: '테스터', genres: [1, 2, 3],
    });
    expect(res.status).toBe(409);
  });

  test('정상 가입 시 201 반환', async () => {
    pool.query = jest.fn().mockResolvedValueOnce({ rows: [] });
    bcrypt.hash = jest.fn().mockResolvedValue('hashed');
    mockClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ user_id: 1 }] })
      .mockResolvedValue({});

    const res = await request(app).post('/api/auth/register').send({
      email: 'new@a.com', password: 'pw1234', nickname: '테스터', genres: [1, 2, 3],
    });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('userId');
  });
});

describe('POST /api/auth/login', () => {
  test('필수 필드 누락 시 422 반환', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'a@a.com' });
    expect(res.status).toBe(422);
  });

  test('잘못된 인증정보 시 401 반환', async () => {
    pool.query = jest.fn().mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post('/api/auth/login').send({
      email: 'none@a.com', password: 'wrong',
    });
    expect(res.status).toBe(401);
  });

  test('정상 로그인 시 200과 토큰 반환', async () => {
    pool.query = jest.fn()
      .mockResolvedValueOnce({
        rows: [{ user_id: 1, email: 'a@a.com', nickname: '유저', password_hash: 'h', status: 'ACTIVE' }],
      })
      .mockResolvedValueOnce({});
    bcrypt.compare = jest.fn().mockResolvedValue(true);
    jwt.sign = jest.fn().mockReturnValue('access-token');

    const res = await request(app).post('/api/auth/login').send({
      email: 'a@a.com', password: 'pw',
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
  });
});

describe('DELETE /api/auth/withdraw', () => {
  test('인증 없이 요청 시 401 반환', async () => {
    const res = await request(app).delete('/api/auth/withdraw');
    expect(res.status).toBe(401);
  });

  test('유효한 토큰으로 탈퇴 시 204 반환', async () => {
    jwt.verify = jest.fn().mockReturnValue({ userId: 1, email: 'a@a.com' });
    pool.query = jest.fn().mockResolvedValue({});

    const res = await request(app)
      .delete('/api/auth/withdraw')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(204);
  });
});

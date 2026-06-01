jest.mock('../../src/config/database');
jest.mock('bcrypt');
jest.mock('jsonwebtoken');

const pool   = require('../../src/config/database');
const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret';

const authService = require('../../src/services/authService');

const mockClient = {
  query:   jest.fn(),
  release: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  pool.connect = jest.fn().mockResolvedValue(mockClient);
});

describe('authService.signUp', () => {
  test('장르가 3개 미만이면 VALIDATION_ERROR를 던진다', async () => {
    pool.query = jest.fn().mockResolvedValueOnce({ rows: [] });
    await expect(
      authService.signUp({ email: 'a@a.com', password: '1234', nickname: '홍길동', genres: [1, 2] })
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  test('이메일 중복이면 EMAIL_DUPLICATE를 던진다', async () => {
    pool.query = jest.fn().mockResolvedValueOnce({ rows: [{ user_id: 1 }] });
    await expect(
      authService.signUp({ email: 'dup@a.com', password: '1234', nickname: '홍길동', genres: [1, 2, 3] })
    ).rejects.toMatchObject({ code: 'EMAIL_DUPLICATE' });
  });

  test('정상 가입 시 userId를 반환한다', async () => {
    pool.query = jest.fn().mockResolvedValueOnce({ rows: [] });
    bcrypt.hash = jest.fn().mockResolvedValue('hashed');
    mockClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ user_id: 42 }] })
      .mockResolvedValue({});

    const result = await authService.signUp({
      email: 'new@a.com', password: 'pw', nickname: '테스터', genres: [1, 2, 3],
    });
    expect(result).toHaveProperty('userId', 42);
  });
});

describe('authService.login', () => {
  test('존재하지 않는 이메일이면 INVALID_CREDENTIALS를 던진다', async () => {
    pool.query = jest.fn().mockResolvedValueOnce({ rows: [] });
    await expect(
      authService.login({ email: 'none@a.com', password: '1234' })
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  test('탈퇴한 계정이면 ACCOUNT_DELETED를 던진다', async () => {
    pool.query = jest.fn().mockResolvedValueOnce({
      rows: [{ user_id: 1, email: 'a@a.com', nickname: '탈퇴', password_hash: 'h', status: 'DELETED' }],
    });
    await expect(
      authService.login({ email: 'a@a.com', password: '1234' })
    ).rejects.toMatchObject({ code: 'ACCOUNT_DELETED' });
  });

  test('비밀번호 불일치 시 INVALID_CREDENTIALS를 던진다', async () => {
    pool.query = jest.fn().mockResolvedValueOnce({
      rows: [{ user_id: 1, email: 'a@a.com', nickname: '유저', password_hash: 'h', status: 'ACTIVE' }],
    });
    bcrypt.compare = jest.fn().mockResolvedValue(false);
    await expect(
      authService.login({ email: 'a@a.com', password: 'wrong' })
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  test('정상 로그인 시 accessToken과 refreshToken을 반환한다', async () => {
    pool.query = jest.fn()
      .mockResolvedValueOnce({
        rows: [{ user_id: 1, email: 'a@a.com', nickname: '유저', password_hash: 'h', status: 'ACTIVE' }],
      })
      .mockResolvedValueOnce({});
    bcrypt.compare = jest.fn().mockResolvedValue(true);
    jwt.sign = jest.fn().mockReturnValue('access-token');

    const result = await authService.login({ email: 'a@a.com', password: 'pw' });
    expect(result).toHaveProperty('accessToken');
    expect(result).toHaveProperty('refreshToken');
    expect(result.user).toMatchObject({ email: 'a@a.com' });
  });
});

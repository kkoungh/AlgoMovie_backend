const { createMockPool } = require('./helpers/mockDb');
const { loadAppWithMockAuth } = require('./helpers/mockApp');

describe('auth API integration (FR-01~FR-06, FR-17~FR-18)', () => {
  let request;
  let authService;

  beforeEach(() => {
    jest.resetModules();
    authService = {
      signUp: jest.fn(),
      login: jest.fn(),
      refreshAccessToken: jest.fn(),
      withdraw: jest.fn(),
    };
    jest.doMock('../src/services/authService', () => authService);
    request = loadAppWithMockAuth();
  });

  test('email registration succeeds and returns persisted user id', async () => {
    authService.signUp.mockResolvedValue({ userId: 7 });

    const res = await request.post('/api/auth/register').send({
      email: 'tester@example.com',
      password: 'safe-password',
      nickname: 'tester',
      genres: [1, 2, 3],
    });

    expect(res.status).toBe(201);
    expect(res.body.userId).toBe(7);
    expect(authService.signUp).toHaveBeenCalledWith({
      email: 'tester@example.com',
      password: 'safe-password',
      nickname: 'tester',
      genres: [1, 2, 3],
    });
  });

  test('email login succeeds and returns auth tokens', async () => {
    authService.login.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: { userId: 7, email: 'tester@example.com', nickname: 'tester' },
    });

    const res = await request.post('/api/auth/login').send({
      email: 'tester@example.com',
      password: 'safe-password',
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: { userId: 7 },
    });
  });

  test('protected user actions reject unauthenticated requests', async () => {
    const paths = [
      ['get', '/api/recommendations'],
      ['post', '/api/ratings'],
      ['post', '/api/wishlist/10'],
      ['get', '/api/mypage/reviews'],
      ['delete', '/api/auth/withdraw'],
    ];

    for (const [method, path] of paths) {
      const res = await request[method](path).send({ movieId: 10, score: 4 });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    }
  });

  test('withdraw calls account deletion for authenticated user', async () => {
    authService.withdraw.mockResolvedValue();

    const res = await request.delete('/api/auth/withdraw').set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(204);
    expect(authService.withdraw).toHaveBeenCalledWith(7);
  });
});

describe('auth service unit tests (FR-01~FR-05, FR-17~FR-18)', () => {
  let pool;
  let client;
  let makeClient;
  let authService;
  let bcrypt;
  let jwt;

  beforeEach(() => {
    jest.resetModules();
    jest.dontMock('../src/services/authService');
    ({ pool, createClient: makeClient } = createMockPool());
    client = makeClient();
    pool.connect.mockResolvedValue(client);
    jest.doMock('../src/config/database', () => pool);
    jest.doMock('bcrypt', () => ({
      hash: jest.fn().mockResolvedValue('hashed-password'),
      compare: jest.fn().mockResolvedValue(true),
    }));
    jest.doMock('jsonwebtoken', () => ({
      sign: jest.fn().mockReturnValue('signed-access-token'),
    }));
    process.env.JWT_SECRET = 'test-secret';
    authService = require('../src/services/authService');
    bcrypt = require('bcrypt');
    jwt = require('jsonwebtoken');
  });

  test('signUp rejects duplicate email before insert', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ user_id: 1 }] });

    await expect(authService.signUp({
      email: 'dupe@example.com',
      password: 'pw',
      nickname: 'dupe',
      genres: [1, 2, 3],
    })).rejects.toMatchObject({ status: 409, code: 'EMAIL_DUPLICATE' });

    expect(pool.connect).not.toHaveBeenCalled();
  });

  test('signUp stores account and preferred genres in a transaction', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    client.query
      .mockResolvedValueOnce()
      .mockResolvedValueOnce({ rows: [{ user_id: 11 }] })
      .mockResolvedValueOnce()
      .mockResolvedValueOnce()
      .mockResolvedValueOnce()
      .mockResolvedValueOnce();

    const result = await authService.signUp({
      email: 'new@example.com',
      password: 'pw',
      nickname: 'newbie',
      genres: [1, 2, 3],
    });

    expect(result).toEqual({ userId: 11 });
    expect(bcrypt.hash).toHaveBeenCalledWith('pw', 12);
    expect(client.query).toHaveBeenCalledWith('BEGIN');
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO users'),
      ['new@example.com', 'newbie', 'hashed-password']
    );
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  test('login validates password and creates access and refresh tokens', async () => {
    pool.query
      .mockResolvedValueOnce({
        rows: [{
          user_id: 7,
          email: 'tester@example.com',
          nickname: 'tester',
          password_hash: 'hash',
          status: 'ACTIVE',
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const result = await authService.login({ email: 'tester@example.com', password: 'pw' });

    expect(bcrypt.compare).toHaveBeenCalledWith('pw', 'hash');
    expect(jwt.sign).toHaveBeenCalledWith(
      { userId: 7, email: 'tester@example.com' },
      'test-secret',
      { expiresIn: '1h' }
    );
    expect(result.accessToken).toBe('signed-access-token');
    expect(result.refreshToken).toEqual(expect.any(String));
    expect(result.user).toMatchObject({ userId: 7, email: 'tester@example.com' });
    expect(pool.query).toHaveBeenLastCalledWith(
      expect.stringContaining('INSERT INTO refresh_tokens'),
      expect.arrayContaining([7, expect.any(String), expect.any(Date)])
    );
  });

  test('withdraw marks account deleted and invalidates refresh tokens', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    await authService.withdraw(7);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE users SET status = 'DELETED'"),
      [7]
    );
    expect(pool.query).toHaveBeenCalledWith('DELETE FROM refresh_tokens WHERE user_id = $1', [7]);
  });
});

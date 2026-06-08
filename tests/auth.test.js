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

  test.each([
    ['missing email', { password: 'safe-password', nickname: 'tester', genres: [1, 2, 3] }],
    ['missing password', { email: 'tester@example.com', nickname: 'tester', genres: [1, 2, 3] }],
  ])('registration validation fails for %s', async (_, payload) => {
    const res = await request.post('/api/auth/register').send(payload);

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(authService.signUp).not.toHaveBeenCalled();
  });

  test('registration returns duplicate email errors from service', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('duplicate email');
    err.status = 409;
    err.code = 'EMAIL_DUPLICATE';
    authService.signUp.mockRejectedValue(err);

    const res = await request.post('/api/auth/register').send({
      email: 'dupe@example.com',
      password: 'safe-password',
      nickname: 'dupe',
      genres: [1, 2, 3],
    });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_DUPLICATE');
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

  test.each([
    ['missing email', { password: 'safe-password' }],
    ['missing password', { email: 'tester@example.com' }],
  ])('login validation fails for %s', async (_, payload) => {
    const res = await request.post('/api/auth/login').send(payload);

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(authService.login).not.toHaveBeenCalled();
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

    const res = await request
      .delete('/api/auth/withdraw')
      .set('Authorization', 'Bearer test-token');

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

    await expect(
      authService.signUp({
        email: 'dupe@example.com',
        password: 'pw',
        nickname: 'dupe',
        genres: [1, 2, 3],
      })
    ).rejects.toMatchObject({ status: 409, code: 'EMAIL_DUPLICATE' });

    expect(pool.connect).not.toHaveBeenCalled();
  });

  test('signUp rejects missing or insufficient preferred genres', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      authService.signUp({
        email: 'new@example.com',
        password: 'pw',
        nickname: 'newbie',
        genres: [1, 2],
      })
    ).rejects.toMatchObject({ status: 422, code: 'VALIDATION_ERROR' });

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
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO users'), [
      'new@example.com',
      'newbie',
      'hashed-password',
    ]);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  test('signUp rolls back and releases the transaction when insert fails', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    client.query
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(new Error('insert failed'))
      .mockResolvedValueOnce();

    await expect(
      authService.signUp({
        email: 'new@example.com',
        password: 'pw',
        nickname: 'newbie',
        genres: [1, 2, 3],
      })
    ).rejects.toThrow('insert failed');

    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });

  test('login validates password and creates access and refresh tokens', async () => {
    pool.query
      .mockResolvedValueOnce({
        rows: [
          {
            user_id: 7,
            email: 'tester@example.com',
            nickname: 'tester',
            password_hash: 'hash',
            status: 'ACTIVE',
          },
        ],
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

  test('login rejects a non-existent email', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      authService.login({ email: 'missing@example.com', password: 'pw' })
    ).rejects.toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  test('login rejects a deleted account before password comparison', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          user_id: 7,
          email: 'tester@example.com',
          nickname: 'tester',
          password_hash: 'hash',
          status: 'DELETED',
        },
      ],
    });

    await expect(
      authService.login({ email: 'tester@example.com', password: 'pw' })
    ).rejects.toMatchObject({ status: 401, code: 'ACCOUNT_DELETED' });
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  test('login rejects a wrong password', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          user_id: 7,
          email: 'tester@example.com',
          nickname: 'tester',
          password_hash: 'hash',
          status: 'ACTIVE',
        },
      ],
    });
    bcrypt.compare.mockResolvedValueOnce(false);

    await expect(
      authService.login({ email: 'tester@example.com', password: 'wrong' })
    ).rejects.toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  test('refreshAccessToken issues a new access token for a valid refresh token', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          user_id: 7,
          email: 'tester@example.com',
          nickname: 'tester',
        },
      ],
    });

    const result = await authService.refreshAccessToken('refresh-token');

    expect(result).toEqual({ accessToken: 'signed-access-token' });
    expect(jwt.sign).toHaveBeenCalledWith(
      { userId: 7, email: 'tester@example.com' },
      'test-secret',
      { expiresIn: '1h' }
    );
  });

  test('refreshAccessToken rejects an unknown or expired refresh token', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    await expect(authService.refreshAccessToken('missing-token')).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_REFRESH_TOKEN',
    });
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

describe('auth middleware unit tests', () => {
  let authenticate;
  let optionalAuth;
  let jwt;
  let req;
  let res;
  let next;

  beforeEach(() => {
    jest.resetModules();
    jest.unmock('../src/middleware/auth');
    jest.dontMock('../src/middleware/auth');
    jest.unmock('jsonwebtoken');
    jest.doMock('jsonwebtoken', () => ({
      verify: jest.fn(),
    }));
    ({ authenticate, optionalAuth } = require('../src/middleware/auth'));
    jwt = require('jsonwebtoken');
    req = { headers: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
  });

  test('authenticate rejects when token is missing', () => {
    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'UNAUTHORIZED' }));
    expect(next).not.toHaveBeenCalled();
  });

  test('authenticate rejects an invalid token', () => {
    req.headers.authorization = 'Bearer invalid-token';
    jwt.verify.mockImplementation(() => {
      throw new Error('bad token');
    });

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVALID_TOKEN' }));
    expect(next).not.toHaveBeenCalled();
  });

  test('authenticate rejects an expired token with a specific code', () => {
    req.headers.authorization = 'Bearer expired-token';
    const err = new Error('expired');
    err.name = 'TokenExpiredError';
    jwt.verify.mockImplementation(() => {
      throw err;
    });

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'TOKEN_EXPIRED' }));
    expect(next).not.toHaveBeenCalled();
  });

  test('authenticate accepts a valid bearer token and attaches the user', () => {
    req.headers.authorization = 'Bearer valid-token';
    jwt.verify.mockReturnValue({ userId: 7, email: 'tester@example.com' });

    authenticate(req, res, next);

    expect(req.user).toEqual({ userId: 7, email: 'tester@example.com' });
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('optionalAuth continues without a user when no bearer token is present', () => {
    optionalAuth(req, res, next);

    expect(req.user).toBeUndefined();
    expect(jwt.verify).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  test('optionalAuth attaches a user for a valid bearer token', () => {
    req.headers.authorization = 'Bearer valid-token';
    jwt.verify.mockReturnValue({ userId: 7, email: 'tester@example.com' });

    optionalAuth(req, res, next);

    expect(req.user).toEqual({ userId: 7, email: 'tester@example.com' });
    expect(next).toHaveBeenCalled();
  });

  test('optionalAuth ignores invalid tokens and continues as guest', () => {
    req.headers.authorization = 'Bearer invalid-token';
    jwt.verify.mockImplementation(() => {
      throw new Error('bad token');
    });

    optionalAuth(req, res, next);

    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });
});

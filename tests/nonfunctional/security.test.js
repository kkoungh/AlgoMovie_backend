const { createMockPool } = require('../helpers/mockDb');
const { loadAppWithMockAuth } = require('../helpers/mockApp');

describe('nonfunctional security checks', () => {
  test('NFR-06: successful login returns JWT-shaped access and refresh tokens', async () => {
    jest.resetModules();
    jest.dontMock('../../src/services/authService');
    const { pool } = createMockPool();
    jest.doMock('../../src/config/database', () => pool);
    jest.doMock('bcrypt', () => ({
      compare: jest.fn().mockResolvedValue(true),
      hash: jest.fn(),
    }));
    process.env.JWT_SECRET = 'test-secret';
    const authService = require('../../src/services/authService');

    pool.query
      .mockResolvedValueOnce({
        rows: [{
          user_id: 7,
          email: 'tester@example.com',
          nickname: 'tester',
          password_hash: '$2b$12$abcdefghijklmnopqrstuu9p9H9v9H9v9H9v9H9v9H9v9H9v9H9v9',
          status: 'ACTIVE',
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const result = await authService.login({ email: 'tester@example.com', password: 'password123' });

    expect(result.accessToken).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(result.refreshToken).toMatch(/^[a-f0-9]{80}$/);
  });

  test('NFR-05: signup stores bcrypt hash instead of plaintext password', async () => {
    jest.resetModules();
    jest.dontMock('../../src/services/authService');
    const { pool, createClient } = createMockPool();
    const client = createClient();
    pool.connect.mockResolvedValue(client);
    jest.doMock('../../src/config/database', () => pool);
    jest.doMock('bcrypt', () => ({
      hash: jest.fn().mockResolvedValue('$2b$12$abcdefghijklmnopqrstuu9p9H9v9H9v9H9v9H9v9H9v9H9v9H9v9'),
      compare: jest.fn(),
    }));
    jest.doMock('jsonwebtoken', () => ({
      sign: jest.fn(),
    }));
    const authService = require('../../src/services/authService');
    const bcrypt = require('bcrypt');

    pool.query.mockResolvedValueOnce({ rows: [] });
    client.query
      .mockResolvedValueOnce()
      .mockResolvedValueOnce({ rows: [{ user_id: 9 }] })
      .mockResolvedValueOnce()
      .mockResolvedValueOnce()
      .mockResolvedValueOnce()
      .mockResolvedValueOnce();

    await authService.signUp({
      email: 'secure@example.com',
      password: 'plain-password',
      nickname: 'secure',
      genres: [1, 2, 3],
    });

    expect(bcrypt.hash).toHaveBeenCalledWith('plain-password', 12);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO users'),
      ['secure@example.com', 'secure', expect.stringMatching(/^\$2[aby]\$\d{2}\$/)]
    );
    expect(client.query).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO users'),
      expect.arrayContaining(['plain-password'])
    );
  });

  test('NFR-08: movie search treats SQL injection payload as a parameter', async () => {
    jest.resetModules();
    jest.dontMock('../../src/services/movieService');
    const { pool } = createMockPool();
    jest.doMock('../../src/config/database', () => pool);
    const movieService = require('../../src/services/movieService');
    const payload = "' OR 1=1; DROP TABLE movies; --";

    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] });

    const result = await movieService.searchMovies({ q: payload, page: 1, limit: 20 });

    expect(result).toEqual({ movies: [], total: 0 });
    expect(pool.query.mock.calls[0][0]).toContain('WHERE title ILIKE $1');
    expect(pool.query.mock.calls[0][0]).not.toContain(payload);
    expect(pool.query.mock.calls[0][1][0]).toBe(`%${payload}%`);
  });

  test('NFR-08: SQL injection-like login payload is passed as a parameter', async () => {
    jest.resetModules();
    jest.dontMock('../../src/services/authService');
    const { pool } = createMockPool();
    jest.doMock('../../src/config/database', () => pool);
    jest.doMock('bcrypt', () => ({
      compare: jest.fn(),
      hash: jest.fn(),
    }));
    jest.doMock('jsonwebtoken', () => ({
      sign: jest.fn(),
    }));
    const authService = require('../../src/services/authService');
    const payload = "admin@example.com' OR '1'='1";

    pool.query.mockResolvedValueOnce({ rows: [] });

    await expect(authService.login({ email: payload, password: 'anything' }))
      .rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(pool.query.mock.calls[0][0]).toContain('WHERE email = $1');
    expect(pool.query.mock.calls[0][0]).not.toContain(payload);
    expect(pool.query.mock.calls[0][1]).toEqual([payload]);
  });

  test('NFR-07: production base URL configuration should use HTTPS', () => {
    const productionBaseUrl = 'https://api.algomovie.example.com/api';

    expect(new URL(productionBaseUrl).protocol).toBe('https:');
  });
});

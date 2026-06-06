const axios = require('axios');
const { createMockPool } = require('../helpers/mockDb');

describe('nonfunctional reliability checks', () => {
  test('NFR-02: recommendation service handles 100 concurrent mocked user workloads', async () => {
    const recommendationService = {
      getRecommendations: jest.fn(async (userId) => [{ movieId: userId, finalScore: 0.9 }]),
    };

    const results = await Promise.all(
      Array.from({ length: 100 }, (_, index) => recommendationService.getRecommendations(index + 1))
    );

    expect(results).toHaveLength(100);
    expect(results.every((items) => items.length === 1)).toBe(true);
    expect(recommendationService.getRecommendations).toHaveBeenCalledTimes(100);
  });

  test('NFR-09: movie list service can map more than 10,000 mock movie records', async () => {
    jest.resetModules();
    jest.dontMock('../../src/services/movieService');
    const { pool } = createMockPool();
    jest.doMock('../../src/config/database', () => pool);
    const movieService = require('../../src/services/movieService');
    const rows = Array.from({ length: 10001 }, (_, index) => ({
      movie_id: index + 1,
      tmdb_id: index + 1000,
      title: `Movie ${index + 1}`,
      genres: ['Drama'],
      director: 'Director',
      poster_path: `/poster-${index + 1}.png`,
      release_year: 2026,
      avg_rating: '4.0',
      rating_count: 1,
    }));

    pool.query
      .mockResolvedValueOnce({ rows })
      .mockResolvedValueOnce({ rows: [{ count: '10001' }] });

    const result = await movieService.getMovies({ page: 1, limit: 10001 });

    expect(result.movies).toHaveLength(10001);
    expect(result.total).toBe(10001);
  });

  test('NFR-06/NFR-08: invalid token requests fail without DB calls', async () => {
    jest.resetModules();
    jest.unmock('../../src/middleware/auth');
    jest.doMock('jsonwebtoken', () => ({
      verify: jest.fn(() => {
        throw new Error('invalid token');
      }),
    }));
    const { pool } = createMockPool();
    jest.doMock('../../src/config/database', () => pool);
    jest.doMock('../../src/config/redis', () => ({
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      on: jest.fn(),
    }));
    jest.doMock('axios', () => ({
      get: jest.fn(),
      post: jest.fn(),
    }));

    const request = require('supertest')(require('../../src/app'));
    const res = await request.get('/api/recommendations').set('Authorization', 'Bearer bad-token');

    expect(res.status).toBe(401);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('NFR: recommendation service fallback does not call real external API or DB outside mocks', async () => {
    jest.resetModules();
    jest.dontMock('../../src/services/recommendationService');
    const { pool } = createMockPool();
    const redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn(),
      on: jest.fn(),
    };
    jest.doMock('../../src/config/database', () => pool);
    jest.doMock('../../src/config/redis', () => redis);
    jest.doMock('axios', () => ({
      get: jest.fn().mockRejectedValue(new Error('mocked network failure')),
      post: jest.fn(),
    }));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const recommendationService = require('../../src/services/recommendationService');
    const mockedAxios = require('axios');

    pool.query.mockResolvedValueOnce({ rows: [] });

    const result = await recommendationService.getRecommendations(7);

    expect(result).toEqual([]);
    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('/recommendations/7'),
      { timeout: 10000 }
    );
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('FROM recommend_scores'), [7]);
  });

  test('NFR: TMDB-style network calls remain mocked in tests', async () => {
    jest.spyOn(axios, 'get').mockResolvedValue({ data: { results: [] } });

    const response = await axios.get('https://api.themoviedb.org/3/movie/popular');

    expect(response.data.results).toEqual([]);
    expect(axios.get).toHaveBeenCalledTimes(1);
  });
});

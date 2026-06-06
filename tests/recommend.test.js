const { createMockPool } = require('./helpers/mockDb');
const { loadAppWithMockAuth } = require('./helpers/mockApp');

describe('recommendation API integration (FR-27~FR-51)', () => {
  let request;
  let recommendationService;

  beforeEach(() => {
    jest.resetModules();
    recommendationService = { getRecommendations: jest.fn() };
    jest.doMock('../src/services/recommendationService', () => recommendationService);
    request = loadAppWithMockAuth();
  });

  test('authenticated user receives recommendations sorted by score', async () => {
    recommendationService.getRecommendations.mockResolvedValue([
      { movieId: 2, finalScore: 0.9 },
      { movieId: 1, finalScore: 0.7 },
    ]);

    const res = await request.get('/api/recommendations').set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body.recommendations.map((m) => m.finalScore)).toEqual([0.9, 0.7]);
    expect(recommendationService.getRecommendations).toHaveBeenCalledWith(7);
  });
});

describe('recommendation service unit tests (FR-27~FR-51)', () => {
  let pool;
  let redis;
  let axios;
  let recommendationService;

  beforeEach(() => {
    jest.resetModules();
    jest.dontMock('../src/services/recommendationService');
    ({ pool } = createMockPool());
    redis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      on: jest.fn(),
    };
    jest.doMock('../src/config/database', () => pool);
    jest.doMock('../src/config/redis', () => redis);
    jest.doMock('axios', () => ({ get: jest.fn() }));
    recommendationService = require('../src/services/recommendationService');
    axios = require('axios');
  });

  test('returns cached recommendations without external service call', async () => {
    redis.get.mockResolvedValue(JSON.stringify([{ movieId: 1, finalScore: 0.8 }]));

    const result = await recommendationService.getRecommendations(7);

    expect(result).toEqual([{ movieId: 1, finalScore: 0.8 }]);
    expect(axios.get).not.toHaveBeenCalled();
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('calls Python recommendation service and caches top recommendations', async () => {
    redis.get.mockResolvedValue(null);
    axios.get.mockResolvedValue({
      data: {
        recommendations: Array.from({ length: 30 }, (_, i) => ({
          movieId: i + 1,
          finalScore: 1 - i / 100,
        })),
      },
    });

    const result = await recommendationService.getRecommendations(7);

    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('/recommendations/7'),
      { timeout: 10000 }
    );
    expect(result).toHaveLength(30);
    expect(redis.set).toHaveBeenCalledWith(
      'recommendations:7',
      JSON.stringify(result),
      'EX',
      3600
    );
  });

  test('falls back to DB when Python recommendation service fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    redis.get.mockResolvedValue(null);
    axios.get.mockRejectedValue(new Error('service unavailable'));
    pool.query.mockResolvedValueOnce({
      rows: [{
        movie_id: 2,
        title: 'Fallback Movie',
        poster_path: '/poster.png',
        avg_rating: '4.0',
        genres: ['Drama'],
        final_score: 0.75,
        cf_score: 0.8,
        content_score: 0.7,
        popularity_score: 0.1,
      }],
    });

    const result = await recommendationService.getRecommendations(7);

    expect(pool.query.mock.calls[0][0]).toContain('ORDER BY rs.final_score DESC');
    expect(pool.query.mock.calls[0][0]).toContain('LIMIT 30');
    expect(result[0]).toMatchObject({
      movieId: 2,
      finalScore: 0.75,
      cfScore: 0.8,
      contentScore: 0.7,
      popularityScore: 0.1,
    });
  });
});

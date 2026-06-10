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
    recommendationService.getRecommendations.mockResolvedValue({
      recommendations: [
        { movieId: 2, finalScore: 0.9 },
        { movieId: 1, finalScore: 0.7 },
      ],
      weights: { alpha: 0.5, beta: 0.5, gamma: 0 },
      fromCache: false,
      isNewUser: false,
    });

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
    pool.query
      .mockResolvedValueOnce({ rows: [{ cnt: 5 }] })
      .mockResolvedValueOnce({ rows: [] });
    redis.get.mockResolvedValue(JSON.stringify({
      recommendations: [{ movieId: 1, finalScore: 0.8 }],
      weights: { alpha: 0.5, beta: 0.5, gamma: 0 },
      fromCache: false,
      isNewUser: false,
    }));

    const result = await recommendationService.getRecommendations(7);

    expect(result.recommendations).toEqual([{ movieId: 1, finalScore: 0.8 }]);
    expect(result.fromCache).toBe(true);
    expect(axios.get).not.toHaveBeenCalled();
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  test('calls Python recommendation service and caches top recommendations', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ cnt: 20 }] })
      .mockResolvedValueOnce({ rows: [] });
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

    expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('/recommendations/7'), {
      timeout: 2500,
    });
    expect(result.recommendations).toHaveLength(30);
    expect(redis.set).toHaveBeenCalledWith('recommendations:7', JSON.stringify(result), 'EX', 3600);
  });

  test('falls back to DB when Python recommendation service fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    redis.get.mockResolvedValue(null);
    axios.get.mockRejectedValue(new Error('service unavailable'));
    pool.query
      .mockResolvedValueOnce({ rows: [{ cnt: 5 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
      rows: [
        {
          movie_id: 2,
          title: 'Fallback Movie',
          poster_path: '/poster.png',
          avg_rating: '4.0',
          genres: ['Drama'],
          final_score: 0.75,
          cf_score: 0.8,
          content_score: 0.7,
          popularity_score: 0.1,
        },
      ],
    });

    const result = await recommendationService.getRecommendations(7);

    expect(pool.query.mock.calls[2][0]).toContain('ORDER BY rs.final_score DESC');
    expect(pool.query.mock.calls[2][0]).toContain('LIMIT 30');
    expect(result.recommendations[0]).toMatchObject({
      movieId: 2,
      finalScore: 0.75,
      cfScore: 0.8,
      contentScore: 0.7,
      popularityScore: 0.1,
    });
  });

  test('uses an empty recommendation list when the external service omits data', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ cnt: 5 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] });
    redis.get.mockResolvedValue(null);
    axios.get.mockResolvedValue({ data: {} });

    const result = await recommendationService.getRecommendations(7);

    expect(result.recommendations).toEqual([]);
    expect(redis.set).toHaveBeenCalledWith('recommendations:7', JSON.stringify(result), 'EX', 3600);
  });

  test('continues when redis get and set fail around a successful API call', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    redis.get.mockRejectedValue(new Error('cache read failed'));
    redis.set.mockRejectedValue(new Error('cache write failed'));
    axios.get.mockResolvedValue({ data: { recommendations: [{ movieId: 3 }] } });
    pool.query
      .mockResolvedValueOnce({ rows: [{ cnt: 5 }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await recommendationService.getRecommendations(7);

    expect(result.recommendations).toEqual([
      expect.objectContaining({ movieId: 3 }),
    ]);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Redis get'),
      'cache read failed'
    );
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Redis set'),
      'cache write failed'
    );
  });

  test('DB fallback maps unrated recommendation rows with default genres', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    redis.get.mockResolvedValue(null);
    axios.get.mockRejectedValue(new Error('service unavailable'));
    pool.query
      .mockResolvedValueOnce({ rows: [{ cnt: 5 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
      rows: [
        {
          movie_id: 2,
          title: 'Fallback Movie',
          poster_path: null,
          avg_rating: null,
          genres: null,
          final_score: 0.75,
          cf_score: 0.8,
          content_score: 0.7,
          popularity_score: 0.1,
        },
      ],
    });

    const result = await recommendationService.getRecommendations(7);

    expect(result.recommendations[0]).toMatchObject({
      movieId: 2,
      avgRating: 0,
      genres: [],
    });
  });
});

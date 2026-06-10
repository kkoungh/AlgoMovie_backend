const { performance } = require('perf_hooks');
const { createMockPool } = require('../helpers/mockDb');
const { loadAppWithMockAuth } = require('../helpers/mockApp');

describe('nonfunctional performance checks', () => {
  test('NFR-01: recommendation API responds within 3 seconds with mocked service data', async () => {
    jest.resetModules();
    const recommendationService = {
      getRecommendations: jest
        .fn()
        .mockResolvedValue({
          recommendations: [{ movieId: 1, title: 'Fast Recommendation', finalScore: 0.99 }],
          weights: { alpha: 0.5, beta: 0.5, gamma: 0 },
          fromCache: false,
          isNewUser: false,
        }),
    };
    jest.doMock('../../src/services/recommendationService', () => recommendationService);
    const request = loadAppWithMockAuth();

    const startedAt = performance.now();
    const res = await request.get('/api/recommendations').set('Authorization', 'Bearer test-token');
    const elapsedMs = performance.now() - startedAt;

    expect(res.status).toBe(200);
    expect(res.body.recommendations).toHaveLength(1);
    expect(elapsedMs).toBeLessThan(3000);
  });

  test.each([
    ['movie list', 'get', '/api/movies'],
    ['search', 'get', '/api/movies/search?q=Inception'],
    ['rating write', 'post', '/api/ratings'],
  ])(
    'NFR-01/NFR-04: %s API responds below threshold with mocked dependencies',
    async (_, method, path) => {
      jest.resetModules();
      const movieService = {
        getMovies: jest.fn().mockResolvedValue({ movies: [], total: 0, page: 1, limit: 20 }),
        searchMovies: jest.fn().mockResolvedValue({ movies: [], total: 0 }),
        getPopularMovies: jest.fn(),
        getMovieDetail: jest.fn(),
        getSimilarMovies: jest.fn(),
        getGenres: jest.fn(),
      };
      const ratingService = {
        writeRating: jest.fn().mockResolvedValue({ ratingId: 1 }),
      };
      jest.doMock('../../src/services/movieService', () => movieService);
      jest.doMock('../../src/services/ratingService', () => ratingService);
      const request = loadAppWithMockAuth();

      const startedAt = performance.now();
      const res =
        method === 'post'
          ? await request[method](path)
              .set('Authorization', 'Bearer test-token')
              .send({ movieId: 1, score: 5 })
          : await request[method](path).set('Authorization', 'Bearer test-token');
      const elapsedMs = performance.now() - startedAt;

      expect([200, 201]).toContain(res.status);
      expect(elapsedMs).toBeLessThan(1000);
    }
  );

  test('NFR-04: movie service DB query path completes within 1 second with mock DB', async () => {
    jest.resetModules();
    jest.dontMock('../../src/services/movieService');
    const { pool } = createMockPool();
    jest.doMock('../../src/config/database', () => pool);
    const movieService = require('../../src/services/movieService');

    pool.query
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ rows: [] }), 10);
          })
      )
      .mockResolvedValueOnce({ rows: [{ count: '0' }] });

    const startedAt = performance.now();
    const result = await movieService.getMovies({ page: 1, limit: 20 });
    const elapsedMs = performance.now() - startedAt;

    expect(result.movies).toEqual([]);
    expect(elapsedMs).toBeLessThan(1000);
  });
});

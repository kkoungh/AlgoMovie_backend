const { createMockPool } = require('./helpers/mockDb');
const { loadAppWithMockAuth } = require('./helpers/mockApp');

describe('rating API integration (FR-52~FR-57)', () => {
  let request;
  let ratingService;

  beforeEach(() => {
    jest.resetModules();
    ratingService = { writeRating: jest.fn() };
    jest.doMock('../src/services/ratingService', () => ratingService);
    request = loadAppWithMockAuth();
  });

  test('logged-in user can save a 1~5 star rating with review', async () => {
    ratingService.writeRating.mockResolvedValue({ ratingId: 100 });

    const res = await request.post('/api/ratings')
      .set('Authorization', 'Bearer test-token')
      .send({ movieId: 10, score: 5, review: 'excellent' });

    expect(res.status).toBe(201);
    expect(res.body.ratingId).toBe(100);
    expect(ratingService.writeRating).toHaveBeenCalledWith({
      userId: 7,
      movieId: 10,
      score: 5,
      review: 'excellent',
    });
  });

  test('missing movie id is blocked before storing a rating', async () => {
    const res = await request.post('/api/ratings')
      .set('Authorization', 'Bearer test-token')
      .send({ score: 4 });

    expect(res.status).toBe(422);
    expect(ratingService.writeRating).not.toHaveBeenCalled();
  });
});

describe('rating service unit tests (FR-52~FR-57)', () => {
  let pool;
  let redis;
  let axios;
  let ratingService;

  beforeEach(() => {
    jest.resetModules();
    jest.dontMock('../src/services/ratingService');
    ({ pool } = createMockPool());
    redis = { del: jest.fn().mockResolvedValue(1), on: jest.fn() };
    jest.doMock('../src/config/database', () => pool);
    jest.doMock('../src/config/redis', () => redis);
    jest.doMock('axios', () => ({ post: jest.fn().mockResolvedValue({ data: {} }) }));
    ratingService = require('../src/services/ratingService');
    axios = require('axios');
  });

  test('rating without review is stored with null review', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ rating_id: 101 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await ratingService.writeRating({
      userId: 7,
      movieId: 10,
      score: 4,
    });

    expect(result).toEqual({ ratingId: 101 });
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO ratings'),
      [7, 10, 4, null]
    );
  });

  test('rating score is required and must be between 1 and 5', async () => {
    await expect(ratingService.writeRating({ userId: 7, movieId: 10 }))
      .rejects.toMatchObject({ status: 422, code: 'VALIDATION_ERROR' });
    await expect(ratingService.writeRating({ userId: 7, movieId: 10, score: 0 }))
      .rejects.toMatchObject({ status: 422, code: 'VALIDATION_ERROR' });
    await expect(ratingService.writeRating({ userId: 7, movieId: 10, score: -1 }))
      .rejects.toMatchObject({ status: 422, code: 'VALIDATION_ERROR' });
    await expect(ratingService.writeRating({ userId: 7, movieId: 10, score: 6 }))
      .rejects.toMatchObject({ status: 422, code: 'VALIDATION_ERROR' });
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('duplicate rating by same user and movie is blocked', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ rating_id: 1 }] });

    await expect(ratingService.writeRating({ userId: 7, movieId: 10, score: 5 }))
      .rejects.toMatchObject({ status: 409, code: 'DUPLICATE' });
  });

  test('saving a rating stores userId, movieId, rating, review and refreshes recommendation cache', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ rating_id: 101 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await ratingService.writeRating({ userId: 7, movieId: 10, score: 5, review: 'great' });
    await new Promise((resolve) => setImmediate(resolve));

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO ratings'),
      [7, 10, 5, 'great']
    );
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/recommendations/update/7'),
      {},
      { timeout: 30000 }
    );
    expect(redis.del).toHaveBeenCalledWith('recommendations:7');
  });
});

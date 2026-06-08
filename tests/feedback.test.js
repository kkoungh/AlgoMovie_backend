const { createMockPool } = require('./helpers/mockDb');
const { loadAppWithMockAuth } = require('./helpers/mockApp');

describe('feedback API integration (FR-58~FR-61)', () => {
  let request;
  let feedbackService;

  beforeEach(() => {
    jest.resetModules();
    feedbackService = { submitFeedback: jest.fn() };
    jest.doMock('../src/services/feedbackService', () => feedbackService);
    request = loadAppWithMockAuth();
  });

  test('logged-in user can save satisfied recommendation feedback', async () => {
    feedbackService.submitFeedback.mockResolvedValue();

    const res = await request
      .post('/api/feedback')
      .set('Authorization', 'Bearer test-token')
      .send({ movieId: 10, type: 'LIKE' });

    expect(res.status).toBe(200);
    expect(feedbackService.submitFeedback).toHaveBeenCalledWith({
      userId: 7,
      movieId: 10,
      type: 'LIKE',
    });
  });
});

describe('feedback service unit tests (FR-58~FR-61)', () => {
  let pool;
  let redis;
  let feedbackService;

  beforeEach(() => {
    jest.resetModules();
    jest.dontMock('../src/services/feedbackService');
    ({ pool } = createMockPool());
    redis = { del: jest.fn().mockResolvedValue(1), on: jest.fn() };
    jest.doMock('../src/config/database', () => pool);
    jest.doMock('../src/config/redis', () => redis);
    feedbackService = require('../src/services/feedbackService');
  });

  test('LIKE feedback is stored as positive feedback', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    await feedbackService.submitFeedback({ userId: 7, movieId: 10, type: 'LIKE' });

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO feedback'),
      [7, 10, 1]
    );
    expect(redis.del).not.toHaveBeenCalled();
  });

  test('DISLIKE feedback is stored and invalidates recommendations so it can be excluded', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    await feedbackService.submitFeedback({ userId: 7, movieId: 10, type: 'DISLIKE' });

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (user_id, movie_id) DO UPDATE'),
      [7, 10, 0]
    );
    expect(redis.del).toHaveBeenCalledWith('recommendations:7');
  });

  test('invalid feedback type is blocked', async () => {
    await expect(
      feedbackService.submitFeedback({ userId: 7, movieId: 10, type: 'NOPE' })
    ).rejects.toMatchObject({ status: 422, code: 'VALIDATION_ERROR' });
  });
});

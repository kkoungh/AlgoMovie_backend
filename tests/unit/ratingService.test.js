jest.mock('../../src/config/database');
jest.mock('../../src/config/redis', () => ({ del: jest.fn().mockResolvedValue(1) }));
jest.mock('axios');

const pool  = require('../../src/config/database');
const ratingService = require('../../src/services/ratingService');

beforeEach(() => jest.clearAllMocks());

describe('ratingService.writeRating', () => {
  test('평점이 1 미만이면 VALIDATION_ERROR를 던진다', async () => {
    await expect(
      ratingService.writeRating({ userId: 1, movieId: 1, score: 0.5 })
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  test('평점이 5 초과면 VALIDATION_ERROR를 던진다', async () => {
    await expect(
      ratingService.writeRating({ userId: 1, movieId: 1, score: 6 })
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  test('이미 평가한 영화면 DUPLICATE를 던진다', async () => {
    pool.query = jest.fn().mockResolvedValueOnce({ rows: [{ rating_id: 99 }] });
    await expect(
      ratingService.writeRating({ userId: 1, movieId: 1, score: 4 })
    ).rejects.toMatchObject({ code: 'DUPLICATE' });
  });

  test('정상 평가 시 ratingId를 반환한다', async () => {
    pool.query = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ rating_id: 10 }] })
      .mockResolvedValue({});

    const result = await ratingService.writeRating({ userId: 1, movieId: 1, score: 4, review: '좋아요' });
    expect(result).toHaveProperty('ratingId', 10);
  });
});

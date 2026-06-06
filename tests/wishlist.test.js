const { createMockPool } = require('./helpers/mockDb');
const { loadAppWithMockAuth } = require('./helpers/mockApp');

describe('wishlist API integration (FR-62~FR-64)', () => {
  let request;
  let wishlistService;

  beforeEach(() => {
    jest.resetModules();
    wishlistService = {
      toggleWishlist: jest.fn(),
      getWishlist: jest.fn(),
    };
    jest.doMock('../src/services/wishlistService', () => wishlistService);
    request = loadAppWithMockAuth();
  });

  test('wishlist add request delegates to authenticated user', async () => {
    wishlistService.toggleWishlist.mockResolvedValue({ added: true });

    const res = await request.post('/api/wishlist/10').set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body.added).toBe(true);
    expect(wishlistService.toggleWishlist).toHaveBeenCalledWith(7, 10);
  });

  test('mypage wishlist returns wishlist items', async () => {
    wishlistService.getWishlist.mockResolvedValue([
      { addedAt: '2026-06-01', movie: { movieId: 10, title: 'Movie' } },
    ]);

    const res = await request.get('/api/mypage/wishlist').set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body.wishlist).toHaveLength(1);
  });
});

describe('wishlist service unit tests (FR-62~FR-64)', () => {
  let pool;
  let wishlistService;

  beforeEach(() => {
    jest.resetModules();
    jest.dontMock('../src/services/wishlistService');
    ({ pool } = createMockPool());
    jest.doMock('../src/config/database', () => pool);
    wishlistService = require('../src/services/wishlistService');
  });

  test('adds movie when wishlist item does not exist', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await wishlistService.toggleWishlist(7, 10);

    expect(result.added).toBe(true);
    expect(pool.query).toHaveBeenCalledWith(
      'INSERT INTO wishlist (user_id, movie_id) VALUES ($1, $2)',
      [7, 10]
    );
  });

  test('duplicate wishlist add toggles item off', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ wishlist_id: 1 }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await wishlistService.toggleWishlist(7, 10);

    expect(result.added).toBe(false);
    expect(pool.query).toHaveBeenCalledWith(
      'DELETE FROM wishlist WHERE user_id = $1 AND movie_id = $2',
      [7, 10]
    );
  });

  test('getWishlist maps newest wishlist movies', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{
        added_at: '2026-06-02',
        movie_id: 10,
        title: 'Movie',
        poster_path: '/poster.png',
        avg_rating: '4.4',
        genres: ['Drama'],
      }],
    });

    const result = await wishlistService.getWishlist(7);

    expect(pool.query.mock.calls[0][0]).toContain('ORDER BY w.added_at DESC');
    expect(result[0]).toMatchObject({
      addedAt: '2026-06-02',
      movie: { movieId: 10, title: 'Movie', avgRating: 4.4, genres: ['Drama'] },
    });
  });
});

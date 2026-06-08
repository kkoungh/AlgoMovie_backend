const { createMockPool } = require('./helpers/mockDb');
const { loadAppWithMockAuth } = require('./helpers/mockApp');

describe('view history integration and service behavior (FR-65~FR-70)', () => {
  let pool;
  let request;

  beforeEach(() => {
    jest.resetModules();
    ({ pool } = createMockPool());
    jest.doMock('../src/config/database', () => pool);
    request = loadAppWithMockAuth({ pool });
  });

  test('authenticated movie detail view stores history and trims it to recent 10', async () => {
    pool.query
      .mockResolvedValueOnce({
        rows: [
          {
            movie_id: 10,
            tmdb_id: 100,
            title: 'Movie',
            genres: ['Drama'],
            director: 'Director',
            poster_path: '/poster.png',
            release_year: 2026,
            avg_rating: '4.0',
            rating_count: 1,
            cast_members: ['Actor'],
            overview: 'Overview',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request.get('/api/movies/10').set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO view_history'),
      [7, 10]
    );
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('LIMIT 10'), [7]);
  });

  test('recent view history returns max 10 movies in viewed time order', async () => {
    pool.query.mockResolvedValueOnce({
      rows: Array.from({ length: 10 }, (_, i) => ({
        viewed_at: `2026-06-${String(10 - i).padStart(2, '0')}`,
        movie_id: i + 1,
        title: `Movie ${i + 1}`,
        poster_path: null,
        avg_rating: '4.0',
        genres: ['Drama'],
      })),
    });

    const res = await request.get('/api/mypage/history').set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body.history).toHaveLength(10);
    expect(pool.query.mock.calls[0][0]).toContain('ORDER BY vh.viewed_at DESC');
    expect(pool.query.mock.calls[0][0]).toContain('LIMIT 10');
  });
});

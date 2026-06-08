const { createMockPool } = require('./helpers/mockDb');
const { loadAppWithMockAuth } = require('./helpers/mockApp');

describe('profile API integration (FR-07~FR-10)', () => {
  let request;
  let userService;
  let ratingService;

  beforeEach(() => {
    jest.resetModules();
    userService = {
      getProfile: jest.fn(),
      updateProfile: jest.fn(),
    };
    ratingService = {
      getMyRatings: jest.fn(),
    };
    jest.doMock('../src/services/userService', () => userService);
    jest.doMock('../src/services/ratingService', () => ratingService);
    request = loadAppWithMockAuth();
  });

  test('mypage basic profile returns user account information', async () => {
    userService.getProfile.mockResolvedValue({
      userId: 7,
      email: 'tester@example.com',
      nickname: 'tester',
      profileImageUrl: '/profiles/test.png',
      ratingCount: 12,
      preferredGenres: [{ genreId: 1, name: 'Action' }],
    });

    const res = await request.get('/api/users/me').set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      userId: 7,
      email: 'tester@example.com',
      nickname: 'tester',
      ratingCount: 12,
    });
  });

  test('nickname and profile fields can be updated', async () => {
    userService.updateProfile.mockResolvedValue({
      userId: 7,
      email: 'tester@example.com',
      nickname: 'renamed',
      profileImageUrl: '/profiles/new.png',
    });

    const res = await request.patch('/api/users/me')
      .set('Authorization', 'Bearer test-token')
      .send({ nickname: 'renamed', profileImageUrl: '/profiles/new.png' });

    expect(res.status).toBe(200);
    expect(userService.updateProfile).toHaveBeenCalledWith(7, {
      nickname: 'renamed',
      profileImageUrl: '/profiles/new.png',
    });
    expect(res.body.nickname).toBe('renamed');
  });

  test('my reviews endpoint returns ratings written by the user', async () => {
    ratingService.getMyRatings.mockResolvedValue([
      { ratingId: 2, score: 5, createdAt: '2026-06-02', movie: { movieId: 20, title: 'B' } },
      { ratingId: 1, score: 4, createdAt: '2026-06-01', movie: { movieId: 10, title: 'A' } },
    ]);

    const res = await request.get('/api/mypage/reviews').set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body.reviews).toHaveLength(2);
    expect(res.body.reviews[0].createdAt).toBe('2026-06-02');
  });
});

describe('profile service unit tests (FR-07~FR-10)', () => {
  let pool;
  let userService;
  let ratingService;

  beforeEach(() => {
    jest.resetModules();
    jest.dontMock('../src/services/userService');
    jest.dontMock('../src/services/ratingService');
    ({ pool } = createMockPool());
    jest.doMock('../src/config/database', () => pool);
    userService = require('../src/services/userService');
    ratingService = require('../src/services/ratingService');
  });

  test('getProfile maps account and preferred genre fields', async () => {
    pool.query
      .mockResolvedValueOnce({
        rows: [{
          user_id: 7,
          email: 'tester@example.com',
          nickname: 'tester',
          profile_image_url: null,
          rating_count: 3,
        }],
      })
      .mockResolvedValueOnce({
        rows: [{ genre_id: 1, name: 'Action' }, { genre_id: 2, name: 'Drama' }],
      });

    const profile = await userService.getProfile(7);

    expect(profile).toMatchObject({
      userId: 7,
      email: 'tester@example.com',
      nickname: 'tester',
      ratingCount: 3,
      preferredGenres: [{ genreId: 1, name: 'Action' }, { genreId: 2, name: 'Drama' }],
    });
  });

  test('getProfile rejects when the active user does not exist', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    await expect(userService.getProfile(404))
      .rejects.toMatchObject({ status: 404, code: 'USER_NOT_FOUND' });
  });

  test('updateProfile rejects empty profile changes', async () => {
    await expect(userService.updateProfile(7, {}))
      .rejects.toMatchObject({ status: 422, code: 'VALIDATION_ERROR' });
  });

  test('updateProfile can update only a nickname', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          user_id: 7,
          email: 'tester@example.com',
          nickname: 'nickname-only',
          profile_image_url: null,
          rating_count: 0,
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const profile = await userService.updateProfile(7, { nickname: 'nickname-only' });

    expect(pool.query.mock.calls[0][0]).toContain('nickname = $1');
    expect(pool.query.mock.calls[0][0]).not.toContain('profile_image_url');
    expect(pool.query.mock.calls[0][1]).toEqual(['nickname-only', 7]);
    expect(profile.nickname).toBe('nickname-only');
  });

  test('updateProfile can update only a profile image URL', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          user_id: 7,
          email: 'tester@example.com',
          nickname: 'tester',
          profile_image_url: '/profiles/only.png',
          rating_count: 0,
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const profile = await userService.updateProfile(7, { profileImageUrl: '/profiles/only.png' });

    expect(pool.query.mock.calls[0][0]).toContain('profile_image_url = $1');
    expect(pool.query.mock.calls[0][0]).not.toContain('nickname =');
    expect(pool.query.mock.calls[0][1]).toEqual(['/profiles/only.png', 7]);
    expect(profile.profileImageUrl).toBe('/profiles/only.png');
  });

  test('getMyRatings requests newest ratings first and maps movie data', async () => {
    const newer = new Date('2026-06-02T00:00:00Z');
    pool.query.mockResolvedValueOnce({
      rows: [{
        rating_id: 2,
        score: 5,
        review: 'great',
        created_at: newer,
        movie_id: 20,
        title: 'Newer Movie',
        poster_path: '/poster.png',
        avg_rating: '4.5',
      }],
    });

    const reviews = await ratingService.getMyRatings(7);

    expect(pool.query.mock.calls[0][0]).toContain('ORDER BY r.created_at DESC');
    expect(reviews[0]).toMatchObject({
      ratingId: 2,
      score: 5,
      createdAt: newer,
      movie: { movieId: 20, title: 'Newer Movie', avgRating: 4.5 },
    });
  });
});

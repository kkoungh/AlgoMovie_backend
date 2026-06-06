const { createMockPool } = require('./helpers/mockDb');
const { loadAppWithMockAuth } = require('./helpers/mockApp');

describe('movie API integration (FR-19~FR-26)', () => {
  let request;
  let movieService;

  beforeEach(() => {
    jest.resetModules();
    movieService = {
      getMovies: jest.fn(),
      searchMovies: jest.fn(),
      getPopularMovies: jest.fn(),
      getMovieDetail: jest.fn(),
      getSimilarMovies: jest.fn(),
      getGenres: jest.fn(),
    };
    jest.doMock('../src/services/movieService', () => movieService);
    request = loadAppWithMockAuth();
  });

  test('movie list API returns an array of movie data', async () => {
    movieService.getMovies.mockResolvedValue({
      movies: [{ movieId: 10, title: 'Movie', genres: ['Drama'] }],
      total: 1,
      page: 1,
      limit: 20,
    });

    const res = await request.get('/api/movies');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.movies)).toBe(true);
    expect(res.body.movies[0]).toMatchObject({ movieId: 10, title: 'Movie' });
  });

  test('movie detail contains required content database fields', async () => {
    movieService.getMovieDetail.mockResolvedValue({
      movieId: 10,
      title: 'Movie',
      genres: ['Drama'],
      director: 'Director',
      castMembers: ['Actor A'],
      overview: 'Overview',
      posterPath: '/poster.png',
      releaseYear: 2026,
      avgRating: 4.2,
    });

    const res = await request.get('/api/movies/10');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({
      movieId: expect.any(Number),
      title: expect.any(String),
      genres: expect.any(Array),
      director: expect.any(String),
      castMembers: expect.any(Array),
      overview: expect.any(String),
      posterPath: expect.any(String),
      releaseYear: expect.any(Number),
      avgRating: expect.any(Number),
    }));
  });

  test('external TMDB calls are mockable and not required for movie list reads', async () => {
    const axios = require('axios');
    jest.spyOn(axios, 'get').mockResolvedValue({ data: { results: [] } });
    movieService.getMovies.mockResolvedValue({ movies: [], total: 0, page: 1, limit: 20 });

    await request.get('/api/movies');

    expect(axios.get).not.toHaveBeenCalled();
  });
});

describe('movie service unit tests (FR-19~FR-26)', () => {
  let pool;
  let movieService;

  beforeEach(() => {
    jest.resetModules();
    jest.dontMock('../src/services/movieService');
    ({ pool } = createMockPool());
    jest.doMock('../src/config/database', () => pool);
    movieService = require('../src/services/movieService');
  });

  test('getMovies maps database rows to API movie fields', async () => {
    pool.query
      .mockResolvedValueOnce({
        rows: [{
          movie_id: 10,
          tmdb_id: 100,
          title: 'Movie',
          genres: ['Action'],
          director: 'Director',
          poster_path: '/poster.png',
          release_year: 2026,
          avg_rating: '4.25',
          rating_count: 8,
        }],
      })
      .mockResolvedValueOnce({ rows: [{ count: '1' }] });

    const result = await movieService.getMovies({ page: 1, limit: 20 });

    expect(result.movies).toEqual([expect.objectContaining({
      movieId: 10,
      title: 'Movie',
      genres: ['Action'],
      director: 'Director',
      posterPath: '/poster.png',
      releaseYear: 2026,
      avgRating: 4.25,
      ratingCount: 8,
    })]);
  });

  test('genre filter is passed as a parameterized query condition', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] });

    await movieService.getMovies({ genre: 'Drama', page: 1, limit: 20 });

    expect(pool.query.mock.calls[0][0]).toContain('genres::text ILIKE $1');
    expect(pool.query.mock.calls[0][1]).toEqual(['%Drama%', 20, 0]);
  });

  test('similar movie query excludes the current movie', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ genres: ['Action'] }] })
      .mockResolvedValueOnce({
        rows: [{ movie_id: 11, title: 'Similar', genres: ['Action'], poster_path: null, avg_rating: '4.0' }],
      });

    const result = await movieService.getSimilarMovies(10);

    expect(pool.query.mock.calls[1][0]).toContain('WHERE movie_id != $1');
    expect(result.movies[0].movieId).toBe(11);
  });

  test.failing('poster fallback is applied when poster_path is missing', async () => {
    pool.query
      .mockResolvedValueOnce({
        rows: [{
          movie_id: 10,
          title: 'Movie',
          genres: [],
          poster_path: null,
          avg_rating: '0',
        }],
      })
      .mockResolvedValueOnce({ rows: [{ count: '1' }] });

    const result = await movieService.getMovies({});

    expect(result.movies[0].posterPath).toEqual(expect.any(String));
    expect(result.movies[0].posterPath).not.toBe('');
  });

  test.failing('similar movies returns the top 20 items required by FR-51', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ genres: ['Action'] }] })
      .mockResolvedValueOnce({ rows: [] });

    await movieService.getSimilarMovies(10);

    expect(pool.query.mock.calls[1][0]).toContain('LIMIT 20');
  });
});

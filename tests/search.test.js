const { createMockPool } = require('./helpers/mockDb');
const { loadAppWithMockAuth } = require('./helpers/mockApp');

describe('search, sort and filter API integration', () => {
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

  test('search request returns title-related results', async () => {
    movieService.searchMovies.mockResolvedValue({
      movies: [{ movieId: 10, title: 'Inception' }],
      total: 1,
    });

    const res = await request.get('/api/movies/search?q=incep');

    expect(res.status).toBe(200);
    expect(res.body.movies[0].title).toBe('Inception');
    expect(movieService.searchMovies).toHaveBeenCalledWith({
      q: 'incep',
      page: undefined,
      limit: undefined,
    });
  });

  test('weekly and monthly popular sort requests are accepted', async () => {
    movieService.getPopularMovies.mockResolvedValue({ movies: [] });

    const weekly = await request.get('/api/movies/popular?period=weekly');
    const monthly = await request.get('/api/movies/popular?period=monthly');

    expect(weekly.status).toBe(200);
    expect(monthly.status).toBe(200);
    expect(movieService.getPopularMovies).toHaveBeenNthCalledWith(1, { period: 'weekly' });
    expect(movieService.getPopularMovies).toHaveBeenNthCalledWith(2, { period: 'monthly' });
  });

  test('genre filter request returns filtered movie list', async () => {
    movieService.getMovies.mockResolvedValue({
      movies: [{ movieId: 11, title: 'Drama Movie', genres: ['Drama'] }],
      total: 1,
    });

    const res = await request.get('/api/movies?genre=Drama');

    expect(res.status).toBe(200);
    expect(res.body.movies[0].genres).toContain('Drama');
    expect(movieService.getMovies).toHaveBeenCalledWith({
      genre: 'Drama',
      page: undefined,
      limit: undefined,
    });
  });
});

describe('search service unit tests', () => {
  let pool;
  let movieService;

  beforeEach(() => {
    jest.resetModules();
    jest.dontMock('../src/services/movieService');
    ({ pool } = createMockPool());
    jest.doMock('../src/config/database', () => pool);
    movieService = require('../src/services/movieService');
  });

  test('blank search returns an empty array without querying DB', async () => {
    const result = await movieService.searchMovies({ q: '   ' });

    expect(result).toEqual({ movies: [], total: 0 });
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('no search results returns empty array with total 0', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] });

    const result = await movieService.searchMovies({ q: 'missing', page: 1, limit: 20 });

    expect(result).toEqual({ movies: [], total: 0 });
  });

  test('search uses parameterized title/director/cast query', async () => {
    pool.query
      .mockResolvedValueOnce({
        rows: [{
          movie_id: 10,
          title: 'Inception',
          genres: ['Sci-Fi'],
          director: 'Christopher Nolan',
          poster_path: '/poster.png',
          release_year: 2010,
          avg_rating: '4.8',
          rating_count: 100,
        }],
      })
      .mockResolvedValueOnce({ rows: [{ count: '1' }] });

    const result = await movieService.searchMovies({ q: 'Incep', page: 1, limit: 20 });

    expect(pool.query.mock.calls[0][0]).toContain('WHERE title ILIKE $1');
    expect(pool.query.mock.calls[0][1]).toEqual(['%Incep%', 20, 0]);
    expect(result.movies[0].title).toBe('Inception');
  });

  test('popular sort switches between weekly and monthly windows', async () => {
    pool.query.mockResolvedValue({ rows: [] });

    await movieService.getPopularMovies({ period: 'weekly' });
    await movieService.getPopularMovies({ period: 'monthly' });

    expect(pool.query.mock.calls[0][0]).toContain("INTERVAL '7 days'");
    expect(pool.query.mock.calls[1][0]).toContain("INTERVAL '30 days'");
  });

  test.failing('country filter is implemented for movie list requests', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] });

    await movieService.getMovies({ country: 'KR', page: 1, limit: 20 });

    expect(pool.query.mock.calls[0][0]).toContain('country');
  });
});

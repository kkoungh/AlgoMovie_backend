jest.mock('../../src/config/database');

const pool = require('../../src/config/database');
const movieService = require('../../src/services/movieService');

beforeEach(() => jest.clearAllMocks());

const fakeMovie = {
  movie_id: 1, tmdb_id: 100, title: '테스트 영화',
  genres: ['Action'], director: '홍길동', poster_path: '/img.jpg',
  release_year: 2023, avg_rating: 4.5, rating_count: 100,
  cast_members: [], overview: '줄거리',
};

describe('movieService.getMovies', () => {
  test('영화 목록과 total을 반환한다', async () => {
    pool.query = jest.fn()
      .mockResolvedValueOnce({ rows: [fakeMovie] })
      .mockResolvedValueOnce({ rows: [{ count: '1' }] });

    const result = await movieService.getMovies({});
    expect(result.movies).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.movies[0]).toHaveProperty('movieId', 1);
  });

  test('장르 필터가 있으면 WHERE 절에 포함된다', async () => {
    pool.query = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] });

    await movieService.getMovies({ genre: 'Action' });
    const sql = pool.query.mock.calls[0][0];
    expect(sql).toMatch(/ILIKE/);
  });
});

describe('movieService.searchMovies', () => {
  test('빈 쿼리면 빈 배열을 반환한다', async () => {
    const result = await movieService.searchMovies({ q: '' });
    expect(result.movies).toHaveLength(0);
  });

  test('키워드로 검색 결과를 반환한다', async () => {
    pool.query = jest.fn()
      .mockResolvedValueOnce({ rows: [fakeMovie] })
      .mockResolvedValueOnce({ rows: [{ count: '1' }] });

    const result = await movieService.searchMovies({ q: '테스트' });
    expect(result.movies).toHaveLength(1);
  });
});

describe('movieService.getMovieDetail', () => {
  test('존재하지 않는 영화면 MOVIE_NOT_FOUND를 던진다', async () => {
    pool.query = jest.fn().mockResolvedValueOnce({ rows: [] });
    await expect(movieService.getMovieDetail(999, null))
      .rejects.toMatchObject({ code: 'MOVIE_NOT_FOUND' });
  });

  test('영화 상세 정보를 반환한다', async () => {
    pool.query = jest.fn().mockResolvedValueOnce({ rows: [fakeMovie] });
    const result = await movieService.getMovieDetail(1, null);
    expect(result).toHaveProperty('movieId', 1);
    expect(result).toHaveProperty('overview');
  });
});

describe('movieService.getGenres', () => {
  test('장르 목록을 반환한다', async () => {
    pool.query = jest.fn().mockResolvedValueOnce({
      rows: [{ genre_id: 1, name: 'Action' }, { genre_id: 2, name: 'Comedy' }],
    });
    const result = await movieService.getGenres();
    expect(result.genres).toHaveLength(2);
    expect(result.genres[0]).toHaveProperty('genreId', 1);
  });
});

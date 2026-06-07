jest.mock('../../src/config/database');
jest.mock('../../src/config/redis', () => ({ del: jest.fn() }));

const request = require('supertest');
const app  = require('../../src/app');
const pool = require('../../src/config/database');

beforeEach(() => jest.clearAllMocks());

const fakeMovie = {
  movie_id: 1, tmdb_id: 100, title: '어벤져스',
  genres: ['Action'], director: '루소 형제', poster_path: '/avengers.jpg',
  release_year: 2019, avg_rating: 4.5, rating_count: 500,
  cast_members: [], overview: '히어로들의 이야기',
};

describe('GET /api/movies', () => {
  test('200과 영화 목록을 반환한다', async () => {
    pool.query = jest.fn()
      .mockResolvedValueOnce({ rows: [fakeMovie] })
      .mockResolvedValueOnce({ rows: [{ count: '1' }] });

    const res = await request(app).get('/api/movies');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('movies');
    expect(res.body.movies[0]).toHaveProperty('movieId', 1);
  });

  test('장르 파라미터로 필터링 가능하다', async () => {
    pool.query = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] });

    const res = await request(app).get('/api/movies?genre=Action');
    expect(res.status).toBe(200);
    expect(res.body.movies).toHaveLength(0);
  });
});

describe('GET /api/movies/search', () => {
  test('키워드로 영화를 검색할 수 있다', async () => {
    pool.query = jest.fn()
      .mockResolvedValueOnce({ rows: [fakeMovie] })
      .mockResolvedValueOnce({ rows: [{ count: '1' }] });

    const res = await request(app).get('/api/movies/search?q=어벤져스');
    expect(res.status).toBe(200);
    expect(res.body.movies).toHaveLength(1);
  });
});

describe('GET /api/movies/:id', () => {
  test('존재하지 않는 영화면 404를 반환한다', async () => {
    pool.query = jest.fn().mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/movies/999');
    expect(res.status).toBe(404);
  });

  test('존재하는 영화면 200과 상세 정보를 반환한다', async () => {
    pool.query = jest.fn().mockResolvedValueOnce({ rows: [fakeMovie] });
    const res = await request(app).get('/api/movies/1');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('title', '어벤져스');
  });
});

describe('GET /api/genres', () => {
  test('200과 장르 목록을 반환한다', async () => {
    pool.query = jest.fn().mockResolvedValueOnce({
      rows: [{ genre_id: 1, name: 'Action' }, { genre_id: 2, name: 'Comedy' }],
    });
    const res = await request(app).get('/api/genres');
    expect(res.status).toBe(200);
    expect(res.body.genres).toHaveLength(2);
  });
});

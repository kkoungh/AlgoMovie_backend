const pool  = require('../config/database');
const axios = require('axios');

const TMDB_BASE = process.env.TMDB_BASE_URL || 'https://api.themoviedb.org/3';
const TMDB_KEY  = process.env.TMDB_API_KEY;

const getMovies = async ({ genre, country, page = 1, limit = 20 }) => {
  const offset = (page - 1) * limit;
  const params = [];
  const conditions = [];

  if (genre) {
    params.push(`%${genre}%`);
    conditions.push(`genres::text ILIKE $${params.length}`);
  }
  if (country) {
    params.push(country);
    conditions.push(`origin_country = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  params.push(limit, offset);
  const moviesResult = await pool.query(
    `SELECT movie_id, tmdb_id, title, genres, director, poster_path, release_year, avg_rating, rating_count
     FROM movies ${where}
     ORDER BY avg_rating DESC, rating_count DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const countParams = params.slice(0, params.length - 2);
  const countResult = await pool.query(
    `SELECT COUNT(*) FROM movies ${where}`,
    countParams
  );

  return {
    movies: moviesResult.rows.map(formatMovie),
    total: parseInt(countResult.rows[0].count),
    page: parseInt(page),
    limit: parseInt(limit),
  };
};

const searchMovies = async ({ q, page = 1, limit = 20 }) => {
  if (!q || q.trim() === '') {
    return { movies: [], total: 0 };
  }

  const keyword = `%${q.trim()}%`;
  const offset = (page - 1) * limit;

  const result = await pool.query(
    `SELECT movie_id, tmdb_id, title, genres, director, poster_path, release_year, avg_rating, rating_count
     FROM movies
     WHERE title ILIKE $1
        OR director ILIKE $1
        OR cast_members::text ILIKE $1
     ORDER BY avg_rating DESC
     LIMIT $2 OFFSET $3`,
    [keyword, limit, offset]
  );

  const countResult = await pool.query(
    `SELECT COUNT(*) FROM movies
     WHERE title ILIKE $1 OR director ILIKE $1 OR cast_members::text ILIKE $1`,
    [keyword]
  );

  return {
    movies: result.rows.map(formatMovie),
    total: parseInt(countResult.rows[0].count),
  };
};

const getPopularMovies = async ({ period = 'weekly' }) => {
  // TMDB trending: week / discover popularity for monthly
  let tmdbIds = [];
  try {
    if (period === 'weekly') {
      const res = await axios.get(`${TMDB_BASE}/trending/movie/week`, {
        params: { api_key: TMDB_KEY, language: 'ko-KR' },
        timeout: 8000,
      });
      tmdbIds = (res.data.results || []).map((m) => m.id);
    } else {
      const res = await axios.get(`${TMDB_BASE}/discover/movie`, {
        params: {
          api_key: TMDB_KEY,
          language: 'ko-KR',
          sort_by: 'popularity.desc',
          'vote_count.gte': 50,
        },
        timeout: 8000,
      });
      tmdbIds = (res.data.results || []).map((m) => m.id);
    }
  } catch (_) {}

  // TMDB 결과가 있으면 우리 DB와 tmdb_id로 매칭, 순서 유지
  if (tmdbIds.length > 0) {
    const result = await pool.query(
      `SELECT movie_id, tmdb_id, title, genres, director, poster_path, release_year, avg_rating, rating_count
       FROM movies WHERE tmdb_id = ANY($1)`,
      [tmdbIds]
    );
    const byTmdb = Object.fromEntries(result.rows.map((r) => [r.tmdb_id, r]));
    const ordered = tmdbIds
      .map((id) => byTmdb[id])
      .filter(Boolean)
      .slice(0, 20);
    if (ordered.length >= 5) {
      return { movies: ordered.map(formatMovie) };
    }
  }

  // fallback: avg_rating 기준
  const fallback = await pool.query(
    `SELECT movie_id, tmdb_id, title, genres, director, poster_path, release_year, avg_rating, rating_count
     FROM movies ORDER BY avg_rating DESC, rating_count DESC LIMIT 20`
  );
  return { movies: fallback.rows.map(formatMovie) };
};

const getMovieDetail = async (movieId, userId) => {
  const result = await pool.query(`SELECT * FROM movies WHERE movie_id = $1`, [movieId]);
  if (result.rows.length === 0) {
    const err = new Error('영화를 찾을 수 없습니다.');
    err.status = 404;
    err.code = 'MOVIE_NOT_FOUND';
    throw err;
  }

  const movie = result.rows[0];

  // 조회 이력 저장 (로그인 상태)
  if (userId) {
    await pool.query(
      `INSERT INTO view_history (user_id, movie_id, viewed_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id, movie_id) DO UPDATE SET viewed_at = NOW()`,
      [userId, movieId]
    );

    // 최근 10개 초과 시 오래된 기록 삭제
    await pool.query(
      `DELETE FROM view_history
       WHERE user_id = $1
         AND history_id NOT IN (
           SELECT history_id FROM view_history
           WHERE user_id = $1
           ORDER BY viewed_at DESC
           LIMIT 10
         )`,
      [userId]
    );
  }

  return formatMovieDetail(movie);
};

const getSimilarMovies = async (movieId) => {
  const movieResult = await pool.query('SELECT genres FROM movies WHERE movie_id = $1', [movieId]);
  if (movieResult.rows.length === 0) return { movies: [] };

  const genres = movieResult.rows[0].genres;

  const result = await pool.query(
    `SELECT movie_id, title, genres, poster_path, avg_rating
     FROM movies
     WHERE movie_id != $1
       AND genres::text ILIKE $2
     ORDER BY avg_rating DESC
     LIMIT 20`,
    [movieId, `%${genres[0] || ''}%`]
  );

  return { movies: result.rows.map(formatMovie) };
};

const getGenres = async () => {
  const result = await pool.query('SELECT genre_id, name FROM genres ORDER BY genre_id');
  return { genres: result.rows.map((r) => ({ genreId: r.genre_id, name: r.name })) };
};

const formatMovie = (row) => ({
  movieId: row.movie_id,
  tmdbId: row.tmdb_id,
  title: row.title,
  genres: row.genres || [],
  director: row.director,
  posterPath: row.poster_path,
  releaseYear: row.release_year,
  avgRating: parseFloat(row.avg_rating) || 0,
  ratingCount: row.rating_count || 0,
});

const formatMovieDetail = (row) => ({
  ...formatMovie(row),
  castMembers: row.cast_members || [],
  overview: row.overview,
});

module.exports = {
  getMovies,
  searchMovies,
  getPopularMovies,
  getMovieDetail,
  getSimilarMovies,
  getGenres,
};

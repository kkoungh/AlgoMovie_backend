const pool = require('../config/database');

const getMovies = async ({ genre, page = 1, limit = 20 }) => {
  const offset = (page - 1) * limit;
  const params = [];
  let where = '';

  if (genre) {
    params.push(`%${genre}%`);
    where = `WHERE genres::text ILIKE $${params.length}`;
  }

  params.push(limit, offset);
  const moviesResult = await pool.query(
    `SELECT movie_id, tmdb_id, title, genres, director, poster_path, release_year, avg_rating, rating_count
     FROM movies ${where}
     ORDER BY avg_rating DESC, rating_count DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const countParams = genre ? [params[0]] : [];
  const countResult = await pool.query(
    `SELECT COUNT(*) FROM movies ${where}`,
    countParams
  );

  return {
    movies: moviesResult.rows.map(formatMovie),
    total:  parseInt(countResult.rows[0].count),
    page:   parseInt(page),
    limit:  parseInt(limit),
  };
};

const searchMovies = async ({ q, page = 1, limit = 20 }) => {
  if (!q || q.trim() === '') {
    return { movies: [], total: 0 };
  }

  const keyword = `%${q.trim()}%`;
  const offset  = (page - 1) * limit;

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
    total:  parseInt(countResult.rows[0].count),
  };
};

const getPopularMovies = async ({ period = 'weekly' }) => {
  const days = period === 'monthly' ? 30 : 7;

  const result = await pool.query(
    `SELECT m.movie_id, m.tmdb_id, m.title, m.genres, m.director,
            m.poster_path, m.release_year, m.avg_rating, m.rating_count
     FROM movies m
     WHERE m.rating_count > 0
     ORDER BY
       (SELECT AVG(r.score) FROM ratings r
        WHERE r.movie_id = m.movie_id
          AND r.created_at >= NOW() - INTERVAL '${days} days') DESC NULLS LAST,
       m.avg_rating DESC
     LIMIT 20`,
    []
  );

  return { movies: result.rows.map(formatMovie) };
};

const getMovieDetail = async (movieId, userId) => {
  const result = await pool.query(
    `SELECT * FROM movies WHERE movie_id = $1`,
    [movieId]
  );
  if (result.rows.length === 0) {
    const err = new Error('영화를 찾을 수 없습니다.');
    err.status = 404; err.code = 'MOVIE_NOT_FOUND';
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
  const movieResult = await pool.query(
    'SELECT genres FROM movies WHERE movie_id = $1',
    [movieId]
  );
  if (movieResult.rows.length === 0) return { movies: [] };

  const genres = movieResult.rows[0].genres;

  const result = await pool.query(
    `SELECT movie_id, title, genres, poster_path, avg_rating
     FROM movies
     WHERE movie_id != $1
       AND genres::text ILIKE $2
     ORDER BY avg_rating DESC
     LIMIT 5`,
    [movieId, `%${genres[0] || ''}%`]
  );

  return { movies: result.rows.map(formatMovie) };
};

const getGenres = async () => {
  const result = await pool.query('SELECT genre_id, name FROM genres ORDER BY genre_id');
  return { genres: result.rows.map((r) => ({ genreId: r.genre_id, name: r.name })) };
};

const formatMovie = (row) => ({
  movieId:     row.movie_id,
  tmdbId:      row.tmdb_id,
  title:       row.title,
  genres:      row.genres || [],
  director:    row.director,
  posterPath:  row.poster_path,
  releaseYear: row.release_year,
  avgRating:   parseFloat(row.avg_rating) || 0,
  ratingCount: row.rating_count || 0,
});

const formatMovieDetail = (row) => ({
  ...formatMovie(row),
  castMembers: row.cast_members || [],
  overview:    row.overview,
});

module.exports = { getMovies, searchMovies, getPopularMovies, getMovieDetail, getSimilarMovies, getGenres };

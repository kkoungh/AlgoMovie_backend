const pool = require('../config/database');

const toggleWishlist = async (userId, movieId) => {
  const existing = await pool.query(
    'SELECT wishlist_id FROM wishlist WHERE user_id = $1 AND movie_id = $2',
    [userId, movieId]
  );

  if (existing.rows.length > 0) {
    await pool.query('DELETE FROM wishlist WHERE user_id = $1 AND movie_id = $2', [
      userId,
      movieId,
    ]);
    return { added: false, message: '위시리스트에서 제거되었습니다.' };
  }

  await pool.query('INSERT INTO wishlist (user_id, movie_id) VALUES ($1, $2)', [userId, movieId]);
  return { added: true, message: '위시리스트에 추가되었습니다.' };
};

const getWishlist = async (userId) => {
  const result = await pool.query(
    `SELECT w.added_at, m.movie_id, m.title, m.poster_path, m.avg_rating, m.genres
     FROM wishlist w
     JOIN movies m ON w.movie_id = m.movie_id
     WHERE w.user_id = $1
     ORDER BY w.added_at DESC`,
    [userId]
  );

  return result.rows.map((row) => ({
    addedAt: row.added_at,
    movie: {
      movieId: row.movie_id,
      title: row.title,
      posterPath: row.poster_path,
      avgRating: parseFloat(row.avg_rating) || 0,
      genres: row.genres || [],
    },
  }));
};

module.exports = { toggleWishlist, getWishlist };

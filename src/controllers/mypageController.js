const ratingService = require('../services/ratingService');
const wishlistService = require('../services/wishlistService');
const pool = require('../config/database');

const getMyReviews = async (req, res, next) => {
  try {
    const reviews = await ratingService.getMyRatings(req.user.userId);
    res.json({ reviews });
  } catch (err) {
    next(err);
  }
};

const getMyWishlist = async (req, res, next) => {
  try {
    const wishlist = await wishlistService.getWishlist(req.user.userId);
    res.json({ wishlist });
  } catch (err) {
    next(err);
  }
};

const getMyHistory = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT vh.viewed_at, m.movie_id, m.title, m.poster_path, m.avg_rating, m.genres
       FROM view_history vh
       JOIN movies m ON vh.movie_id = m.movie_id
       WHERE vh.user_id = $1
       ORDER BY vh.viewed_at DESC
       LIMIT 10`,
      [req.user.userId]
    );

    res.json({
      history: result.rows.map((row) => ({
        viewedAt: row.viewed_at,
        movie: {
          movieId: row.movie_id,
          title: row.title,
          posterPath: row.poster_path,
          avgRating: parseFloat(row.avg_rating) || 0,
          genres: row.genres || [],
        },
      })),
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getMyReviews, getMyWishlist, getMyHistory };

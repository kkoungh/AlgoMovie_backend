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

const getMyStats = async (req, res, next) => {
  try {
    const userId = req.user.userId;

    // 평균 평점 / 총 평가 수 / 점수 분포
    const ratingStats = await pool.query(
      `SELECT
         COUNT(*)::int                          AS total_ratings,
         ROUND(AVG(score)::numeric, 2)::float   AS avg_rating_given,
         COUNT(CASE WHEN score >= 4   THEN 1 END)::int AS high_count,
         COUNT(CASE WHEN score >= 2 AND score < 4 THEN 1 END)::int AS mid_count,
         COUNT(CASE WHEN score < 2   THEN 1 END)::int AS low_count
       FROM ratings WHERE user_id = $1`,
      [userId]
    );

    // 점수 구간별 분포 (1~5)
    const distResult = await pool.query(
      `SELECT ROUND(score)::int AS bucket, COUNT(*)::int AS cnt
       FROM ratings WHERE user_id = $1
       GROUP BY bucket ORDER BY bucket`,
      [userId]
    );

    // 장르별 평가 분포 (상위 5개)
    const genreResult = await pool.query(
      `SELECT genre, COUNT(*)::int AS cnt
       FROM ratings r
       JOIN movies m ON r.movie_id = m.movie_id,
            jsonb_array_elements_text(m.genres) AS genre
       WHERE r.user_id = $1
       GROUP BY genre ORDER BY cnt DESC LIMIT 5`,
      [userId]
    );

    const s = ratingStats.rows[0];
    res.json({
      totalRatings:       s.total_ratings    || 0,
      avgRatingGiven:     s.avg_rating_given || 0,
      highCount:          s.high_count       || 0,
      midCount:           s.mid_count        || 0,
      lowCount:           s.low_count        || 0,
      ratingDistribution: distResult.rows.map((r) => ({ score: r.bucket, count: r.cnt })),
      genreDistribution:  genreResult.rows.map((r) => ({ genre: r.genre, count: r.cnt })),
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getMyReviews, getMyWishlist, getMyHistory, getMyStats };

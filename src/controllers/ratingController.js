const ratingService = require('../services/ratingService');

const writeRating = async (req, res, next) => {
  try {
    const { movieId, score, review } = req.body;
    if (!movieId) {
      return res.status(422).json({ code: 'VALIDATION_ERROR', message: '영화 ID가 필요합니다.' });
    }
    const result = await ratingService.writeRating({
      userId: req.user.userId,
      movieId: parseInt(movieId),
      score: parseFloat(score),
      review,
    });
    res.status(201).json({ message: '평가가 저장되었습니다.', ...result });
  } catch (err) {
    next(err);
  }
};

module.exports = { writeRating };

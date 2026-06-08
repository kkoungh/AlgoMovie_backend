const feedbackService = require('../services/feedbackService');

const submitFeedback = async (req, res, next) => {
  try {
    const { movieId, type } = req.body;
    if (!movieId || !type) {
      return res
        .status(422)
        .json({ code: 'VALIDATION_ERROR', message: 'movieId와 type이 필요합니다.' });
    }
    await feedbackService.submitFeedback({
      userId: req.user.userId,
      movieId: parseInt(movieId),
      type,
    });
    res.json({ message: '피드백이 저장되었습니다.' });
  } catch (err) {
    next(err);
  }
};

module.exports = { submitFeedback };

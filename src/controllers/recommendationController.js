const recommendationService = require('../services/recommendationService');

const getRecommendations = async (req, res, next) => {
  try {
    const result = await recommendationService.getRecommendations(req.user.userId);
    res.json({
      recommendations: result.recommendations,
      weights:         result.weights,
      fromCache:       result.fromCache,
      isNewUser:       result.isNewUser,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getRecommendations };

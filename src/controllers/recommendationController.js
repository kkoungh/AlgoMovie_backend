const recommendationService = require('../services/recommendationService');

const getRecommendations = async (req, res, next) => {
  try {
    const recommendations = await recommendationService.getRecommendations(req.user.userId);
    res.json({ recommendations });
  } catch (err) {
    next(err);
  }
};

module.exports = { getRecommendations };

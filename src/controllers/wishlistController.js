const wishlistService = require('../services/wishlistService');

const toggleWishlist = async (req, res, next) => {
  try {
    const { movieId } = req.params;
    const result = await wishlistService.toggleWishlist(req.user.userId, parseInt(movieId));
    res.json(result);
  } catch (err) {
    next(err);
  }
};

module.exports = { toggleWishlist };

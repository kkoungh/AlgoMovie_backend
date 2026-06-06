const wishlistService = require('../services/wishlistService');

const getWishlist = async (req, res, next) => {
  try {
    const wishlist = await wishlistService.getWishlist(req.user.userId);
    res.json({ wishlist });
  } catch (err) {
    next(err);
  }
};

const toggleWishlist = async (req, res, next) => {
  try {
    const { movieId } = req.params;
    const result = await wishlistService.toggleWishlist(req.user.userId, parseInt(movieId));
    res.json(result);
  } catch (err) {
    next(err);
  }
};

module.exports = { getWishlist, toggleWishlist };

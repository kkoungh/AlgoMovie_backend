const express = require('express');
const router = express.Router();
const controller = require('../controllers/wishlistController');
const { authenticate } = require('../middleware/auth');

router.get('/',          authenticate, controller.getWishlist);
router.post('/:movieId', authenticate, controller.toggleWishlist);

module.exports = router;

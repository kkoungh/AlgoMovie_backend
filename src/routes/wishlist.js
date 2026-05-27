const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/wishlistController');
const { authenticate } = require('../middleware/auth');

router.post('/:movieId', authenticate, controller.toggleWishlist);

module.exports = router;

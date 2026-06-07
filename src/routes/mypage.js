const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/mypageController');
const { authenticate } = require('../middleware/auth');

router.get('/reviews',  authenticate, controller.getMyReviews);
router.get('/wishlist', authenticate, controller.getMyWishlist);
router.get('/history',  authenticate, controller.getMyHistory);
router.get('/stats',    authenticate, controller.getMyStats);

module.exports = router;

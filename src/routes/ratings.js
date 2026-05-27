const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/ratingController');
const { authenticate } = require('../middleware/auth');

router.post('/', authenticate, controller.writeRating);

module.exports = router;

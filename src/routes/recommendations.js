const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/recommendationController');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, controller.getRecommendations);

module.exports = router;

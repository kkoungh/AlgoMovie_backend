const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/feedbackController');
const { authenticate } = require('../middleware/auth');

router.post('/', authenticate, controller.submitFeedback);

module.exports = router;

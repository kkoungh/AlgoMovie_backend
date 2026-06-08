const express = require('express');
const router = express.Router();
const controller = require('../controllers/userController');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, controller.getMe);
router.patch('/', authenticate, controller.updateMe);

module.exports = router;

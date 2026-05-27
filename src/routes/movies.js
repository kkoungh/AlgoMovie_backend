const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/movieController');
const { authenticate, optionalAuth } = require('../middleware/auth');

router.get('/',         controller.getMovies);
router.get('/search',   controller.searchMovies);
router.get('/popular',  controller.getPopularMovies);
router.get('/:id',      optionalAuth, controller.getMovieDetail);
router.get('/:id/similar', authenticate, controller.getSimilarMovies);

module.exports = router;

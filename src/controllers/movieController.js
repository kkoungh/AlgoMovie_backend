const movieService = require('../services/movieService');

const getMovies = async (req, res, next) => {
  try {
    const { genre, page, limit } = req.query;
    const result = await movieService.getMovies({ genre, page, limit });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

const searchMovies = async (req, res, next) => {
  try {
    const { q, page, limit } = req.query;
    const result = await movieService.searchMovies({ q, page, limit });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

const getPopularMovies = async (req, res, next) => {
  try {
    const { period } = req.query;
    const result = await movieService.getPopularMovies({ period });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

const getMovieDetail = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user ? req.user.userId : null;
    const result = await movieService.getMovieDetail(parseInt(id), userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

const getSimilarMovies = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await movieService.getSimilarMovies(parseInt(id));
    res.json(result);
  } catch (err) {
    next(err);
  }
};

const getGenres = async (req, res, next) => {
  try {
    const result = await movieService.getGenres();
    res.json(result);
  } catch (err) {
    next(err);
  }
};

module.exports = { getMovies, searchMovies, getPopularMovies, getMovieDetail, getSimilarMovies, getGenres };

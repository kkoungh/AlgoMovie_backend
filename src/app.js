const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const errorHandler = require('./middleware/errorHandler');

const authRouter = require('./routes/auth');
const usersRouter = require('./routes/users');
const moviesRouter = require('./routes/movies');
const genresRouter = require('./routes/genres');
const recommendationsRouter = require('./routes/recommendations');
const ratingsRouter = require('./routes/ratings');
const feedbackRouter = require('./routes/feedback');
const wishlistRouter = require('./routes/wishlist');
const mypageRouter = require('./routes/mypage');

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRouter);
app.use('/api/users/me', usersRouter);
app.use('/api/movies', moviesRouter);
app.use('/api/genres', genresRouter);
app.use('/api/recommendations', recommendationsRouter);
app.use('/api/ratings', ratingsRouter);
app.use('/api/feedback', feedbackRouter);
app.use('/api/wishlist', wishlistRouter);
app.use('/api/mypage', mypageRouter);

app.use(errorHandler);

module.exports = app;

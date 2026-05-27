const authService = require('../services/authService');

const register = async (req, res, next) => {
  try {
    const { email, password, nickname, genres } = req.body;
    if (!email || !password || !nickname) {
      return res.status(422).json({ code: 'VALIDATION_ERROR', message: '이메일, 비밀번호, 닉네임은 필수입니다.' });
    }
    const result = await authService.signUp({ email, password, nickname, genres });
    res.status(201).json({ message: '회원가입이 완료되었습니다.', ...result });
  } catch (err) {
    next(err);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(422).json({ code: 'VALIDATION_ERROR', message: '이메일과 비밀번호를 입력해주세요.' });
    }
    const result = await authService.login({ email, password });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(422).json({ code: 'VALIDATION_ERROR', message: 'refreshToken이 필요합니다.' });
    }
    const result = await authService.refreshAccessToken(refreshToken);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

const withdraw = async (req, res, next) => {
  try {
    await authService.withdraw(req.user.userId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

module.exports = { register, login, refresh, withdraw };

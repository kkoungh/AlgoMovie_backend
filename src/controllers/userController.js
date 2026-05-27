const userService = require('../services/userService');

const getMe = async (req, res, next) => {
  try {
    const profile = await userService.getProfile(req.user.userId);
    res.json(profile);
  } catch (err) {
    next(err);
  }
};

const updateMe = async (req, res, next) => {
  try {
    const { nickname, profileImageUrl } = req.body;
    const updated = await userService.updateProfile(req.user.userId, { nickname, profileImageUrl });
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

module.exports = { getMe, updateMe };

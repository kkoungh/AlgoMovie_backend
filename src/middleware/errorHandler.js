const errorHandler = (err, req, res, _next) => {
  console.error(err.stack);
  const status = err.status || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message = err.message || '서버 오류가 발생했습니다.';
  res.status(status).json({ code, message });
};

module.exports = errorHandler;

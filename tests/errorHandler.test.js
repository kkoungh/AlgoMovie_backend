const errorHandler = require('../src/middleware/errorHandler');

describe('error handler middleware', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    req = {};
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  test('returns explicit status, code, and message from operational errors', () => {
    const err = new Error('not found');
    err.status = 404;
    err.code = 'NOT_FOUND';

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ code: 'NOT_FOUND', message: 'not found' });
  });

  test('falls back to an internal error response when details are missing', () => {
    const err = { stack: 'stack only' };

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'INTERNAL_ERROR',
      message: expect.any(String),
    }));
  });
});

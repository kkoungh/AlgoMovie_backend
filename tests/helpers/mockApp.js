const request = require('supertest');

const loadAppWithMockAuth = ({ pool } = {}) => {
  jest.resetModules();

  const mockPool = pool || {
    query: jest.fn().mockResolvedValue({ rows: [] }),
    connect: jest.fn(),
    on: jest.fn(),
  };
  const mockRedis = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    on: jest.fn(),
  };

  jest.doMock('../../src/config/database', () => mockPool);
  jest.doMock('../../src/config/redis', () => mockRedis);
  jest.doMock('axios', () => ({
    get: jest.fn(),
    post: jest.fn(),
  }));

  jest.doMock('../../src/middleware/auth', () => ({
    authenticate: (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).json({ code: 'UNAUTHORIZED' });
      }
      req.user = { userId: 7, email: 'tester@example.com' };
      return next();
    },
    optionalAuth: (req, res, next) => {
      if (req.headers.authorization) {
        req.user = { userId: 7, email: 'tester@example.com' };
      }
      return next();
    },
  }));

  return request(require('../../src/app'));
};

module.exports = { loadAppWithMockAuth };

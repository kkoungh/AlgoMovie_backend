module.exports = {
  testEnvironment: 'node',
  clearMocks: true,
  restoreMocks: true,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/index.js',
    '!src/scripts/**',
  ],
  coverageDirectory: 'coverage',
};

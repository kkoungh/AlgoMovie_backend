const globals = {
  console: 'readonly',
  process: 'readonly',
  require: 'readonly',
  module: 'readonly',
  __dirname: 'readonly',
  Buffer: 'readonly',
  setImmediate: 'readonly',
  setTimeout: 'readonly',
  URL: 'readonly',
};

const jestGlobals = {
  jest: 'readonly',
  describe: 'readonly',
  test: 'readonly',
  expect: 'readonly',
  beforeEach: 'readonly',
  afterAll: 'readonly',
};

module.exports = [
  {
    ignores: ['coverage/**', 'node_modules/**'],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals,
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-undef': 'error',
    },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: { ...globals, ...jestGlobals },
    },
  },
];

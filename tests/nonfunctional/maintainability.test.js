const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');

describe('nonfunctional maintainability checks', () => {
  test('NFR-10: backend keeps routes, controllers, services, middleware, and config separated', () => {
    const expectedDirs = [
      'src/routes',
      'src/controllers',
      'src/services',
      'src/middleware',
      'src/config',
    ];

    for (const dir of expectedDirs) {
      expect(fs.existsSync(path.join(root, dir))).toBe(true);
    }
  });

  test('NFR-10: key feature modules have route/controller/service separation', () => {
    const modules = ['auth', 'movies', 'ratings', 'feedback', 'wishlist', 'recommendations'];
    const controllerNames = {
      auth: 'authController.js',
      movies: 'movieController.js',
      ratings: 'ratingController.js',
      feedback: 'feedbackController.js',
      wishlist: 'wishlistController.js',
      recommendations: 'recommendationController.js',
    };
    const serviceNames = {
      auth: 'authService.js',
      movies: 'movieService.js',
      ratings: 'ratingService.js',
      feedback: 'feedbackService.js',
      wishlist: 'wishlistService.js',
      recommendations: 'recommendationService.js',
    };

    for (const moduleName of modules) {
      expect(fs.existsSync(path.join(root, 'src/routes', `${moduleName}.js`))).toBe(true);
      expect(fs.existsSync(path.join(root, 'src/controllers', controllerNames[moduleName]))).toBe(true);
      expect(fs.existsSync(path.join(root, 'src/services', serviceNames[moduleName]))).toBe(true);
    }
  });

  test('NFR-15: package.json keeps test coverage command available', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

    expect(pkg.scripts.test).toBe('jest');
    expect(pkg.scripts['test:coverage']).toBe('jest --coverage');
  });

  test('NFR-15: Jest coverage collection is configured for src files', () => {
    const config = require('../../jest.config');

    expect(config.collectCoverageFrom).toEqual(expect.arrayContaining(['src/**/*.js']));
    expect(config.coverageDirectory).toBe('coverage');
  });

  test('NFR-15: coverage output is ignored by Git', () => {
    const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');

    expect(gitignore).toContain('coverage/');
  });

  test('NFR-13/NFR-14: checklist documents lint, formatting, and JSDoc review steps', () => {
    const checklist = fs.readFileSync(
      path.join(root, 'docs/nonfunctional-test-checklist.md'),
      'utf8'
    );

    expect(checklist).toContain('ESLint');
    expect(checklist).toContain('Prettier');
    expect(checklist).toContain('JSDoc');
  });
});

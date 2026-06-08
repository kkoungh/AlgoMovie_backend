describe('configuration modules', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('database config uses safe local defaults and registers an error handler', () => {
    delete process.env.DB_HOST;
    delete process.env.DB_PORT;
    delete process.env.DB_NAME;
    delete process.env.DB_USER;
    delete process.env.DB_PASSWORD;

    const on = jest.fn();
    const Pool = jest.fn(() => ({ on }));
    jest.doMock('pg', () => ({ Pool }));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    require('../src/config/database');

    expect(Pool).toHaveBeenCalledWith(expect.objectContaining({
      host: 'localhost',
      port: 5432,
      database: 'algomovie',
      user: 'postgres',
      password: 'postgres',
    }));
    expect(on).toHaveBeenCalledWith('error', expect.any(Function));

    on.mock.calls[0][1](new Error('db down'));
    expect(console.error).toHaveBeenCalledWith(
      'Unexpected DB pool error:',
      expect.any(Error)
    );
  });

  test('database config honors explicit environment values', () => {
    process.env.DB_HOST = 'db.example.test';
    process.env.DB_PORT = '15432';
    process.env.DB_NAME = 'movie_test';
    process.env.DB_USER = 'movie_user';
    process.env.DB_PASSWORD = 'secret';

    const Pool = jest.fn(() => ({ on: jest.fn() }));
    jest.doMock('pg', () => ({ Pool }));

    require('../src/config/database');

    expect(Pool).toHaveBeenCalledWith(expect.objectContaining({
      host: 'db.example.test',
      port: 15432,
      database: 'movie_test',
      user: 'movie_user',
      password: 'secret',
    }));
  });

  test('redis config uses defaults, retry backoff, and connection handlers', () => {
    delete process.env.REDIS_HOST;
    delete process.env.REDIS_PORT;
    delete process.env.REDIS_PASSWORD;

    const on = jest.fn();
    const Redis = jest.fn(() => ({ on }));
    jest.doMock('ioredis', () => Redis);
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});

    require('../src/config/redis');

    const options = Redis.mock.calls[0][0];
    expect(options).toEqual(expect.objectContaining({
      host: 'localhost',
      port: 6379,
      password: undefined,
    }));
    expect(options.retryStrategy(10)).toBe(500);
    expect(options.retryStrategy(100)).toBe(2000);

    const errorHandler = on.mock.calls.find(([event]) => event === 'error')[1];
    const connectHandler = on.mock.calls.find(([event]) => event === 'connect')[1];
    errorHandler(new Error('redis down'));
    connectHandler();

    expect(console.error).toHaveBeenCalledWith('Redis error:', expect.any(Error));
    expect(console.log).toHaveBeenCalledWith('Redis connected');
  });

  test('redis config honors explicit environment values', () => {
    process.env.REDIS_HOST = 'redis.example.test';
    process.env.REDIS_PORT = '16379';
    process.env.REDIS_PASSWORD = 'redis-secret';

    const Redis = jest.fn(() => ({ on: jest.fn() }));
    jest.doMock('ioredis', () => Redis);

    require('../src/config/redis');

    expect(Redis).toHaveBeenCalledWith(expect.objectContaining({
      host: 'redis.example.test',
      port: 16379,
      password: 'redis-secret',
    }));
  });
});

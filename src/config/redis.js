const Redis = require('ioredis');

const commonOptions = {
  maxRetriesPerRequest: 0,   // 연결 없으면 즉시 에러 → 폴백으로 진행
  enableReadyCheck: false,
  enableOfflineQueue: false,  // 오프라인 시 명령 큐잉 금지
  retryStrategy: (times) => Math.min(times * 200, 3000),
};

const redis = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, commonOptions)
  : new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      ...commonOptions,
    });

redis.on('error', (err) => {
  console.error('Redis error:', err);
});

redis.on('connect', () => {
  console.log('Redis connected');
});

module.exports = redis;

const http = require('http');
const https = require('https');
const { performance } = require('perf_hooks');

const target = process.env.LOAD_TEST_URL || 'http://localhost:3000/api/recommendations';
const token = process.env.LOAD_TEST_TOKEN;
const concurrency = parseInt(process.env.LOAD_TEST_CONCURRENCY || '100', 10);
const timeoutMs = parseInt(process.env.LOAD_TEST_TIMEOUT_MS || '3000', 10);

if (!token) {
  console.error('LOAD_TEST_TOKEN is required so the recommendation endpoint can authenticate.');
  process.exit(1);
}

const requestOnce = () =>
  new Promise((resolve) => {
    const url = new URL(target);
    const client = url.protocol === 'https:' ? https : http;
    const startedAt = performance.now();
    const req = client.request(
      url,
      {
        method: 'GET',
        timeout: timeoutMs,
        headers: { Authorization: `Bearer ${token}` },
      },
      (res) => {
        res.resume();
        res.on('end', () => {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            statusCode: res.statusCode,
            elapsedMs: performance.now() - startedAt,
          });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
    req.on('error', (err) => {
      resolve({
        ok: false,
        statusCode: 0,
        elapsedMs: performance.now() - startedAt,
        error: err.message,
      });
    });
    req.end();
  });

(async () => {
  const results = await Promise.all(Array.from({ length: concurrency }, requestOnce));
  const elapsed = results.map((r) => r.elapsedMs);
  const avg = elapsed.reduce((sum, value) => sum + value, 0) / elapsed.length;
  const max = Math.max(...elapsed);
  const failures = results.filter((r) => !r.ok);

  console.log(`target=${target}`);
  console.log(`concurrency=${concurrency}`);
  console.log(`avgMs=${avg.toFixed(2)}`);
  console.log(`maxMs=${max.toFixed(2)}`);
  console.log(`failures=${failures.length}`);

  if (avg >= timeoutMs || failures.length > 0) {
    process.exit(1);
  }
})();

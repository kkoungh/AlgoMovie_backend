# Nonfunctional Test Checklist

This checklist covers backend nonfunctional requirements that are partly or fully manual in the current project. Do not run these checks against production unless an owner explicitly approves the target, data set, and traffic volume.

## Automated Jest Checks

- `tests/nonfunctional/performance.test.js`
  - NFR-01: recommendation API response time under 3 seconds with mocked dependencies.
  - NFR-04: representative DB query path under 1 second using mock DB.
- `tests/nonfunctional/security.test.js`
  - NFR-05: signup stores a bcrypt-shaped password hash instead of plaintext.
  - NFR-06: login returns JWT-shaped access token and random refresh token.
  - NFR-08: SQL injection-like payloads are passed through parameterized queries.
- `tests/nonfunctional/reliability.test.js`
  - NFR-02: 100 concurrent mocked recommendation requests complete successfully.
  - NFR-09: service layer maps more than 10,000 mock movie records.
  - External API and DB calls remain mocked in test paths.
- `tests/nonfunctional/maintainability.test.js`
  - NFR-10: route, controller, service, middleware, and config modules are separated.
  - NFR-15: coverage command and coverage ignore settings are present.

## NFR-02: Concurrent 100 User Load Test

Recommended tools: `k6`, `autocannon`, or `artillery`.

Example with a local or staging backend:

```bash
npx autocannon -c 100 -d 30 -H "Authorization=Bearer <test-token>" http://localhost:3000/api/recommendations
```

Pass criteria:

- 100 concurrent connections complete without server crashes.
- Average recommendation response time is under 3 seconds.
- Error rate is acceptable for the test profile, ideally 0 for mocked/staging dependencies.
- CPU, memory, DB pool, Redis, and recommendation service logs show no saturation.

Use only test tokens and test data. Do not point this at production by accident.

## NFR-07: HTTPS Verification

Check reverse proxy, load balancer, and deployment configuration:

```bash
curl -I https://<backend-host>/health
```

Pass criteria:

- API endpoint is reachable through `https://`.
- HTTP requests are redirected to HTTPS or blocked.
- TLS certificate is valid and not expired.
- Frontend API base URL uses `https://` in deployed environments.

Optional deeper checks:

```bash
nmap --script ssl-enum-ciphers -p 443 <backend-host>
```

## NFR-09: 10,000+ Movie Storage Verification

Run only on a local test DB or staging DB.

Suggested SQL:

```sql
SELECT COUNT(*) FROM movies;
```

Pass criteria:

- `movies` table can store at least 10,000 rows.
- Movie list, search, and detail queries remain responsive.
- Indexes exist for commonly filtered or searched columns such as `movie_id`, `title`, and genre-related fields.

Recommended performance probe:

```sql
EXPLAIN ANALYZE
SELECT movie_id, title, genres, poster_path, avg_rating
FROM movies
ORDER BY avg_rating DESC, rating_count DESC
LIMIT 20;
```

## NFR-13: ESLint and Prettier

This project does not currently define lint/format scripts in `package.json`. If the team enables them, prefer:

```bash
npm run lint
npm run format:check
```

If scripts are not available, add project-approved ESLint/Prettier config first, then run checks in CI. Do not auto-format broad files during test-only work unless requested.

## NFR-14: JSDoc Review

Automated JSDoc enforcement is not currently configured. Manual review steps:

1. Identify public service functions in `src/services`.
2. Confirm major functions document purpose, parameters, return value, and thrown errors.
3. Prefer JSDoc on functions with cross-module contracts, security-sensitive behavior, recommendation behavior, or nontrivial DB transactions.

Optional future automation:

```bash
npx eslint src --rule "valid-jsdoc: warn"
```

Use the rule set agreed by the team; `valid-jsdoc` availability depends on ESLint version/configuration.

## NFR-15: Coverage 80%+

Run:

```bash
npm run test:coverage
```

Pass criteria:

- Overall statements/lines/functions target is at least 80%.
- Branch coverage should improve over time, but do not add low-value tests just to chase 100%.
- Review the terminal summary and `coverage/lcov.info`.
- `coverage/` must remain ignored by Git.

## External API and Production DB Safety

For all tests:

- Mock TMDB or recommendation HTTP calls with Jest mocks.
- Mock `src/config/database` and `src/config/redis` unless explicitly running an approved integration environment.
- Do not read or print `.env` values.
- Do not run destructive SQL against shared databases.

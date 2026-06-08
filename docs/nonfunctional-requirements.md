# Nonfunctional Requirements

| ID | Category | Requirement | Verification |
| --- | --- | --- | --- |
| NFR-01 | Performance | Recommendation results load in under 3 seconds on average. | `npm run test:coverage`, staging API timing, and `npm run load:test:recommendations`. |
| NFR-02 | Performance | The system supports 100 concurrent users. | `npm run load:test:recommendations` with `LOAD_TEST_CONCURRENCY=100`. |
| NFR-03 | Performance | Frontend first contentful paint is under 2 seconds. | `flutter build web` plus Lighthouse on the deployed web build. |
| NFR-04 | Performance | Representative database queries complete in under 1 second. | Jest performance checks and staging `EXPLAIN ANALYZE`. |
| NFR-05 | Security | Passwords are stored as bcrypt hashes. | Auth service tests and schema review. |
| NFR-06 | Security | Login sessions are managed with JWT tokens. | Auth service and middleware tests. |
| NFR-07 | Security | API requests use HTTPS in deployed environments. | `ALGOMOVIE_API_BASE_URL=https://...` and deployment TLS checks. |
| NFR-08 | Security | SQL injection is mitigated with parameterized queries. | Security tests and query review. |
| NFR-09 | Scalability | The database can store at least 10,000 movies. | Schema review, indexes, and large mock mapping tests. |
| NFR-10 | Scalability | The system uses a modular monolith structure. | Route/controller/service/module structure checks. |
| NFR-11 | Usability | New users receive a first recommendation within 5 minutes. | Flutter onboarding flow tests and manual timing. |
| NFR-12 | Reliability | External recommendation and cache failures degrade gracefully without breaking the API. | Recommendation fallback tests and Redis failure tests. |
| NFR-13 | Maintainability | Code follows lint and formatting rules. | `npm run lint`, `npm run format:check`, and `flutter analyze`. |
| NFR-14 | Maintainability | Public cross-module functions include JSDoc or Dart doc comments. | Code review and maintainability checklist. |
| NFR-15 | Maintainability | Test coverage is at least 80%. | `npm run test:coverage` and `flutter test --coverage`. |

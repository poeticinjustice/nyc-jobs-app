/**
 * Test environment variables.
 *
 * This runs as a Jest `setupFiles` entry, which executes BEFORE the test
 * framework and before any module the test file imports. That ordering
 * matters: app.js reads NODE_ENV and RATE_LIMIT_MAX_REQUESTS at module load
 * to build its rate limiters, so setting them from inside beforeAll (as this
 * previously did) was too late to have any effect.
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing';
process.env.NYC_JOBS_API_URL = 'https://data.cityofnewyork.us/resource/kpav-sd4t.json';
process.env.USAJOBS_API_KEY = 'test-api-key';
process.env.USAJOBS_EMAIL = 'test@example.com';
process.env.USAJOBS_BASE_URL = 'https://data.usajobs.gov/api/Search';

// Keep the limiters effectively disabled so a growing suite can't start
// tripping 429s. app.js reads this when it constructs the limiter.
process.env.RATE_LIMIT_MAX_REQUESTS = '100000';
process.env.RATE_LIMIT_WINDOW_MS = '900000';

// Alert emails must never be attempted from tests
delete process.env.SMTP_HOST;
delete process.env.SMTP_USER;
delete process.env.SMTP_PASS;

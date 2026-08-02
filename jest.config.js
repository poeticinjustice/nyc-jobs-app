module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/server/__tests__', '<rootDir>/shared/__tests__'],
  testMatch: ['**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/', '/client/'],
  testTimeout: 30000,
  // Runs before the test framework and before any module import, so env vars
  // are in place by the time app.js reads them at load time.
  setupFiles: ['<rootDir>/server/__tests__/setupEnv.js'],
  collectCoverageFrom: [
    'server/**/*.js',
    'shared/**/*.js',
    '!server/__tests__/**',
    '!server/scripts/scrapeWithBrowser.js',
    '!**/node_modules/**',
  ],
  // Ratchet thresholds: set just under current coverage so a regression fails
  // CI, without pinning exact numbers that break on every harmless edit.
  // Per-area rather than one global number, because the areas differ wildly —
  // the scrapers are network-bound and largely exercised by live runs instead.
  coverageThreshold: {
    './server/routes/': { statements: 70, branches: 63, functions: 80, lines: 70 },
    './server/models/': { statements: 90, branches: 90, functions: 80, lines: 90 },
    './server/middleware/': { statements: 88, branches: 88, functions: 95, lines: 88 },
    './server/helpers/': { statements: 65, branches: 58, functions: 65, lines: 65 },
    './server/scripts/': { statements: 80, branches: 75, functions: 75, lines: 80 },
    './shared/': { statements: 90, branches: 88, functions: 95, lines: 90 },
    // Everything else — chiefly the 26 scrapers, which do real network I/O.
    global: { statements: 10, branches: 2, functions: 2, lines: 10 },
  },
};

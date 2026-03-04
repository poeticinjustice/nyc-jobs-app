module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/server/__tests__'],
  testMatch: ['**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/', '/client/'],
  testTimeout: 30000,
};

// Pin the timezone before Jest boots so `toLocaleDateString` assertions are
// identical on every machine and in CI. Workers inherit process.env.
process.env.TZ = 'UTC';

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  // jest-expo ships a default, but pin it explicitly so the Expo/RN 0.81
  // packages (which publish untranspiled ESM/Flow) are always transformed.
  transformIgnorePatterns: [
    'node_modules/(?!(?:.pnpm/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|@react-native-async-storage/.*|@testing-library/react-native|react-native-.*))',
  ],
  clearMocks: true,
  collectCoverageFrom: ['lib/**/*.ts', '!lib/**/__tests__/**'],
};

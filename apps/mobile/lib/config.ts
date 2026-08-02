import Constants from 'expo-constants';

const PRODUCTION_API_URL = 'https://nyc-jobs-app.onrender.com';

// On physical devices, localhost doesn't resolve to the dev machine.
// Set EXPO_PUBLIC_API_BASE_URL in your .env to your machine's local IP
// (e.g., http://192.168.1.100:8000) or your deployed backend URL.
const getDefaultBaseUrl = () => {
  // Use env var if set
  if (process.env.EXPO_PUBLIC_API_BASE_URL) {
    return process.env.EXPO_PUBLIC_API_BASE_URL;
  }

  // In dev, try to use the Expo debugger host IP (works for simulators + physical devices)
  if (__DEV__) {
    const debuggerHost =
      Constants.expoConfig?.hostUri ?? Constants.experienceUrl;
    if (debuggerHost) {
      // Strip any scheme (exp://, http://, etc.) before extracting the host,
      // then drop the port. experienceUrl looks like "exp://192.168.1.5:8081".
      const withoutScheme = debuggerHost.replace(/^[a-z]+:\/\//i, '');
      const host = withoutScheme.split(':')[0].split('/')[0];
      if (host && host !== 'localhost') {
        return `http://${host}:8000`;
      }
    }
    return 'http://localhost:8000';
  }

  return PRODUCTION_API_URL;
};

export const API_BASE_URL = getDefaultBaseUrl();

const PRODUCTION_API_URL = 'https://nyc-jobs-app.onrender.com';

type FakeConstants = {
  expoConfig?: { hostUri?: string } | null;
  experienceUrl?: string;
};

type LoadOptions = {
  dev: boolean;
  env?: string;
  constants?: FakeConstants;
};

const devGlobal = globalThis as unknown as { __DEV__: boolean };
const originalDev = devGlobal.__DEV__;
const originalEnv = process.env.EXPO_PUBLIC_API_BASE_URL;

// config.ts resolves the base URL once at import time, so each case needs a
// fresh module registry with expo-constants and __DEV__ set up beforehand.
const loadApiBaseUrl = ({ dev, env, constants }: LoadOptions): string => {
  jest.resetModules();
  devGlobal.__DEV__ = dev;
  if (env === undefined) {
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
  } else {
    process.env.EXPO_PUBLIC_API_BASE_URL = env;
  }
  jest.doMock('expo-constants', () => ({
    __esModule: true,
    default: constants ?? {},
  }));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('../config') as { API_BASE_URL: string }).API_BASE_URL;
};

afterEach(() => {
  jest.dontMock('expo-constants');
});

afterAll(() => {
  devGlobal.__DEV__ = originalDev;
  if (originalEnv === undefined) {
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
  } else {
    process.env.EXPO_PUBLIC_API_BASE_URL = originalEnv;
  }
});

describe('production builds', () => {
  it('falls back to the deployed Render URL', () => {
    expect(loadApiBaseUrl({ dev: false })).toBe(PRODUCTION_API_URL);
  });

  it('ignores the Expo dev host in production', () => {
    const url = loadApiBaseUrl({
      dev: false,
      constants: { expoConfig: { hostUri: '192.168.1.5:8081' } },
    });
    expect(url).toBe(PRODUCTION_API_URL);
  });

  it('is overridden by EXPO_PUBLIC_API_BASE_URL', () => {
    expect(loadApiBaseUrl({ dev: false, env: 'https://staging.example.com' })).toBe(
      'https://staging.example.com'
    );
  });
});

describe('EXPO_PUBLIC_API_BASE_URL override', () => {
  it('wins over the dev host detection', () => {
    const url = loadApiBaseUrl({
      dev: true,
      env: 'http://192.168.0.42:8000',
      constants: { expoConfig: { hostUri: '10.0.0.1:8081' } },
    });
    expect(url).toBe('http://192.168.0.42:8000');
  });

  it('is used verbatim, without appending a port', () => {
    expect(loadApiBaseUrl({ dev: true, env: 'https://api.example.com' })).toBe(
      'https://api.example.com'
    );
  });
});

describe('dev host resolution', () => {
  it('uses the LAN IP from expoConfig.hostUri on port 8000', () => {
    const url = loadApiBaseUrl({
      dev: true,
      constants: { expoConfig: { hostUri: '192.168.1.5:8081' } },
    });
    expect(url).toBe('http://192.168.1.5:8000');
  });

  it('strips the exp:// scheme from experienceUrl instead of parsing it as a host', () => {
    // Regression: splitting on ':' before removing the scheme produced
    // "http://exp:8000", which never resolves.
    const url = loadApiBaseUrl({
      dev: true,
      constants: { expoConfig: null, experienceUrl: 'exp://192.168.1.5:8081' },
    });
    expect(url).toBe('http://192.168.1.5:8000');
    expect(url).not.toBe('http://exp:8000');
  });

  it('strips an http:// scheme and any trailing path', () => {
    const url = loadApiBaseUrl({
      dev: true,
      constants: { expoConfig: { hostUri: 'http://192.168.1.5:8081/_expo/loading' } },
    });
    expect(url).toBe('http://192.168.1.5:8000');
  });

  it('prefers expoConfig.hostUri over experienceUrl', () => {
    const url = loadApiBaseUrl({
      dev: true,
      constants: {
        expoConfig: { hostUri: '10.0.0.7:8081' },
        experienceUrl: 'exp://192.168.1.5:8081',
      },
    });
    expect(url).toBe('http://10.0.0.7:8000');
  });

  it('falls back to localhost when the host is localhost (simulator)', () => {
    const url = loadApiBaseUrl({
      dev: true,
      constants: { expoConfig: { hostUri: 'localhost:8081' } },
    });
    expect(url).toBe('http://localhost:8000');
  });

  it('falls back to localhost when Expo reports no host at all', () => {
    expect(loadApiBaseUrl({ dev: true })).toBe('http://localhost:8000');
    expect(loadApiBaseUrl({ dev: true, constants: { expoConfig: null } })).toBe(
      'http://localhost:8000'
    );
    expect(loadApiBaseUrl({ dev: true, constants: { expoConfig: { hostUri: '' } } })).toBe(
      'http://localhost:8000'
    );
  });

  it('keeps a bare IP with no port', () => {
    const url = loadApiBaseUrl({
      dev: true,
      constants: { expoConfig: { hostUri: '192.168.1.5' } },
    });
    expect(url).toBe('http://192.168.1.5:8000');
  });
});

describe('the resolved URL is always well-formed', () => {
  const cases: LoadOptions[] = [
    { dev: false },
    { dev: true },
    { dev: true, constants: { expoConfig: { hostUri: '192.168.1.5:8081' } } },
    { dev: true, constants: { expoConfig: null, experienceUrl: 'exp://192.168.1.5:8081' } },
    { dev: true, constants: { expoConfig: null, experienceUrl: 'exp://localhost:8081' } },
    { dev: true, constants: { expoConfig: { hostUri: 'localhost:8081' } } },
    { dev: true, env: 'https://api.example.com' },
  ];

  it.each(cases)('never yields a scheme fragment as the host (%j)', (options) => {
    const url = loadApiBaseUrl(options);
    expect(url).toMatch(/^https?:\/\/[A-Za-z0-9.-]+(:\d+)?$/);
    const host = url.replace(/^https?:\/\//, '').split(':')[0];
    expect(['exp', 'exps', 'http', 'https']).not.toContain(host);
  });
});

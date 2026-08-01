import { defineConfig, loadEnv, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';

// This project keeps JSX inside .js files (a Create React App convention).
// Rollup's import analysis runs before @vitejs/plugin-react's transform, so it
// parses those files as plain JS and fails. Transform them first.
const jsxInJs = {
  name: 'jsx-in-js',
  enforce: 'pre',
  async transform(code, id) {
    // Only this app's source — a bare /src/ check also matches dependencies
    // that ship a src/ directory (e.g. axios), which don't need the transform.
    if (id.includes('node_modules') || !/\/src\/.*\.js$/.test(id)) return null;
    return transformWithEsbuild(code, id, { loader: 'jsx', jsx: 'automatic' });
  },
};

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load REACT_APP_* vars so the existing `process.env.REACT_APP_*` reads in
  // src keep working unchanged — no source edits needed for the CRA migration.
  const env = loadEnv(mode, process.cwd(), 'REACT_APP_');

  return {
    plugins: [jsxInJs, react({ include: /\.(js|jsx)$/ })],

    // Dependency pre-bundling runs outside the plugin pipeline.
    // nyc-jobs-shared is a linked CommonJS package (file:../shared). Vite skips
    // pre-bundling for linked deps by default, and Rollup cannot then see its
    // named exports — so list its subpaths explicitly and let the CommonJS
    // plugin handle it at build time.
    optimizeDeps: {
      include: [
        'nyc-jobs-shared/constants',
        'nyc-jobs-shared/utils/formatUtils',
        'nyc-jobs-shared/utils/textUtils',
        'nyc-jobs-shared/utils/validation',
      ],
      esbuildOptions: { loader: { '.js': 'jsx' } },
    },

    define: {
      'process.env.REACT_APP_MAPBOX_TOKEN': JSON.stringify(env.REACT_APP_MAPBOX_TOKEN || ''),
      // Some dependencies still probe process.env at runtime
      'process.env.NODE_ENV': JSON.stringify(mode),
    },

    server: {
      port: 3000,
      // Replaces the CRA "proxy" package.json field
      proxy: { '/api': { target: 'http://localhost:8000', changeOrigin: true } },
    },

    // The Express server serves client/build, and render.yaml builds into it —
    // keep the CRA output location rather than Vite's default "dist".
    build: {
      outDir: 'build',
      sourcemap: false,
      commonjsOptions: { include: [/nyc-jobs-shared/, /shared\//, /node_modules/] },
    },

    test: {
      globals: true,
      environment: 'jsdom',
      // jsdom is pinned to ^26 in package.json: jsdom 27 pulls in an ESM-only
      // CSS colour parser that Vitest workers load via require(), which throws
      // ERR_REQUIRE_ESM regardless of pool.
      setupFiles: './src/setupTests.js',
      css: false,
      // Match CRA's convention of colocated *.test.js files
      include: ['src/**/*.{test,spec}.{js,jsx}'],
    },
  };
});

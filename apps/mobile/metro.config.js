// https://docs.expo.dev/guides/monorepos
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
// apps/mobile -> repo root. `shared/` lives there and is linked in as the
// `nyc-jobs-shared` dependency (file:../../shared), so Metro has to watch and
// resolve files outside the app directory.
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Without this, Metro refuses to serve the shared package's files because they
// resolve outside projectRoot.
config.watchFolders = [path.resolve(workspaceRoot, 'shared')];

// Extra fallbacks, searched after the normal hierarchical lookup. The app's own
// node_modules comes first so React / React Native can only ever resolve there.
// NOTE: hierarchical lookup is deliberately left enabled — react-native relies
// on nested node_modules (e.g. @react-native/virtualized-lists) and disabling
// it breaks the bundle.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;

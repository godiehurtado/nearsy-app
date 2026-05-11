const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [
  path.resolve(workspaceRoot, 'packages/shared'),
  path.resolve(workspaceRoot, 'node_modules'),
];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

config.resolver.disableHierarchicalLookup = true;

// ✅ Force Metro to resolve "idb" to our RN shim
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  idb: path.resolve(workspaceRoot, 'packages/shared/src/shims/idb.js'),
};

config.resolver.unstable_enablePackageExports = false;

config.resolver.sourceExts = [
  'mjs',
  'cjs',
  'ios.ts',
  'ios.tsx',
  'ios.js',
  'ios.jsx',
  'ts',
  'tsx',
  'js',
  'jsx',
  'json',
];

module.exports = config;

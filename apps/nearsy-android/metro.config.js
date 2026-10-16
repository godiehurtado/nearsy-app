// apps/nearsy-android/metro.config.js
const path = require('path');
const { getDefaultConfig } = require('@expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Permite leer shared y resolver node_modules del workspace
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// expo-file-system@19 has legacy.ts but no package.json "exports" for `/legacy`.
const legacyFsEntry = path.resolve(
  workspaceRoot,
  'node_modules/expo-file-system/legacy.ts',
);
const appLegacyShim = path.resolve(projectRoot, 'src/expoLegacyFileSystem.ts');
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  // Stable bare specifier used by shared social photo copy (avoids junction-relative paths).
  'nearsy-expo-fs-legacy': appLegacyShim,
};
const priorResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const normalized = moduleName.replace(/\\/g, '/');
  if (
    normalized === 'nearsy-expo-fs-legacy' ||
    normalized === 'nearsy-expo-fs-legacy.ts'
  ) {
    return { type: 'sourceFile', filePath: appLegacyShim };
  }
  if (
    normalized === 'expo-file-system/legacy' ||
    normalized === 'expo-file-system/legacy.ts' ||
    normalized.endsWith('/node_modules/expo-file-system/legacy') ||
    normalized.endsWith('/node_modules/expo-file-system/legacy.ts')
  ) {
    return { type: 'sourceFile', filePath: legacyFsEntry };
  }
  if (typeof priorResolveRequest === 'function') {
    return priorResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;

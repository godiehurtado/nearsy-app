// apps/nearsy-android/metro.config.js
const path = require('path');
const { getDefaultConfig } = require('@expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');
const sharedRoot = path.resolve(workspaceRoot, 'packages/shared');

const config = getDefaultConfig(projectRoot);

// Watch only sources needed for the Android app — avoid generated android/
// trees (Gradle/.cxx) which break Metro file-map watch mode on Windows.
config.watchFolders = [sharedRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.blockList = [
  ...(config.resolver.blockList || []),
  /apps[\\/]nearsy-android[\\/]android[\\/].*/,
];

// Windows + emulator OkHttp: multipart/chunked bundle responses can throw
// ProtocolException ("Expected leading [0-9a-fA-F] character but was 0xd").
// Force a plain JS Accept so Metro skips multipart progress framing.
const previousEnhance = config.server?.enhanceMiddleware;
config.server = {
  ...(config.server || {}),
  enhanceMiddleware: (middleware, server) => {
    const base = previousEnhance
      ? previousEnhance(middleware, server)
      : middleware;
    return (req, res, next) => {
      const url = String(req.url || '');
      if (url.includes('.bundle') && req.headers) {
        req.headers.accept = 'application/javascript';
      }
      return base(req, res, next);
    };
  },
};

module.exports = config;

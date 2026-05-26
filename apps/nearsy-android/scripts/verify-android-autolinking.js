#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const LOG_PREFIX = '[verify-android-autolinking]';
const settingsPath = path.join(__dirname, '..', 'android', 'settings.gradle');
const appBuildPath = path.join(__dirname, '..', 'android', 'app', 'build.gradle');

function fail(message) {
  console.error(`${LOG_PREFIX} ${message}`);
  process.exit(1);
}

if (!fs.existsSync(settingsPath)) {
  fail(`missing ${settingsPath} — run expo prebuild first`);
}

if (!fs.existsSync(appBuildPath)) {
  fail(`missing ${appBuildPath} — run expo prebuild first`);
}

const settings = fs.readFileSync(settingsPath, 'utf8');

if (settings.includes('rnConfigCommand')) {
  fail('settings.gradle still uses expoAutolinking.rnConfigCommand');
}

if (!settings.includes('ex.autolinkLibrariesFromCommand()')) {
  fail('settings.gradle missing ex.autolinkLibrariesFromCommand()');
}

if (
  settings.includes("System.getenv('EXPO_USE_COMMUNITY_AUTOLINKING')") ||
  settings.includes('EXPO_USE_COMMUNITY_AUTOLINKING')
) {
  fail('settings.gradle still has Expo if/else autolinking block (plugin did not patch)');
}

const appBuild = fs.readFileSync(appBuildPath, 'utf8');

if (!appBuild.includes('entryFile = file("$projectRoot/index.ts")')) {
  fail('app/build.gradle missing entryFile = file("$projectRoot/index.ts")');
}

if (!appBuild.includes('scripts/expo-cli-no-workspace-root.js')) {
  fail('app/build.gradle missing cliFile -> scripts/expo-cli-no-workspace-root.js');
}

console.log(`${LOG_PREFIX} OK (community autolinking + entry/cli paths verified)`);

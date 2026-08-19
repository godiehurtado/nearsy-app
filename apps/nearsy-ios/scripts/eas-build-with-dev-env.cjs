/**
 * Run `eas build` with EAS development env preloaded into process.env so local
 * app.config.js evaluation has Google Dev vars (eas-cli reads config before
 * uploading). Values are never printed.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const APP_ROOT = path.join(__dirname, '..');
const DUMP_REL = './scripts/_dump-eas-env.cjs';
const OUT_REL = './.nearsy-eas-env-dump.tmp.json';

function loadEasDevelopmentEnv() {
  const outFile = path.join(APP_ROOT, OUT_REL);
  const result = spawnSync(
    `eas env:exec development "node ${DUMP_REL} ${OUT_REL}"`,
    {
      cwd: APP_ROOT,
      encoding: 'utf8',
      shell: true,
      env: {
        ...process.env,
        EXPO_PUBLIC_NEARSY_FIREBASE_ENV: '',
      },
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `eas env dump failed: ${(result.stderr || result.stdout || '').slice(0, 500)}`,
    );
  }
  try {
    return JSON.parse(fs.readFileSync(outFile, 'utf8'));
  } finally {
    try {
      fs.unlinkSync(outFile);
    } catch {
      /* ignore */
    }
  }
}

const loaded = loadEasDevelopmentEnv();
const required = [
  'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
  'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID',
  'EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_LOGO_DEV_PUBLISHABLE_KEY',
];
for (const key of required) {
  if (!loaded[key]) {
    console.error(`Missing required EAS development key: ${key}`);
    process.exit(1);
  }
}
console.log(
  `[i3g-eas-build] Preloaded EAS development keys (${Object.keys(loaded).length}) for local config eval`,
);

const env = {
  ...process.env,
  ...loaded,
  EXPO_PUBLIC_NEARSY_FIREBASE_ENV: 'development',
};

const args = process.argv.slice(2);
const build = spawnSync('eas', args.length ? args : ['build', '--profile', 'development', '--platform', 'ios', '--non-interactive'], {
  cwd: APP_ROOT,
  encoding: 'utf8',
  shell: true,
  env,
  stdio: 'inherit',
});

process.exit(build.status ?? 1);

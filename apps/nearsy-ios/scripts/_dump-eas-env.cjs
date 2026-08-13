/**
 * Invoked only via: eas env:exec development "node ./scripts/_dump-eas-env.cjs <outFile>"
 * Writes selected env keys to outFile. Prints key count only (never values).
 */
const fs = require('fs');

const outFile = process.argv[2];
if (!outFile) {
  console.error('usage: node _dump-eas-env.cjs <outFile>');
  process.exit(1);
}

const ENV_NAMES = [
  'EXPO_PUBLIC_NEARSY_FIREBASE_ENV',
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
  'EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION',
  'FIREBASE_APP_CHECK_DEBUG_TOKEN',
];

const out = {};
for (const name of ENV_NAMES) {
  const value = process.env[name];
  if (typeof value === 'string' && value.trim().length > 0) {
    out[name] = value;
  }
}

fs.writeFileSync(outFile, JSON.stringify(out), 'utf8');
process.stdout.write(`EAS_ENV_DUMP_OK keys=${Object.keys(out).length}\n`);

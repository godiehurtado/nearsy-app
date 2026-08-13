/**
 * Compare EAS debug-token fingerprint to previous without printing the new one.
 * Prints: present / previous / changed only.
 */
const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const APP_ROOT = path.join(__dirname, '..');
const DUMP_REL = './scripts/_dump-eas-env.cjs';
const OUT_REL = './.nearsy-eas-env-fp.tmp.json';
const outFile = path.join(APP_ROOT, OUT_REL);
const PREV = '1e7b984d2a44';

try {
  const bashCmd = `node ${DUMP_REL} ${OUT_REL}`;
  const result = spawnSync(`eas env:exec development "${bashCmd}"`, {
    cwd: APP_ROOT,
    encoding: 'utf8',
    shell: true,
    env: process.env,
  });

  if (result.status !== 0) {
    process.stderr.write('EAS_ENV_COMPARE_FAIL\n');
    process.exit(1);
  }

  const parsed = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  const token =
    typeof parsed.FIREBASE_APP_CHECK_DEBUG_TOKEN === 'string'
      ? parsed.FIREBASE_APP_CHECK_DEBUG_TOKEN.trim()
      : '';

  if (!token) {
    process.stdout.write(
      `present=false previous=${PREV} changed=no\n`,
    );
    process.exit(1);
  }

  const fingerprint12 = crypto
    .createHash('sha256')
    .update(token, 'utf8')
    .digest('hex')
    .slice(0, 12);

  const changed = fingerprint12 !== PREV;
  process.stdout.write(
    `present=true previous=${PREV} changed=${changed ? 'yes' : 'no'}\n`,
  );
  process.exit(changed ? 0 : 2);
} finally {
  try {
    if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
  } catch {
    /* ignore */
  }
}

/**
 * Fingerprint FIREBASE_APP_CHECK_DEBUG_TOKEN from EAS development env.
 * Prints SHA-256 truncated fingerprint + length only — never the token.
 *
 * Usage (from apps/nearsy-ios):
 *   node ./scripts/fingerprint-app-check-debug-token.cjs
 */
const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const APP_ROOT = path.join(__dirname, '..');
const DUMP_REL = './scripts/_dump-eas-env.cjs';
const OUT_REL = './.nearsy-eas-env-fp.tmp.json';
const outFile = path.join(APP_ROOT, OUT_REL);

try {
  const bashCmd = `node ${DUMP_REL} ${OUT_REL}`;
  const result = spawnSync(`eas env:exec development "${bashCmd}"`, {
    cwd: APP_ROOT,
    encoding: 'utf8',
    shell: true,
    env: process.env,
  });

  if (result.status !== 0) {
    const errText = `${result.stderr || ''}\n${result.stdout || ''}`.trim();
    process.stderr.write(
      `EAS_ENV_FINGERPRINT_FAIL status=${result.status}\n${errText.slice(0, 400)}\n`,
    );
    process.exit(1);
  }

  if (!fs.existsSync(outFile)) {
    process.stderr.write('EAS_ENV_FINGERPRINT_FAIL missing dump file\n');
    process.exit(1);
  }

  const parsed = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  const token =
    typeof parsed.FIREBASE_APP_CHECK_DEBUG_TOKEN === 'string'
      ? parsed.FIREBASE_APP_CHECK_DEBUG_TOKEN.trim()
      : '';

  if (!token) {
    process.stdout.write(
      'EAS_ENV_FINGERPRINT_OK present=false fingerprint12=n/a length=0 source=eas_env\n',
    );
    process.exit(0);
  }

  const fingerprint12 = crypto
    .createHash('sha256')
    .update(token, 'utf8')
    .digest('hex')
    .slice(0, 12);

  process.stdout.write(
    `EAS_ENV_FINGERPRINT_OK present=true algorithm=sha256 fingerprint12=${fingerprint12} length=${token.length} source=eas_env\n`,
  );
} finally {
  try {
    if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
  } catch {
    /* ignore */
  }
}

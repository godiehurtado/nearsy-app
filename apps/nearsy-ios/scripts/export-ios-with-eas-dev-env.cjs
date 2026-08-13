/**
 * Run expo export with EAS development env fully loaded (avoids parent-shell
 * EXPO_PUBLIC_NEARSY_FIREBASE_ENV triggering app.config before Google vars exist).
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
        // Prevent parent from forcing Development evaluation before EAS injects Google.
        EXPO_PUBLIC_NEARSY_FIREBASE_ENV: undefined,
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
const env = { ...process.env, ...loaded, EXPO_PUBLIC_NEARSY_FIREBASE_ENV: 'development' };
const outDir = path.join(APP_ROOT, '.tmp-i3g-export');
if (fs.existsSync(outDir)) {
  fs.rmSync(outDir, { recursive: true, force: true });
}

const exportResult = spawnSync(
  'npx',
  ['expo', 'export', '--platform', 'ios', '--output-dir', '.tmp-i3g-export'],
  {
    cwd: APP_ROOT,
    encoding: 'utf8',
    shell: true,
    env,
  },
);
process.stdout.write(exportResult.stdout || '');
process.stderr.write(exportResult.stderr || '');
if (fs.existsSync(outDir)) {
  fs.rmSync(outDir, { recursive: true, force: true });
}
process.exit(exportResult.status ?? 1);

/**
 * Guards for Firebase google-services selection (EAS nearsy-dev Development
 * Build): GOOGLE_SERVICES_JSON_DEV for development, tracked nearsy-pj file for
 * production, no silent fallback to production, no path/content leaks.
 *
 * Fixtures are fake google-services files written to a temp dir; the real
 * nearsy-dev file is never read.
 *
 * Run:
 *   node --experimental-strip-types --test packages/shared/src/__tests__/androidGoogleServicesDevConfig.test.ts
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../../../..');
const androidAppRoot = join(repoRoot, 'apps/nearsy-android');
const requireFromApp = createRequire(join(androidAppRoot, 'package.json'));

const ENV_KEYS = [
  'NEARSY_FIREBASE_ENV',
  'EXPO_PUBLIC_NEARSY_FIREBASE_ENV',
  'GOOGLE_SERVICES_JSON_DEV',
  'EAS_BUILD',
  'NEARSY_DEV_CLIENT',
  'EXPO_PUBLIC_FACEBOOK_APP_ID',
  'EXPO_PUBLIC_FACEBOOK_CLIENT_TOKEN',
] as const;
type Env = Partial<Record<(typeof ENV_KEYS)[number], string>>;

const DEV_MARKER = 'fixture-dev-api-key-7f3a';
const PJ_MARKER = 'fixture-pj-api-key-91c2';

const EAS_SHA1_HASH = '9c70c79ae4d0fe22e268ea5f50a742b0edf0bc8c';
const DEBUG_SHA1_HASH = '5e8f16062ea3cd2c4a0d547876baa6f38cabf625';

function googleServices(
  projectId: string,
  apiKey: string,
  packageName = 'com.nearsy.app',
  options: { certificateHashes?: string[]; storageBucket?: string } = {},
) {
  const certificateHashes = options.certificateHashes ?? [EAS_SHA1_HASH];
  return JSON.stringify({
    project_info: {
      project_id: projectId,
      project_number: '000000000000',
      storage_bucket: options.storageBucket ?? `${projectId}.firebasestorage.app`,
    },
    client: [
      {
        client_info: { android_client_info: { package_name: packageName } },
        oauth_client: [
          ...certificateHashes.map((hash) => ({
            client_id: `000000000000-${hash.slice(0, 6)}.apps.googleusercontent.com`,
            client_type: 1,
            android_info: { package_name: packageName, certificate_hash: hash },
          })),
          { client_id: '000000000000-web.apps.googleusercontent.com', client_type: 3 },
        ],
        api_key: [{ current_key: apiKey }],
      },
    ],
  });
}

const fixtureRoot = mkdtempSync(join(tmpdir(), 'nearsy-gs-'));
const easSecretDir = join(fixtureRoot, 'eas-environment-secrets');
mkdirSync(easSecretDir);
const devFile = join(easSecretDir, '__GOOGLE_SERVICES_JSON_DEV');
writeFileSync(devFile, googleServices('nearsy-dev', DEV_MARKER));
const pjFile = join(fixtureRoot, 'pj.json');
writeFileSync(pjFile, googleServices('nearsy-pj', PJ_MARKER));
const otherPackageFile = join(fixtureRoot, 'other-package.json');
writeFileSync(otherPackageFile, googleServices('nearsy-dev', DEV_MARKER, 'com.example.other'));
const brokenFile = join(fixtureRoot, 'broken.json');
writeFileSync(brokenFile, '{not json');
const debugOnlyFile = join(fixtureRoot, 'debug-only.json');
writeFileSync(
  debugOnlyFile,
  googleServices('nearsy-dev', DEV_MARKER, 'com.nearsy.app', { certificateHashes: [DEBUG_SHA1_HASH] }),
);
const noOAuthFile = join(fixtureRoot, 'no-oauth.json');
writeFileSync(noOAuthFile, googleServices('nearsy-dev', DEV_MARKER, 'com.nearsy.app', { certificateHashes: [] }));
const pjReferenceFile = join(fixtureRoot, 'pj-reference.json');
writeFileSync(
  pjReferenceFile,
  googleServices('nearsy-dev', DEV_MARKER, 'com.nearsy.app', { storageBucket: 'nearsy-pj.firebasestorage.app' }),
);

/** Local project roots: one with the gitignored dev file, one with only the prod file. */
const localWithDev = join(fixtureRoot, 'local-with-dev');
mkdirSync(localWithDev);
writeFileSync(
  join(localWithDev, 'google-services.nearsy-dev.json'),
  googleServices('nearsy-dev', DEV_MARKER, 'com.nearsy.app', { certificateHashes: [DEBUG_SHA1_HASH] }),
);
writeFileSync(join(localWithDev, 'google-services.json'), googleServices('nearsy-pj', PJ_MARKER));
const localProdOnly = join(fixtureRoot, 'local-prod-only');
mkdirSync(localProdOnly);
writeFileSync(join(localProdOnly, 'google-services.json'), googleServices('nearsy-pj', PJ_MARKER));

after(() => rmSync(fixtureRoot, { recursive: true, force: true }));

const DEV: Env = {
  NEARSY_FIREBASE_ENV: 'development',
  EXPO_PUBLIC_NEARSY_FIREBASE_ENV: 'development',
};

type GoogleServicesModule = {
  resolveGoogleServicesConfig: (
    env: Record<string, string | undefined>,
    projectRoot?: string,
  ) => { useNearsyDev: boolean; googleServicesFile: string };
};
const { resolveGoogleServicesConfig } = requireFromApp(
  './plugins/googleServicesConfig',
) as GoogleServicesModule;

type LoadedConfig = {
  expo: {
    android?: { googleServicesFile?: string };
    extra?: Record<string, unknown>;
  };
};

type ConsoleCall = { method: string; text: string };

function withEnv<T>(env: Env, run: (calls: ConsoleCall[]) => T): T {
  const previous = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  const calls: ConsoleCall[] = [];
  const methods = ['log', 'info', 'warn', 'error', 'debug'] as const;
  const originals = methods.map((m) => console[m]);
  const originalStderrWrite = process.stderr.write;
  methods.forEach((m) => {
    console[m] = (...args: unknown[]) => {
      calls.push({ method: m, text: args.map(String).join(' ') });
    };
  });
  process.stderr.write = ((chunk: unknown) => {
    calls.push({ method: 'stderr', text: String(chunk) });
    return true;
  }) as typeof process.stderr.write;
  try {
    for (const key of ENV_KEYS) {
      if (env[key] === undefined) delete process.env[key];
      else process.env[key] = env[key];
    }
    return run(calls);
  } finally {
    methods.forEach((m, i) => {
      console[m] = originals[i];
    });
    process.stderr.write = originalStderrWrite;
    for (const key of ENV_KEYS) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

function loadAppConfig(env: Env): { cfg: LoadedConfig; calls: ConsoleCall[] } {
  return withEnv(env, (calls) => {
    const resolved = requireFromApp.resolve('./app.config.js');
    delete requireFromApp.cache[resolved];
    const cfg = requireFromApp('./app.config.js') as LoadedConfig;
    return { cfg, calls };
  });
}

function loadAppConfigError(env: Env): { error: Error; calls: ConsoleCall[] } {
  return withEnv(env, (calls) => {
    const resolved = requireFromApp.resolve('./app.config.js');
    delete requireFromApp.cache[resolved];
    try {
      requireFromApp('./app.config.js');
    } catch (error) {
      return { error: error as Error, calls };
    }
    throw new Error('app.config.js was expected to throw');
  });
}

function assertNoLeak(text: string, label: string) {
  for (const needle of [devFile, easSecretDir, fixtureRoot, DEV_MARKER, PJ_MARKER, '000000000000']) {
    assert.equal(text.includes(needle), false, `${label} leaks ${needle === devFile ? 'path' : 'content'}`);
  }
}

describe('Development uses the GOOGLE_SERVICES_JSON_DEV EAS file variable', () => {
  it('EAS dev build: googleServicesFile is the file variable path, extras are nearsy-dev', () => {
    const { cfg } = loadAppConfig({
      ...DEV,
      NEARSY_DEV_CLIENT: 'true',
      EAS_BUILD: 'true',
      GOOGLE_SERVICES_JSON_DEV: devFile,
    });
    assert.equal(cfg.expo.android?.googleServicesFile, devFile);
    assert.equal(cfg.expo.extra?.nearsyFirebaseEnv, 'development');
    assert.equal(cfg.expo.extra?.nearsyFirebaseProjectId, 'nearsy-dev');
    assert.equal(cfg.expo.extra?.nearsyDevClient, true);
  });

  it('accepts dev as an alias on both selectors', () => {
    const result = resolveGoogleServicesConfig({
      NEARSY_FIREBASE_ENV: 'dev',
      EXPO_PUBLIC_NEARSY_FIREBASE_ENV: 'DEV',
      GOOGLE_SERVICES_JSON_DEV: devFile,
      EAS_BUILD: 'true',
    });
    assert.deepEqual(result, { useNearsyDev: true, googleServicesFile: devFile });
  });

  it('accepts certificate hashes written with colons or upper case', () => {
    const colonFile = join(fixtureRoot, 'colon-hash.json');
    writeFileSync(
      colonFile,
      googleServices('nearsy-dev', DEV_MARKER, 'com.nearsy.app', {
        certificateHashes: ['9C:70:C7:9A:E4:D0:FE:22:E2:68:EA:5F:50:A7:42:B0:ED:F0:BC:8C'],
      }),
    );
    assert.equal(
      resolveGoogleServicesConfig({ ...DEV, EAS_BUILD: 'true', GOOGLE_SERVICES_JSON_DEV: colonFile }).googleServicesFile,
      colonFile,
    );
  });

  it('local runs without the variable use the gitignored nearsy-dev file (EAS OAuth client not required)', () => {
    assert.deepEqual(resolveGoogleServicesConfig({ ...DEV }, localWithDev), {
      useNearsyDev: true,
      googleServicesFile: './google-services.nearsy-dev.json',
    });
  });
});

describe('Production keeps the tracked google-services.json (nearsy-pj)', () => {
  const productionEnvs: Env[] = [
    {},
    { NEARSY_FIREBASE_ENV: 'production', NEARSY_DEV_CLIENT: 'false' },
    { NEARSY_FIREBASE_ENV: 'production', EAS_BUILD: 'true', GOOGLE_SERVICES_JSON_DEV: devFile },
    { NEARSY_FIREBASE_ENV: 'production', EXPO_PUBLIC_NEARSY_FIREBASE_ENV: 'production' },
  ];

  it('selects ./google-services.json and nearsy-pj extras, ignoring GOOGLE_SERVICES_JSON_DEV', () => {
    for (const env of productionEnvs) {
      const { cfg } = loadAppConfig(env);
      assert.equal(cfg.expo.android?.googleServicesFile, './google-services.json');
      assert.equal(cfg.expo.extra?.nearsyFirebaseEnv, 'production');
      assert.equal(cfg.expo.extra?.nearsyFirebaseProjectId, 'nearsy-pj');
    }
  });

  it('tracked production file is still nearsy-pj for com.nearsy.app', () => {
    const gs = JSON.parse(readFileSync(join(androidAppRoot, 'google-services.json'), 'utf8'));
    assert.equal(gs.project_info.project_id, 'nearsy-pj');
    assert.ok(
      gs.client.some(
        (c: any) => c.client_info.android_client_info.package_name === 'com.nearsy.app',
      ),
    );
  });

  it('eas.json: only development-nearsy-dev opts into nearsy-dev; production/preview unchanged', () => {
    const eas = JSON.parse(readFileSync(join(androidAppRoot, 'eas.json'), 'utf8'));
    const devProfile = eas.build['development-nearsy-dev'];
    assert.equal(devProfile.extends, 'development');
    assert.equal(devProfile.environment, 'development');
    assert.deepEqual(devProfile.env, {
      NEARSY_FIREBASE_ENV: 'development',
      EXPO_PUBLIC_NEARSY_FIREBASE_ENV: 'development',
      NEARSY_DEV_CLIENT: 'true',
    });
    assert.deepEqual(eas.build.production.env, {
      NEARSY_FIREBASE_ENV: 'production',
      NEARSY_DEV_CLIENT: 'false',
    });
    assert.deepEqual(eas.build.preview.env, {
      NEARSY_FIREBASE_ENV: 'production',
      NEARSY_DEV_CLIENT: 'false',
    });
    assert.equal(eas.build.development.env, undefined);
    const raw = readFileSync(join(androidAppRoot, 'eas.json'), 'utf8');
    assert.equal(raw.includes('GOOGLE_SERVICES_JSON_DEV'), false);
  });
});

describe('Development never falls back to the production google-services.json', () => {
  const failures: Array<{ name: string; env: Env; message: RegExp }> = [
    {
      name: 'EAS build without GOOGLE_SERVICES_JSON_DEV',
      env: { ...DEV, EAS_BUILD: 'true' },
      message: /GOOGLE_SERVICES_JSON_DEV \(EAS file variable, environment development\) is required/,
    },
    {
      name: 'file variable pointing to the tracked production file',
      env: { ...DEV, EAS_BUILD: 'true', GOOGLE_SERVICES_JSON_DEV: join(androidAppRoot, 'google-services.json') },
      message: /is not the nearsy-dev google-services file for com\.nearsy\.app/,
    },
    {
      name: 'file variable with a nearsy-pj file',
      env: { ...DEV, EAS_BUILD: 'true', GOOGLE_SERVICES_JSON_DEV: pjFile },
      message: /is not the nearsy-dev google-services file/,
    },
    {
      name: 'file variable without the com.nearsy.app client',
      env: { ...DEV, EAS_BUILD: 'true', GOOGLE_SERVICES_JSON_DEV: otherPackageFile },
      message: /is not the nearsy-dev google-services file for com\.nearsy\.app/,
    },
    {
      name: 'file variable pointing to a missing file',
      env: { ...DEV, EAS_BUILD: 'true', GOOGLE_SERVICES_JSON_DEV: join(easSecretDir, 'missing.json') },
      message: /is missing or is not a valid google-services JSON file/,
    },
    {
      name: 'file variable with invalid JSON',
      env: { ...DEV, EAS_BUILD: 'true', GOOGLE_SERVICES_JSON_DEV: brokenFile },
      message: /is missing or is not a valid google-services JSON file/,
    },
    {
      name: 'file variable without the EAS signing OAuth client (debug SHA-1 only)',
      env: { ...DEV, EAS_BUILD: 'true', GOOGLE_SERVICES_JSON_DEV: debugOnlyFile },
      message: /has no Android OAuth client for com\.nearsy\.app with the EAS signing certificate SHA-1/,
    },
    {
      name: 'file variable without any Android OAuth client',
      env: { ...DEV, EAS_BUILD: 'true', GOOGLE_SERVICES_JSON_DEV: noOAuthFile },
      message: /has no Android OAuth client for com\.nearsy\.app with the EAS signing certificate SHA-1/,
    },
    {
      name: 'file variable with a nearsy-pj reference',
      env: { ...DEV, EAS_BUILD: 'true', GOOGLE_SERVICES_JSON_DEV: pjReferenceFile },
      message: /GOOGLE_SERVICES_JSON_DEV references nearsy-pj\./,
    },
    {
      name: 'native selector development, public selector unset',
      env: { NEARSY_FIREBASE_ENV: 'development', GOOGLE_SERVICES_JSON_DEV: devFile },
      message: /must both be "development"/,
    },
    {
      name: 'public selector development, native selector production',
      env: {
        NEARSY_FIREBASE_ENV: 'production',
        EXPO_PUBLIC_NEARSY_FIREBASE_ENV: 'development',
        GOOGLE_SERVICES_JSON_DEV: devFile,
      },
      message: /must both be "development"/,
    },
  ];

  for (const { name, env, message } of failures) {
    it(`fails clearly: ${name}`, () => {
      const { error, calls } = loadAppConfigError(env);
      assert.match(error.message, /^\[app\.config\] /);
      assert.match(error.message, message);
      assertNoLeak(error.message, 'error message');
      assertNoLeak(String(error.stack ?? ''), 'error stack');
      for (const call of calls) assertNoLeak(call.text, `console.${call.method}`);
      const stderr = calls.filter((c) => c.method === 'stderr').map((c) => c.text);
      assert.deepEqual(stderr, [`${error.message}\n`], 'reason is reported once on stderr (visible in EAS logs)');
    });
  }

  it('local dev without the nearsy-dev file fails even if a production file exists', () => {
    assert.throws(
      () => resolveGoogleServicesConfig({ ...DEV }, localProdOnly),
      /Local google-services\.nearsy-dev\.json is missing or is not a valid google-services JSON file/,
    );
  });

  it('source never maps development to ./google-services.json', () => {
    const src = readFileSync(join(androidAppRoot, 'plugins/googleServicesConfig.js'), 'utf8');
    const devBranch = src.slice(src.indexOf('if (!nativeDev)'), src.indexOf('module.exports'));
    assert.equal(
      (devBranch.match(/PRODUCTION_GOOGLE_SERVICES_FILE/g) ?? []).length,
      1,
      'production file referenced only in the non-development return',
    );
  });
});

describe('No path or content leaks', () => {
  it('extra and console output never contain the file variable path or file content', () => {
    const { cfg, calls } = loadAppConfig({
      ...DEV,
      NEARSY_DEV_CLIENT: 'true',
      EAS_BUILD: 'true',
      GOOGLE_SERVICES_JSON_DEV: devFile,
    });
    assertNoLeak(JSON.stringify(cfg.expo.extra), 'expo.extra');
    for (const call of calls) assertNoLeak(call.text, `console.${call.method}`);
    const { android: _android, ...rest } = cfg.expo;
    assertNoLeak(JSON.stringify(rest), 'expo config outside android.googleServicesFile');
  });

  it('config source files do not log the google-services path or content', () => {
    for (const file of ['app.config.js', 'plugins/googleServicesConfig.js']) {
      const src = readFileSync(join(androidAppRoot, file), 'utf8');
      assert.doesNotMatch(src, /console\.\w+\([^)]*(googleServicesFile|devFile|GOOGLE_SERVICES_JSON_DEV|absolutePath|parsed)/, file);
      assert.doesNotMatch(src, /stderr\.write\([^)]*(googleServicesFile|devFile|absolutePath|parsed|raw)/, file);
    }
    const helper = readFileSync(join(androidAppRoot, 'plugins/googleServicesConfig.js'), 'utf8');
    assert.doesNotMatch(helper, /\$\{(devFile|absolutePath|parsed)[^}]*\}/);
  });
});

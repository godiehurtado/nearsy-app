/**
 * Regression guard: production Firebase native env must not be assumed from
 * JS extras alone. EAS upload must exclude generated android/ so production
 * prebuild can apply tracked google-services.json (nearsy-pj).
 *
 * Run:
 *   node --experimental-strip-types --test packages/shared/src/__tests__/androidProdFirebaseNativeEnvGuard.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../../../..');
const androidAppRoot = join(repoRoot, 'apps/nearsy-android');

function readRepo(relativeFromRoot: string): string {
  return readFileSync(join(repoRoot, relativeFromRoot), 'utf8');
}

describe('Android prod Firebase native env upload guard', () => {
  it('.easignore excludes generated android/ and nearsy-dev google-services', () => {
    const easignore = readRepo('.easignore').replace(/\r\n/g, '\n');
    // .easignore replaces .gitignore during EAS upload — these must be explicit.
    assert.match(
      easignore,
      /(?:^|\n)apps\/nearsy-android\/android\/(?:\n|$)/,
      'apps/nearsy-android/android/ must be listed in root .easignore',
    );
    assert.match(
      easignore,
      /(?:^|\n)\*\*\/google-services\.nearsy-dev\.json(?:\n|$)/,
      '**/google-services.nearsy-dev.json must be listed in root .easignore',
    );
  });

  it('tracked production google-services.json is nearsy-pj', () => {
    const gs = JSON.parse(
      readFileSync(join(androidAppRoot, 'google-services.json'), 'utf8'),
    ) as {
      project_info?: {
        project_id?: string;
        project_number?: string;
        storage_bucket?: string;
      };
    };
    assert.equal(gs.project_info?.project_id, 'nearsy-pj');
    assert.equal(gs.project_info?.project_number, '557470198780');
    assert.equal(
      gs.project_info?.storage_bucket,
      'nearsy-pj.firebasestorage.app',
    );
  });

  it('production app.config selects tracked google-services and nearsy-pj extras', () => {
    const previousEnv = process.env.NEARSY_FIREBASE_ENV;
    const previousDevClient = process.env.NEARSY_DEV_CLIENT;
    process.env.NEARSY_FIREBASE_ENV = 'production';
    process.env.NEARSY_DEV_CLIENT = 'false';
    try {
      const require = createRequire(join(androidAppRoot, 'package.json'));
      // Fresh load so env selection is re-evaluated.
      const resolved = require.resolve('./app.config.js');
      delete require.cache[resolved];
      const cfg = require('./app.config.js') as {
        expo: {
          version?: string;
          android?: { googleServicesFile?: string };
          extra?: {
            nearsyFirebaseEnv?: string;
            nearsyFirebaseProjectId?: string;
            nearsyDevClient?: boolean;
          };
        };
      };
      assert.equal(cfg.expo.android?.googleServicesFile, './google-services.json');
      assert.equal(cfg.expo.extra?.nearsyFirebaseEnv, 'production');
      assert.equal(cfg.expo.extra?.nearsyFirebaseProjectId, 'nearsy-pj');
      assert.equal(cfg.expo.extra?.nearsyDevClient, false);
      assert.equal(cfg.expo.version, '2.0.0');
    } finally {
      if (previousEnv === undefined) delete process.env.NEARSY_FIREBASE_ENV;
      else process.env.NEARSY_FIREBASE_ENV = previousEnv;
      if (previousDevClient === undefined) delete process.env.NEARSY_DEV_CLIENT;
      else process.env.NEARSY_DEV_CLIENT = previousDevClient;
    }
  });

  it('production eas profile forces prebuild --clean and production Firebase env', () => {
    const eas = JSON.parse(readRepo('apps/nearsy-android/eas.json')) as {
      build?: {
        production?: {
          autoIncrement?: boolean;
          prebuildCommand?: string;
          env?: Record<string, string>;
        };
      };
    };
    const prod = eas.build?.production;
    assert.ok(prod);
    assert.equal(prod?.autoIncrement, true);
    assert.match(
      String(prod?.prebuildCommand ?? ''),
      /expo prebuild --platform android --clean/,
    );
    assert.equal(prod?.env?.NEARSY_FIREBASE_ENV, 'production');
    assert.equal(prod?.env?.NEARSY_DEV_CLIENT, 'false');
  });
});

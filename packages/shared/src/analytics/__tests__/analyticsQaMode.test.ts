/**
 * QA capture: test binaries on nearsy-dev send to PostHog with every event and
 * person marked as a test. Never with nearsy-pj, never together with another mode.
 * The token is fake.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { resolveAnalyticsConfig } from '../analyticsConfig.ts';
import { applyInstallClassification } from '../analyticsContract.ts';

const nodeRequire = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, '..', '..', '..', '..', '..', 'apps', 'nearsy-android');
const FAKE_TOKEN = 'phc_fake_token_only_for_this_test_0001';
const { resolveAnalyticsExtras } = nodeRequire(join(appDir, 'plugins', 'analyticsBuildConfig.js'));

type BuildProfile = { extends?: string; env?: Record<string, string> };
function profileEnv(name: string): Record<string, string> {
  const { build } = JSON.parse(readFileSync(join(appDir, 'eas.json'), 'utf8')) as {
    build: Record<string, BuildProfile>;
  };
  const profile = build[name];
  return { ...(profile.extends ? profileEnv(profile.extends) : {}), ...profile.env };
}

const devExtras = (nearsyAnalytics: unknown) => ({
  nearsyFirebaseEnv: 'development',
  nearsyFirebaseProjectId: 'nearsy-dev',
  nearsyDevClient: true,
  nearsyAnalytics,
});

describe('QA analytics mode (nearsy-dev)', () => {
  it('only appsflyer-nearsy-dev declares QA capture', () => {
    const { build } = JSON.parse(readFileSync(join(appDir, 'eas.json'), 'utf8')) as {
      build: Record<string, unknown>;
    };
    const declaring = Object.keys(build).filter(
      (name) => profileEnv(name).NEARSY_ANALYTICS_QA_ENABLED === 'true',
    );
    assert.deepEqual(declaring, ['appsflyer-nearsy-dev']);
    const env = profileEnv('appsflyer-nearsy-dev');
    assert.equal(env.NEARSY_FIREBASE_ENV, 'development');
    assert.equal(env.NEARSY_ANALYTICS_ENABLED, undefined);
    assert.equal(env.NEARSY_ANALYTICS_BETA_ENABLED, undefined);
  });

  it('build: QA on nearsy-dev carries its marks and token; never on nearsy-pj', () => {
    const qa = resolveAnalyticsExtras({
      NEARSY_FIREBASE_ENV: 'development',
      NEARSY_ANALYTICS_QA_ENABLED: 'true',
      NEARSY_POSTHOG_TOKEN: FAKE_TOKEN,
    });
    assert.deepEqual(qa.qa, {
      enabled: true,
      environment: 'development',
      distributionChannel: 'qa',
      token: FAKE_TOKEN,
    });
    assert.equal(qa.enabled, false);
    assert.equal(qa.beta, undefined);
    const prod = resolveAnalyticsExtras({
      NEARSY_FIREBASE_ENV: 'production',
      NEARSY_ANALYTICS_QA_ENABLED: 'true',
      NEARSY_POSTHOG_TOKEN: FAKE_TOKEN,
    });
    assert.equal(prod.qa, undefined);
    assert.equal(JSON.stringify(prod).includes(FAKE_TOKEN), false);
  });

  it('build: QA together with another mode carries no capture at all', () => {
    const both = resolveAnalyticsExtras({
      NEARSY_FIREBASE_ENV: 'development',
      NEARSY_ANALYTICS_QA_ENABLED: 'true',
      NEARSY_ANALYTICS_ENABLED: 'true',
      NEARSY_ANALYTICS_ENV: 'production',
      NEARSY_POSTHOG_TOKEN: FAKE_TOKEN,
    });
    assert.equal(both.qa, undefined);
    assert.equal(both.enabled, false);
    assert.equal(JSON.stringify(both).includes(FAKE_TOKEN), false);
  });

  it('build: a QA build without a valid token fails on the EAS worker, without printing it', () => {
    assert.throws(
      () =>
        resolveAnalyticsExtras({
          EAS_BUILD: 'true',
          NEARSY_FIREBASE_ENV: 'development',
          NEARSY_ANALYTICS_QA_ENABLED: 'true',
          NEARSY_POSTHOG_TOKEN: 'not-a-token',
        }),
      (error: Error) =>
        /QA build/.test(error.message) &&
        /"development"/.test(error.message) &&
        !error.message.includes('not-a-token'),
    );
  });

  it('runtime: QA only with nearsy-dev in the extras and in the initialized app', () => {
    const declared = {
      qa: { enabled: true, environment: 'development', distributionChannel: 'qa', token: FAKE_TOKEN },
    };
    assert.deepEqual(
      resolveAnalyticsConfig({ extras: devExtras(declared), isDev: false, runtimeFirebaseProjectId: 'nearsy-dev' }),
      {
        mode: 'qa',
        environment: 'development',
        distributionChannel: 'qa',
        token: FAKE_TOKEN,
        host: 'https://us.i.posthog.com',
      },
    );
    assert.equal(
      resolveAnalyticsConfig({ extras: devExtras(declared), isDev: false, runtimeFirebaseProjectId: 'nearsy-pj' }).mode,
      'off',
    );
    assert.equal(
      resolveAnalyticsConfig({
        extras: { ...devExtras(declared), nearsyFirebaseEnv: 'production', nearsyFirebaseProjectId: 'nearsy-pj' },
        isDev: false,
        runtimeFirebaseProjectId: 'nearsy-pj',
      }).mode,
      'off',
    );
    assert.equal(
      resolveAnalyticsConfig({ extras: devExtras(declared), isDev: true, runtimeFirebaseProjectId: 'nearsy-dev' }).mode,
      'inspect',
    );
    assert.deepEqual(
      resolveAnalyticsConfig({
        extras: devExtras({ ...declared, beta: { enabled: true } }),
        isDev: false,
        runtimeFirebaseProjectId: 'nearsy-dev',
      }),
      { mode: 'off', reason: 'ambiguous_mode' },
    );
  });

  it('every QA event carries is_test_user and distribution_channel qa', () => {
    const marked = applyInstallClassification(
      { event: 'signup_completed', properties: { signup_source: 's' } },
      { is_test_user: true, distribution_channel: 'qa' },
    );
    assert.equal(marked.properties.is_test_user, true);
    assert.equal(marked.properties.distribution_channel, 'qa');
  });

  it('the Android binding marks QA installs and accounts like Beta', () => {
    const source = readFileSync(join(here, '..', 'analytics.android.ts'), 'utf8').replace(/\r\n/g, '\n');
    assert.ok(source.includes("config.mode === 'beta' || config.mode === 'qa'\n            ? {"));
    assert.ok(
      source.includes(
        "config.mode === 'beta' || config.mode === 'qa'\n        ? { accountClassification: { is_test_user: true } }",
      ),
    );
  });
});

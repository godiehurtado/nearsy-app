/**
 * Beta mode, the sending transport, person properties across modes and the
 * compatibility contract. The SDK is the real class; the network is scripted.
 * None of this proves native or Hermes behaviour.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { POSTHOG_US_HOST, resolveAnalyticsConfig } from '../analyticsConfig.ts';
import {
  applyInstallClassification,
  buildMatchMadeEvent,
  type AnalyticsProperties,
} from '../analyticsContract.ts';
import { createAnalyticsSession, type AnalyticsTransport } from '../analyticsCore.ts';
import {
  buildPersonProperties,
  createPersonModeMemory,
  MODE_SCOPED_PERSON_PROPERTIES,
  personKeysToUnset,
} from '../analyticsPersonProperties.ts';
import { classifySdkRequest, createSdkTransport, type TransportIssue } from '../analyticsSdkTransport.ts';
import {
  FAST_SDK_OPTIONS,
  installFakeServer,
  loadRealPostHog,
  restoreGlobals,
  tick,
  type ServerAnswer,
} from './realSdkHarness.ts';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const TOKEN = 'phc_abcdefghijklmnopqrstuvwxyz';
const CONFIG_URL = `https://us-assets.i.posthog.com/array/${TOKEN}/config`;
const BATCH_URL = `${POSTHOG_US_HOST}/batch/`;
const BETA_STAMP = { is_test_user: true, distribution_channel: 'beta' } as const;

let PostHog: unknown;
before(() => {
  PostHog = loadRealPostHog();
});
after(restoreGlobals);

function sendingTransport(options: {
  issues?: TransportIssue[];
  installClassification?: typeof BETA_STAMP;
  sdkOptions?: Record<string, unknown>;
  persistence?: 'file' | 'memory';
} = {}) {
  return createSdkTransport({
    PostHog,
    token: TOKEN,
    host: POSTHOG_US_HOST,
    persistence: options.persistence ?? 'memory',
    onTransportIssue: (issue) => options.issues?.push(issue),
    ...(options.installClassification
      ? { installClassification: options.installClassification }
      : {}),
    sdkOptions: { ...FAST_SDK_OPTIONS, ...options.sdkOptions },
  });
}

/** Answers config as a healthy server would, and batches with `batch`. */
function answering(batch: () => ServerAnswer | undefined = () => undefined, config?: ServerAnswer) {
  return (request: { url: string }): ServerAnswer | undefined =>
    request.url === CONFIG_URL
      ? (config ?? { status: 200, body: { hasFeatureFlags: false, supportedCompression: [] } })
      : batch();
}

describe('sending transport: what the SDK requests', () => {
  it('asks for remote config on the assets host and for nothing else at startup', async () => {
    const server = installFakeServer(answering());
    await sendingTransport();
    await tick();
    assert.deepEqual(server.paths(), [CONFIG_URL]);
    assert.equal(server.requests[0].method, 'GET');
    assert.deepEqual(server.requests[0].batch, []);
  });

  it('a config enabling everything cannot start flags, surveys, replay or errors', async () => {
    const server = installFakeServer(
      answering(undefined, {
        status: 200,
        body: {
          hasFeatureFlags: true,
          supportedCompression: [],
          surveys: [{ id: 's1' }],
          sessionRecording: { endpoint: '/s/' },
          errorTracking: { autocaptureExceptions: true },
          capturePerformance: { network_timing: true },
        },
      }),
    );
    const transport = await sendingTransport();
    await tick();
    await transport.identify('uid-a', {});
    await transport.setPersonProperties({ occupation: 'x' });
    await transport.unsetPersonProperties(['occupation']);
    await transport.capture('app_opened', {});
    await transport.reset();
    await transport.flush();
    await tick();
    assert.deepEqual([...new Set(server.paths())].sort(), [BATCH_URL, CONFIG_URL].sort());
    assert.deepEqual(
      server.events().map((item) => item.event),
      ['$identify', '$set', '$set', 'app_opened'],
    );
  });

  it('compression follows the real answer; the empty local answer used to turn it off', async () => {
    for (const [supported, gzip] of [[['gzip-js'], true], [[], false]] as const) {
      const server = installFakeServer(
        answering(undefined, {
          status: 200,
          body: { hasFeatureFlags: false, supportedCompression: supported },
        }),
      );
      const transport = await sendingTransport({ sdkOptions: { disableCompression: false } });
      await tick();
      await transport.capture('app_opened', {});
      await transport.flush();
      assert.equal(server.batches()[0].gzip, gzip);
    }
  });

  it('a failed config is reported, and events still arrive', async () => {
    for (const config of [{ status: 503 }, new Error('offline')] as ServerAnswer[]) {
      const issues: TransportIssue[] = [];
      const server = installFakeServer(answering(undefined, config));
      const transport = await sendingTransport({ issues });
      await tick();
      await transport.capture('app_opened', {});
      await transport.flush();
      assert.equal(server.events().length, 1);
      assert.equal(issues[0].kind, 'config_failed');
    }
  });

  it('classifies by exact host and path', () => {
    const sender = { host: POSTHOG_US_HOST, token: TOKEN };
    assert.equal(classifySdkRequest(BATCH_URL, sender), 'batch');
    assert.equal(classifySdkRequest(CONFIG_URL, sender), 'config');
    for (const url of [
      `${POSTHOG_US_HOST}/flags/?v=2`,
      `${POSTHOG_US_HOST}/i/v1/logs?token=x`,
      `${POSTHOG_US_HOST}/api/surveys/?token=x`,
      `https://evil.test/batch/`,
      `https://us-assets.i.posthog.com/batch/`,
      `https://us-assets.i.posthog.com/array/phc_other/config`,
      'not a url',
    ]) {
      assert.equal(classifySdkRequest(url, sender), 'other', url);
    }
  });

  it('refuses any other request with an error, not with a fictitious success', async () => {
    const calls: string[] = [];
    let instance: { fetch(url: string): Promise<unknown> } | undefined;
    class FakeSdk {
      constructor() {
        instance = this as unknown as typeof instance;
      }
      async fetch(url: string) {
        calls.push(url);
        return { status: 200 };
      }
      async ready() {}
    }
    const issues: TransportIssue[] = [];
    await createSdkTransport({
      PostHog: FakeSdk,
      token: TOKEN,
      host: POSTHOG_US_HOST,
      persistence: 'memory',
      onTransportIssue: (issue) => issues.push(issue),
    });
    await assert.rejects(instance!.fetch(`${POSTHOG_US_HOST}/flags/?v=2`));
    assert.deepEqual(calls, []);
    assert.deepEqual(issues, [{ kind: 'request_blocked' }]);
    await instance!.fetch(BATCH_URL);
    assert.deepEqual(calls, [BATCH_URL]);
  });
});

describe('sending transport: ingestion with the real SDK', () => {
  it('identify, set, set_once and unset keep their format', async () => {
    const server = installFakeServer(answering());
    const transport = await sendingTransport();
    await transport.identify('uid-a', { email: 'a@example.test' });
    await transport.setPersonProperties({ occupation: 'x' }, { signup_source: 'qr' });
    await transport.unsetPersonProperties(['interests']);
    await transport.flush();
    const [identify, set, unset] = server.events();
    assert.equal(identify.event, '$identify');
    assert.equal(identify.distinct_id, 'uid-a');
    assert.equal(identify.properties.$set.email, 'a@example.test');
    assert.ok(identify.properties.$anon_distinct_id);
    assert.deepEqual(set.properties.$set, { occupation: 'x' });
    assert.deepEqual(set.properties.$set_once, { signup_source: 'qr' });
    assert.deepEqual(unset.properties.$unset, ['interests']);
    assert.equal(transport.getIdentifiedDistinctId(), 'uid-a');
  });

  it('events carry the SDK session, and the session rotates on the SDK clock', async () => {
    const server = installFakeServer(answering());
    const transport = await sendingTransport({
      sdkOptions: { sessionExpirationTimeSeconds: 0.02 },
    });
    const first = transport.getSessionId();
    await transport.capture('app_opened', {});
    await tick(40);
    const second = transport.getSessionId();
    assert.notEqual(first, second);
    await transport.capture('app_opened', {});
    await transport.flush();
    assert.deepEqual(
      server.events().map((item) => item.properties.$session_id),
      [first, second],
    );
  });

  it('retries a server error and delivers the same event, reporting each failure', async () => {
    const answers: ServerAnswer[] = [{ status: 503 }, { status: 429 }];
    const issues: TransportIssue[] = [];
    const server = installFakeServer(answering(() => answers.shift()));
    const transport = await sendingTransport({ issues });
    await transport.capture('app_opened', {});
    await transport.flush();
    const batches = server.batches();
    assert.equal(batches.length, 3);
    assert.equal(new Set(batches.map((item) => item.batch[0].uuid)).size, 1);
    assert.deepEqual(issues, [
      { kind: 'batch_rejected', status: 503 },
      { kind: 'batch_rejected', status: 429 },
    ]);
  });

  it('after the last retry a server error drops the batch, and says so', async () => {
    const issues: TransportIssue[] = [];
    const server = installFakeServer(answering(() => ({ status: 503 })));
    const transport = await sendingTransport({ issues });
    await transport.capture('app_opened', {});
    await assert.rejects(transport.flush());
    assert.equal(server.batches().length, 3);
    assert.equal(issues.length, 3);
    const before = server.batches().length;
    await transport.flush();
    assert.equal(server.batches().length, before);
  });

  it('keeps the queue through a network failure and sends it on the next flush', async () => {
    let online = false;
    const issues: TransportIssue[] = [];
    const server = installFakeServer(
      answering(() => (online ? undefined : new Error('offline'))),
    );
    const transport = await sendingTransport({ issues });
    await transport.capture('app_opened', {});
    await assert.rejects(transport.flush());
    assert.ok(issues.some((issue) => issue.kind === 'batch_network_error'));
    online = true;
    const before = server.batches().length;
    await transport.flush();
    const delivered = server.batches().slice(before);
    assert.equal(delivered.length, 1);
    assert.equal(delivered[0].batch[0].event, 'app_opened');
  });

  it('a rejected batch is not hidden, and it does not block what follows', async () => {
    const answers: ServerAnswer[] = [{ status: 401 }];
    const issues: TransportIssue[] = [];
    const server = installFakeServer(answering(() => answers.shift()));
    const transport = await sendingTransport({ issues });
    await transport.capture('app_opened', {});
    await assert.rejects(transport.flush());
    assert.deepEqual(issues, [{ kind: 'batch_rejected', status: 401 }]);
    await transport.capture('signup_completed', {});
    await transport.flush();
    assert.deepEqual(
      server.batches().at(-1)?.batch.map((item) => item.event),
      ['signup_completed'],
    );
  });

  it('a batch too large is split by the SDK, without losing events', async () => {
    const answers: ServerAnswer[] = [{ status: 413 }];
    const server = installFakeServer(answering(() => answers.shift()));
    const transport = await sendingTransport();
    await transport.capture('app_opened', {});
    await transport.capture('signup_completed', {});
    await transport.flush();
    const delivered = server.batches().slice(1).flatMap((item) => item.batch);
    assert.deepEqual(delivered.map((item) => item.event), ['app_opened', 'signup_completed']);
  });

  it('a queue and an identity on storage survive a restart', async () => {
    const stored = new Map<string, string>();
    const customStorage = {
      getItem: async (key: string) => stored.get(key) ?? null,
      setItem: async (key: string, value: string) => void stored.set(key, value),
    };
    let online = false;
    const server = installFakeServer(answering(() => (online ? undefined : new Error('offline'))));
    const firstRun = await sendingTransport({ persistence: 'file', sdkOptions: { customStorage } });
    await firstRun.identify('uid-a', {});
    await firstRun.capture('app_opened', {});
    await firstRun.flush().catch(() => {});
    for (let waited = 0; waited < 40 && !JSON.stringify([...stored.values()]).includes('app_opened'); waited += 1) {
      await tick(50);
    }

    online = true;
    const before = server.batches().length;
    const secondRun = await sendingTransport({ persistence: 'file', sdkOptions: { customStorage } });
    assert.equal(secondRun.getIdentifiedDistinctId(), 'uid-a');
    await secondRun.flush();
    const delivered = server.batches().slice(before).flatMap((item) => item.batch);
    assert.deepEqual(delivered.map((item) => item.event), ['$identify', 'app_opened']);
    assert.ok(delivered.every((item) => item.distinct_id === 'uid-a'));
  });

  it('turns off what the app does not use, with options the SDK really has', () => {
    const source = readFileSync(join(here, '..', 'analyticsSdkTransport.ts'), 'utf8');
    const entry = require.resolve('posthog-react-native');
    const types =
      readFileSync(entry.replace(/index\.js$/, 'posthog-rn.d.ts'), 'utf8') +
      readFileSync(require.resolve('@posthog/core').replace(/index\.js$/, 'types.d.ts'), 'utf8');
    for (const option of [
      'captureAppLifecycleEvents',
      'enableSessionReplay',
      'preloadFeatureFlags',
      'disableRemoteFeatureFlags',
      'disableSurveys',
      'capturePushNotificationSubscriptions',
      'capturePushNotificationOpened',
      'setDefaultPersonProperties',
    ]) {
      assert.ok(source.includes(`${option}:`), option);
      assert.ok(types.includes(`${option}?:`), option);
    }
    // Declared, but deprecated and read by nothing: it cannot stop the request.
    assert.ok(types.includes('@deprecated Remote config is now always loaded'));
    const core = readFileSync(
      require.resolve('@posthog/core').replace(/index\.js$/, 'posthog-core.js'),
      'utf8',
    );
    assert.ok(!core.includes('disableRemoteConfig'));
  });
});

describe('beta configuration', () => {
  const BETA_EXTRAS = {
    nearsyFirebaseEnv: 'production',
    nearsyFirebaseProjectId: 'nearsy-pj',
    nearsyDevClient: false,
    nearsyAnalytics: {
      enabled: false,
      beta: {
        enabled: true,
        environment: 'production',
        distributionChannel: 'beta',
        token: TOKEN,
      },
    },
  };
  const resolve = (over: object = {}, project: unknown = 'nearsy-pj', isDev = false) =>
    resolveAnalyticsConfig({
      extras: { ...BETA_EXTRAS, ...over },
      isDev,
      runtimeFirebaseProjectId: project,
    });
  const withBeta = (beta: object) => ({
    nearsyAnalytics: {
      enabled: false,
      beta: { ...BETA_EXTRAS.nearsyAnalytics.beta, ...beta },
    },
  });

  it('runs on production Firebase and asks for no development project', () => {
    assert.deepEqual(resolve(), {
      mode: 'beta',
      environment: 'production',
      distributionChannel: 'beta',
      token: TOKEN,
      host: POSTHOG_US_HOST,
    });
  });

  it('stays off unless the build declares it, general capture included', () => {
    assert.deepEqual(resolveAnalyticsConfig({ extras: {}, isDev: false }), {
      mode: 'off',
      reason: 'not_enabled',
    });
    const reasons: Array<[object, unknown, string]> = [
      [withBeta({ enabled: false }), 'nearsy-pj', 'not_enabled'],
      [withBeta({ distributionChannel: 'internal' }), 'nearsy-pj', 'beta_not_declared'],
      [withBeta({ environment: 'preview' }), 'nearsy-pj', 'beta_not_declared'],
      [withBeta({ token: 'phx_personal' }), 'nearsy-pj', 'invalid_token'],
      [{ nearsyFirebaseProjectId: 'nearsy-dev' }, 'nearsy-pj', 'firebase_environment_mismatch'],
      [{ nearsyFirebaseEnv: 'development' }, 'nearsy-pj', 'firebase_environment_mismatch'],
      [{ nearsyDevClient: true }, 'nearsy-pj', 'firebase_environment_mismatch'],
      [{}, 'nearsy-dev', 'firebase_environment_mismatch'],
      [{}, null, 'firebase_environment_mismatch'],
    ];
    for (const [over, project, reason] of reasons) {
      assert.deepEqual(resolve(over, project), { mode: 'off', reason });
    }
  });

  it('a build asking for both populations sends nothing', () => {
    const both = {
      nearsyAnalytics: { ...BETA_EXTRAS.nearsyAnalytics, enabled: true, environment: 'production', token: TOKEN },
    };
    assert.deepEqual(resolve(both), { mode: 'off', reason: 'ambiguous_mode' });
  });

  it('a development build never reaches Beta', () => {
    assert.equal(resolve({}, 'nearsy-pj', true).mode, 'inspect');
  });

  it('the build plugin adds the token only for a declared Beta', () => {
    const { resolveAnalyticsExtras } = require(
      '../../../../../apps/nearsy-android/plugins/analyticsBuildConfig.js',
    );
    const env = {
      NEARSY_ANALYTICS_BETA_ENABLED: 'true',
      NEARSY_ANALYTICS_DISTRIBUTION_CHANNEL: 'beta',
      NEARSY_ANALYTICS_ENV: 'production',
      NEARSY_POSTHOG_TOKEN: TOKEN,
    };
    const extras = resolveAnalyticsExtras(env);
    assert.equal(extras.enabled, false);
    assert.deepEqual(extras.beta, {
      enabled: true,
      environment: 'production',
      distributionChannel: 'beta',
      token: TOKEN,
    });
    const { NEARSY_ANALYTICS_DISTRIBUTION_CHANNEL: _channel, ...undeclared } = env;
    assert.ok(!JSON.stringify(resolveAnalyticsExtras(undeclared)).includes('phc_'));
  });
});

describe('beta classification with the real SDK', () => {
  function makeBetaSession(transport: AnalyticsTransport, user: { uid: string; email?: string } | null) {
    const auth = { user };
    const session = createAnalyticsSession({
      loadTransport: async () => transport,
      getAuthUser: () => auth.user,
      readCreationTime: () => undefined,
      buildBaseProperties: (next) => (next.email ? { email: next.email } : {}),
      buildProfileProperties: () => null,
      superProperties: { environment: 'production', platform: 'Android' },
      now: () => 0,
      accountClassification: { is_test_user: true },
    });
    return { auth, session };
  }

  it('marks anonymous events, uses the real UID, and keeps two accounts apart', async () => {
    const server = installFakeServer(answering());
    const transport = await sendingTransport({ installClassification: BETA_STAMP });
    const { auth, session } = makeBetaSession(transport, null);

    session.trackAppOpened();
    await session.settled();

    auth.user = { uid: 'uid-a', email: 'a@example.test' };
    session.noteAuthChange();
    session.trackSignupCompleted('uid-a');
    await session.settled();

    auth.user = null;
    session.noteAuthChange();
    session.trackAppOpened();
    await session.settled();

    auth.user = { uid: 'uid-b', email: 'b@example.test' };
    session.noteAuthChange();
    await session.settled();
    await transport.flush();

    const events = server.events();
    assert.deepEqual(events.map((item) => item.event), [
      'app_opened',
      '$identify',
      '$set',
      'signup_completed',
      'app_opened',
      '$identify',
      '$set',
    ]);
    for (const item of events) {
      assert.equal(item.properties.is_test_user, true, item.event);
      assert.equal(item.properties.distribution_channel, 'beta', item.event);
    }
    // An anonymous event creates no person.
    assert.equal(events[0].properties.$process_person_profile, false);
    // Real UIDs, with no prefix.
    assert.equal(events[1].distinct_id, 'uid-a');
    assert.equal(events[5].distinct_id, 'uid-b');
    // The account is classified by set_once, each with its own data only.
    assert.deepEqual(events[2].properties.$set_once, { is_test_user: true });
    assert.deepEqual(events[6].properties.$set_once, { is_test_user: true });
    assert.equal(events[5].properties.$set.email, 'b@example.test');
    assert.ok(!JSON.stringify(events.slice(4)).includes('a@example.test'));
    // After logout, the anonymous event belongs to neither account.
    assert.notEqual(events[4].distinct_id, 'uid-a');
    assert.notEqual(events[4].distinct_id, events[0].distinct_id);
  });

  it('an identity restored from an earlier run is classified without identify', async () => {
    const calls: unknown[] = [];
    const transport: AnalyticsTransport = {
      getIdentifiedDistinctId: () => 'uid-a',
      getSessionId: () => 's1',
      identify: () => void calls.push('identify'),
      setPersonProperties: (_set, once) => void calls.push(once),
      unsetPersonProperties: () => {},
      reset: () => {},
      register: () => {},
      capture: () => {},
    };
    const { session } = makeBetaSession(transport, { uid: 'uid-a' });
    session.trackAppOpened();
    session.trackAppOpened();
    await session.settled();
    assert.deepEqual(calls, [{ is_test_user: true }]);
  });

  it('a general build writes no classification and clears marks left by a Beta install', async () => {
    const server = installFakeServer(answering());
    const transport = await sendingTransport();
    await transport.register({ is_test_user: true, distribution_channel: 'beta' });
    await transport.identify('uid-a', {});
    await transport.capture('app_opened', {});
    await transport.setPersonProperties({ is_test_user: false, occupation: 'x' }, { is_test_user: false });
    await transport.flush();
    for (const item of server.events()) {
      assert.ok(!('is_test_user' in item.properties), item.event);
      assert.ok(!('distribution_channel' in item.properties), item.event);
      assert.ok(!('is_test_user' in (item.properties.$set ?? {})), item.event);
      assert.ok(!('is_test_user' in (item.properties.$set_once ?? {})), item.event);
    }
    assert.equal(server.events().at(-1)?.properties.$set.occupation, 'x');
  });

  it('a false classification cannot be written, even in a Beta build', () => {
    const event = applyInstallClassification(
      { properties: {}, $set: { is_test_user: false, a: 1 }, $set_once: { is_test_user: true } },
      BETA_STAMP,
    );
    assert.deepEqual(event.$set, { a: 1 });
    assert.deepEqual(event.$set_once, { is_test_user: true });
  });

  it('nothing else writes is_test_user', () => {
    const binding = readFileSync(join(here, '..', 'analytics.android.ts'), 'utf8');
    assert.equal(binding.match(/is_test_user/g)?.length, 2);
    assert.ok(binding.includes("config.mode === 'beta' ? { accountClassification: { is_test_user: true } }"));
  });
});

describe('person properties across modes', () => {
  const VERIFIED_KEYS = ['social_platforms_verified', 'socials_connected', 'has_socials'];
  const INTERESTS = ['interests', 'interests_custom', 'interests_custom_normalized', 'interests_count', 'interests_catalog_count', 'interests_custom_count'];
  const AFFILIATIONS = ['affiliations', 'affiliations_custom', 'affiliations_custom_normalized', 'affiliations_count', 'affiliations_catalog_count', 'affiliations_custom_count'];

  const modernBoth = {
    personalOnboardingInterests: [{ id: 'music_rock' }, { id: 'custom_music_x', name: 'Personal hobby', isCustom: true }],
    personalOnboardingAffiliations: [{ id: 'personal_club', source: 'provider' }],
    socialLinksPersonal: { website: 'https://personal.test' },
    profiles: {
      personal: { occupation: 'Student' },
      professional: { occupation: 'Engineer' },
    },
    professionalOnboardingInterests: [{ id: 'business_ai' }],
    professionalOnboardingAffiliations: [{ id: 'pro_company', source: 'provider' }],
    socialLinksProfessional: { linkedin: 'https://linkedin.test/x' },
  };

  /** A person on the server, with the mode memory and the verified reads of one device. */
  function makeDevice(start: Record<string, unknown> = {}) {
    const person: Record<string, unknown> = { ...start };
    const stored = new Map<string, string>();
    const verified: Record<string, string[] | undefined> = {};
    const memory = createPersonModeMemory({
      getItem: async (key) => stored.get(key) ?? null,
      setItem: async (key, value) => void stored.set(key, value),
    });
    const transport: AnalyticsTransport = {
      getIdentifiedDistinctId: () => 'u1',
      getSessionId: () => 's1',
      identify: () => {},
      setPersonProperties: (set) => void Object.assign(person, set),
      unsetPersonProperties: (names) => {
        for (const name of names) delete person[name];
      },
      reset: () => {},
      register: () => {},
      capture: () => {},
    };
    const startProcess = () =>
      createAnalyticsSession({
        loadTransport: async () => transport,
        getAuthUser: () => ({ uid: 'u1' }),
        readCreationTime: () => undefined,
        buildBaseProperties: () => ({}),
        buildProfileProperties: (_user, doc) =>
          buildPersonProperties({
            doc,
            authEmail: null,
            normalizeLanguages: () => [],
            verifiedSocialsFor: (mode) => verified[mode],
          }),
        profileKeysToUnset: async (user, doc, properties) =>
          personKeysToUnset({
            doc,
            properties,
            previousMode: await memory.read(user.uid),
          }),
        onProfileSynced: (user, doc) => memory.write(user.uid, (doc as { mode?: unknown } | null)?.mode),
        superProperties: {},
        now: () => 0,
      });
    return { person, verified, stored, startProcess };
  }

  async function sync(session: ReturnType<ReturnType<typeof makeDevice>['startProcess']>, doc: unknown) {
    session.syncPersonProfile('u1', doc);
    await session.settled();
  }

  it('modern to modern: every value belongs to the new mode', async () => {
    const device = makeDevice();
    device.verified.personal = ['instagram'];
    device.verified.professional = ['x'];
    const session = device.startProcess();
    await sync(session, { ...modernBoth, mode: 'personal' });
    assert.equal(device.person.occupation, 'Student');
    assert.deepEqual(device.person.interests_custom, ['Personal hobby']);
    assert.deepEqual(device.person.socials_connected, ['instagram', 'website']);

    await sync(session, { ...modernBoth, mode: 'professional' });
    assert.equal(device.person.profile_type, 'professional');
    assert.equal(device.person.occupation, 'Engineer');
    assert.deepEqual(device.person.interests, ['business_ai']);
    assert.deepEqual(device.person.interests_custom, []);
    assert.deepEqual(device.person.affiliations, ['pro_company']);
    assert.deepEqual(device.person.social_platforms_manual, ['linkedin']);
    assert.deepEqual(device.person.social_platforms_verified, ['x']);
    assert.deepEqual(device.person.socials_connected, ['linkedin', 'x']);
  });

  it('modern to legacy: the old values go, and unknown is not reported as empty', async () => {
    const device = makeDevice();
    device.verified.personal = [];
    const session = device.startProcess();
    await sync(session, { ...modernBoth, mode: 'personal' });
    await sync(session, {
      mode: 'professional',
      personalOnboardingInterests: modernBoth.personalOnboardingInterests,
      professionalInterests: ['Legacy row'],
      professionalAffiliations: [{ category: 'x', label: 'Old' }],
    });
    for (const key of [...INTERESTS, ...AFFILIATIONS]) {
      assert.ok(!(key in device.person), `${key} should not exist`);
    }
    assert.equal(device.person.profile_type, 'professional');
  });

  it('legacy to modern and back keeps each state honest', async () => {
    const device = makeDevice();
    const session = device.startProcess();
    await sync(session, { mode: 'personal', personalInterests: ['Legacy row'] });
    assert.ok(!('interests' in device.person));
    await sync(session, { ...modernBoth, mode: 'professional' });
    assert.deepEqual(device.person.interests, ['business_ai']);
    await sync(session, { mode: 'personal', personalInterests: ['Legacy row'] });
    assert.ok(!('interests' in device.person));
  });

  it('modern to empty: a confirmed empty is sent, not removed', async () => {
    const device = makeDevice();
    const session = device.startProcess();
    await sync(session, { ...modernBoth, mode: 'personal' });
    await sync(session, { mode: 'professional', profiles: { professional: { occupation: '' } } });
    assert.deepEqual(device.person.interests, []);
    assert.equal(device.person.interests_count, 0);
    assert.deepEqual(device.person.affiliations, []);
    assert.deepEqual(device.person.social_platforms_manual, []);
    assert.equal(device.person.occupation, null);
  });

  it('an unreadable occupation or a malformed bag does not keep the old value', async () => {
    const device = makeDevice();
    device.verified.personal = ['x'];
    device.verified.professional = [];
    const session = device.startProcess();
    await sync(session, { ...modernBoth, mode: 'personal' });
    await sync(session, { mode: 'professional', socialLinksProfessional: 'broken' });
    for (const key of ['occupation', 'social_platforms_manual', 'socials_connected', 'has_socials']) {
      assert.ok(!(key in device.person), key);
    }
    assert.deepEqual(device.person.social_platforms_verified, []);
  });

  it('a failed verified read after a switch removes the previous mode networks', async () => {
    const device = makeDevice();
    device.verified.personal = ['instagram'];
    const session = device.startProcess();
    await sync(session, { ...modernBoth, mode: 'personal' });
    await sync(session, { ...modernBoth, mode: 'professional' });
    for (const key of VERIFIED_KEYS) assert.ok(!(key in device.person), key);
    assert.deepEqual(device.person.social_platforms_manual, ['linkedin']);

    device.verified.professional = ['youtube'];
    await sync(session, { ...modernBoth, mode: 'professional' });
    assert.deepEqual(device.person.social_platforms_verified, ['youtube']);
    assert.deepEqual(device.person.socials_connected, ['linkedin', 'youtube']);
    assert.equal(device.person.has_socials, true);
  });

  it('a failed read after a restart in the same mode keeps the confirmed value', async () => {
    const device = makeDevice();
    device.verified.personal = ['instagram'];
    await sync(device.startProcess(), { ...modernBoth, mode: 'personal' });
    device.verified.personal = undefined;
    await sync(device.startProcess(), { ...modernBoth, mode: 'personal' });
    assert.deepEqual(device.person.social_platforms_verified, ['instagram']);
    assert.deepEqual(device.person.socials_connected, ['instagram', 'website']);
  });

  it('a restart after a switch, with the read failing, removes them', async () => {
    const device = makeDevice();
    device.verified.personal = ['instagram'];
    await sync(device.startProcess(), { ...modernBoth, mode: 'personal' });
    device.verified.personal = undefined;
    await sync(device.startProcess(), { ...modernBoth, mode: 'professional' });
    for (const key of VERIFIED_KEYS) assert.ok(!(key in device.person), key);
  });

  it('switching back restores the values of that mode', async () => {
    const device = makeDevice();
    device.verified.personal = ['instagram'];
    const session = device.startProcess();
    await sync(session, { ...modernBoth, mode: 'personal' });
    await sync(session, { ...modernBoth, mode: 'professional' });
    await sync(session, { ...modernBoth, mode: 'personal' });
    assert.equal(device.person.occupation, 'Student');
    assert.deepEqual(device.person.interests, ['music_rock']);
    assert.deepEqual(device.person.social_platforms_verified, ['instagram']);
  });

  it('an unreadable document changes nothing', async () => {
    const start = { profile_type: 'personal', interests: ['music_rock'] };
    const device = makeDevice(start);
    const session = device.startProcess();
    await sync(session, null);
    await sync(session, 'broken');
    assert.deepEqual(device.person, start);
  });

  it('a document without a mode removes values only if this device wrote some', async () => {
    const unset = (previousMode: string | null) =>
      personKeysToUnset({ doc: {}, properties: {}, previousMode });
    assert.deepEqual(unset(null), []);
    assert.deepEqual(unset('personal'), [...MODE_SCOPED_PERSON_PROPERTIES]);
    assert.ok(!unset('personal').includes('email'));
    assert.ok(!unset('personal').includes('languages'));
    assert.ok(!unset('personal').includes('is_test_user'));
  });

  it('memory that cannot be read counts as a switch, and memory is per account', async () => {
    const broken = createPersonModeMemory({
      getItem: async () => {
        throw new Error('storage');
      },
      setItem: async () => {
        throw new Error('storage');
      },
    });
    assert.equal(await broken.read('u1'), null);
    await broken.write('u1', 'personal');
    const device = makeDevice();
    device.verified.personal = [];
    await sync(device.startProcess(), { mode: 'personal' });
    assert.deepEqual([...device.stored.keys()], ['NEARSY_ANALYTICS_PERSON_MODE:u1']);
  });

  it('removal reaches PostHog as a person update of the real SDK', async () => {
    const server = installFakeServer(answering());
    const transport = await sendingTransport();
    await transport.identify('u1', {});
    await transport.setPersonProperties({ profile_type: 'professional' });
    await transport.unsetPersonProperties(['interests', 'interests_count']);
    await transport.flush();
    const last = server.events().at(-1);
    assert.equal(last?.event, '$set');
    assert.deepEqual(last?.properties.$unset, ['interests', 'interests_count']);
  });

  it('analytics never writes the profile', () => {
    const source = readFileSync(join(here, '..', 'analyticsPersonProperties.ts'), 'utf8');
    assert.ok(!/firestore|setDoc|updateDoc/i.test(source));
  });
});

describe('compatibility contract with the real SDK', () => {
  async function makeViewer() {
    const server = installFakeServer(answering());
    const transport = await sendingTransport();
    const auth = { user: { uid: 'viewer-a' } as { uid: string } | null };
    const session = createAnalyticsSession({
      loadTransport: async () => transport,
      getAuthUser: () => auth.user,
      readCreationTime: () => undefined,
      buildBaseProperties: () => ({}),
      buildProfileProperties: () => null,
      superProperties: {},
      now: () => 0,
    });
    const present = (
      viewer: string,
      peerUid: string,
      score: unknown,
      presentedIn: 'nearby_list' | 'discovery_profile',
    ) =>
      session.trackForUser(viewer, ({ sessionId }) =>
        buildMatchMadeEvent({ peerUid, score, presentedIn, sessionId }),
      );
    const matches = async () => {
      await session.settled();
      await transport.flush();
      return server.events().filter((item) => item.event === 'match_made');
    };
    return { auth, matches, present, session, transport };
  }

  it('a card seen and then opened counts once, and the first place is kept', async () => {
    const { matches, present } = await makeViewer();
    present('viewer-a', 'peer-1', 80, 'nearby_list');
    present('viewer-a', 'peer-1', 80, 'discovery_profile');
    const events = await matches();
    assert.equal(events.length, 1);
    assert.equal(events[0].properties.presented_in, 'nearby_list');
  });

  it('a profile opened directly counts as opened', async () => {
    const { matches, present } = await makeViewer();
    present('viewer-a', 'peer-1', 80, 'discovery_profile');
    assert.equal((await matches())[0].properties.presented_in, 'discovery_profile');
  });

  it('each profile counts, and going back to one does not repeat it', async () => {
    const { matches, present } = await makeViewer();
    present('viewer-a', 'peer-1', 80, 'nearby_list');
    present('viewer-a', 'peer-2', 60, 'nearby_list');
    present('viewer-a', 'peer-1', 80, 'nearby_list');
    assert.equal((await matches()).length, 2);
  });

  it('a refresh repeats presentations without creating a session of its own', async () => {
    const { matches, present, session, transport } = await makeViewer();
    const sdkSession = transport.getSessionId();
    for (let refresh = 0; refresh < 5; refresh += 1) {
      session.noteAuthChange();
      present('viewer-a', 'peer-1', 80, 'nearby_list');
      present('viewer-a', 'peer-2', 60, 'nearby_list');
    }
    const events = await matches();
    assert.equal(events.length, 2);
    assert.equal(transport.getSessionId(), sdkSession);
    for (const item of events) {
      assert.equal(item.properties.session_id, sdkSession);
      assert.equal(item.properties.$session_id, sdkSession);
    }
  });

  it('changing account restarts the count, each under its own person and session', async () => {
    const { auth, matches, present, session, transport } = await makeViewer();
    present('viewer-a', 'peer-1', 80, 'nearby_list');
    await session.settled();
    const sessionOfA = transport.getSessionId();

    auth.user = { uid: 'viewer-b' };
    session.noteAuthChange();
    present('viewer-b', 'peer-1', 80, 'nearby_list');
    present('viewer-a', 'peer-1', 80, 'nearby_list');
    const events = await matches();
    assert.deepEqual(events.map((item) => item.distinct_id), ['viewer-a', 'viewer-b']);
    assert.notEqual(events[1].properties.session_id, sessionOfA);
  });

  it('a new SDK session counts the same profile again', async () => {
    let session_id = 's1';
    const captured: AnalyticsProperties[] = [];
    const transport: AnalyticsTransport = {
      getIdentifiedDistinctId: () => 'viewer-a',
      getSessionId: () => session_id,
      identify: () => {},
      setPersonProperties: () => {},
      unsetPersonProperties: () => {},
      reset: () => {},
      register: () => {},
      capture: (_event, properties) => void captured.push(properties ?? {}),
    };
    const session = createAnalyticsSession({
      loadTransport: async () => transport,
      getAuthUser: () => ({ uid: 'viewer-a' }),
      readCreationTime: () => undefined,
      buildBaseProperties: () => ({}),
      buildProfileProperties: () => null,
      superProperties: {},
      now: () => 0,
    });
    const present = () =>
      session.trackForUser('viewer-a', ({ sessionId }) =>
        buildMatchMadeEvent({ peerUid: 'peer-1', score: 80, presentedIn: 'nearby_list', sessionId }),
      );
    present();
    present();
    await session.settled();
    session_id = 's2';
    present();
    await session.settled();
    assert.deepEqual(captured.map((item) => item.session_id), ['s1', 's2']);
  });

  it('needs a valid score: unknown is neither zero nor a match', () => {
    for (const score of [undefined, null, NaN, -1, 100.5, '80']) {
      assert.equal(
        buildMatchMadeEvent({ peerUid: 'p', score, presentedIn: 'nearby_list', sessionId: 's' }),
        null,
      );
    }
    assert.equal(
      buildMatchMadeEvent({ peerUid: '', score: 80, presentedIn: 'nearby_list', sessionId: 's' }),
      null,
    );
    assert.equal(
      buildMatchMadeEvent({ peerUid: 'p', score: 0, presentedIn: 'nearby_list', sessionId: 's' })
        ?.properties.match_score_range,
      'low',
    );
  });

  it('uses the ranges [0,50), [50,75), [75,100]', () => {
    const range = (score: number) =>
      buildMatchMadeEvent({ peerUid: 'p', score, presentedIn: 'nearby_list', sessionId: 's' })
        ?.properties.match_score_range;
    assert.deepEqual([0, 49.99, 50, 74.99, 75, 100].map(range), [
      'low',
      'low',
      'medium',
      'medium',
      'high',
      'high',
    ]);
  });

  it('the other person never leaves the device', async () => {
    const { matches, present } = await makeViewer();
    present('viewer-a', 'peer-secret-uid', 80, 'nearby_list');
    const events = await matches();
    assert.equal(events.length, 1);
    assert.ok(!JSON.stringify(events).includes('peer-secret-uid'));
    assert.ok(!('match_id' in events[0].properties));
  });

  it('a card counts from 50% visible, from the list itself', () => {
    const screen = readFileSync(join(here, '..', '..', 'screens', 'NearbySearchScreen.tsx'), 'utf8');
    assert.ok(screen.includes('itemVisiblePercentThreshold: 50'));
    assert.ok(screen.includes("'nearby_list'"));
    const profile = readFileSync(join(here, '..', '..', 'screens', 'DiscoveryProfileScreen.tsx'), 'utf8');
    assert.ok(profile.includes("trackMatchPresented(viewerUid, uid, score, 'discovery_profile')"));
  });
});

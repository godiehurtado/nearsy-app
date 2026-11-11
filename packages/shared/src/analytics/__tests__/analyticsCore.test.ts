import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createPendingAttributionStore, parseCampaignLink } from '../attribution';
import { createAnalyticsClient, type AuthSnapshot } from '../client';
import {
  POSTHOG_HOST,
  POSTHOG_PROJECT_ID,
  resolveAnalyticsConfig,
  type AnalyticsConfig,
} from '../config';
import {
  ANALYTICS_EVENT_NAMES,
  EVENT_RULES,
  FORBIDDEN_PROPERTY_NAMES,
  isAllowedOutgoingEvent,
  PERSON_PROPERTY_RULES,
  TRACKING_PLAN_VERSION,
} from '../contract';
import { createFakeTransport, type FakeTransport } from '../fakeTransport';
import { isValidValue } from '../sanitize';
import {
  bindAnalyticsServices,
  handleCampaignLink,
  markAnalyticsConfigured,
  noteProfileWrite,
  resolvePendingAttribution,
  trackAlertOpened,
  trackLinkedInAuthSession,
  trackManualSocialLinksSaved,
  trackMatchPresented,
  trackOnboardingStepCompleted,
  trackProfileCompleted,
  trackSignupCompleted,
  trackSocialAuthSession,
  withExternalAuthFlow,
  type AnalyticsServices,
} from '../index';
import { createEventLedger } from '../ledger';
import type { StringStore } from '../lifecycle';
import type { LinkedInAccountSignal } from '../../authentication/linkedinA3/accountCreationSignal';
import { assertLinkedInAuthExchangeResult } from '../../authentication/linkedinA3/types';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../../../../..');

const ENABLED: AnalyticsConfig = {
  enabled: true,
  token: 'phc_test',
  host: POSTHOG_HOST,
  environment: 'production',
  distributionChannel: 'beta',
  isTestInstall: true,
  attributionHosts: ['go.example.com'],
};

const USER_A: AuthSnapshot = {
  uid: 'uidA',
  email: 'a@example.com',
  creationTime: 'Mon, 02 Nov 2026 10:00:00 GMT',
};
const USER_B: AuthSnapshot = {
  uid: 'uidB',
  email: null,
  creationTime: 'Tue, 03 Nov 2026 10:00:00 GMT',
};

const NOW = Date.parse('2026-11-03T10:30:00Z');

/** Identity fixture: created, with the Auth creation time of that generation. */
function created(creationTime: string | null, offsetMs = 250): LinkedInAccountSignal {
  return {
    accountOutcome: 'created',
    authCreationTimeMs: Date.parse(String(creationTime)) + offsetMs,
  };
}

export function memoryStore(): StringStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value);
    },
    removeItem: async (key) => {
      data.delete(key);
    },
  };
}

function setup(
  options: {
    fake?: FakeTransport;
    live?: () => AuthSnapshot | null;
    store?: StringStore;
  } = {},
) {
  const fake = options.fake ?? createFakeTransport();
  const client = createAnalyticsClient({
    config: ENABLED,
    createTransport: async () => fake,
    binary: () => ({ appVersion: '2.0.10', appBuild: '73' }),
    readSession: options.live,
  });
  return { fake, client };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 12; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function bindFacade(
  client: ReturnType<typeof createAnalyticsClient>,
  store: StringStore,
  overrides: Partial<AnalyticsServices> = {},
): AnalyticsServices & { syncs: string[] } {
  const syncs: string[] = [];
  const services = {
    client,
    ledger: createEventLedger(store),
    attribution: createPendingAttributionStore(store),
    attributionHosts: ENABLED.attributionHosts,
    now: () => NOW,
    sha256Hex: async (input: string) =>
      Buffer.from(input).toString('hex').padEnd(64, '0'),
    scheduleProfileSync: (uid: string) => {
      syncs.push(uid);
    },
    noteVerifiedSocialsChanged: () => {},
    observeLocationPermissions: () => {},
    noteExternalAuthFlow: () => {},
    ...overrides,
    syncs,
  };
  bindAnalyticsServices(services);
  return services;
}

afterEach(() => {
  bindAnalyticsServices(null);
});

describe('activation config', () => {
  it('is off by default, in production too', () => {
    assert.equal(resolveAnalyticsConfig({}).enabled, false);
    assert.equal(
      resolveAnalyticsConfig({ token: 'phc_real', firebaseEnv: 'production' })
        .enabled,
      false,
    );
  });

  it('a missing or wrong token keeps it off without failing', () => {
    for (const token of [undefined, '', '   ', 'not-a-project-token']) {
      const config = resolveAnalyticsConfig({ enabledFlag: 'true', token });
      assert.equal(config.enabled, false);
      assert.equal(config.token, null);
    }
  });

  it('turns on only with an explicit flag, a declared channel and a project token', () => {
    const config = resolveAnalyticsConfig({
      enabledFlag: 'true',
      distributionChannel: 'beta',
      token: ' phc_real ',
    });
    assert.equal(config.enabled, true);
    assert.equal(config.token, 'phc_real');
    assert.equal(config.host, 'https://us.i.posthog.com');
    assert.equal(POSTHOG_PROJECT_ID, 716015);
  });

  it('development needs a second explicit switch', () => {
    const base = {
      enabledFlag: 'true',
      distributionChannel: 'beta',
      token: 'phc_real',
      isDevBundle: true,
    };
    assert.equal(resolveAnalyticsConfig(base).enabled, false);
    const allowed = resolveAnalyticsConfig({
      ...base,
      allowDevelopmentFlag: 'true',
    });
    assert.equal(allowed.enabled, true);
    assert.equal(allowed.environment, 'development');
  });

  it('no declared channel means no capture: general capture stays off', () => {
    for (const distributionChannel of [undefined, '', 'app_store', 'BETA', 'false']) {
      const config = resolveAnalyticsConfig({
        enabledFlag: 'true',
        token: 'phc_real',
        firebaseEnv: 'production',
        distributionChannel,
      });
      assert.equal(config.enabled, false, String(distributionChannel));
      assert.equal(config.token, null);
    }
  });

  it('production is supported, unmarked, and needs its own configuration', () => {
    const base = { enabledFlag: 'true', token: 'phc_real', firebaseEnv: 'production' };
    const production = resolveAnalyticsConfig({ ...base, distributionChannel: 'production' });
    assert.equal(production.enabled, true);
    assert.equal(production.distributionChannel, 'production');
    assert.equal(production.isTestInstall, false);
    assert.equal(production.environment, 'production');
    assert.equal(
      resolveAnalyticsConfig({ ...base, distributionChannel: 'production', firebaseEnv: 'development' }).enabled,
      false,
    );
  });

  it('Beta is production Firebase with real identities, and never nearsy-dev', () => {
    const base = { enabledFlag: 'true', distributionChannel: 'beta', token: 'phc_real' };
    const beta = resolveAnalyticsConfig({ ...base, firebaseEnv: 'production' });
    assert.equal(beta.enabled, true);
    assert.equal(beta.environment, 'production');
    assert.equal(beta.distributionChannel, 'beta');
    assert.equal(beta.isTestInstall, true);
    for (const firebaseEnv of ['development', 'dev', 'staging']) {
      assert.equal(resolveAnalyticsConfig({ ...base, firebaseEnv }).enabled, false);
      assert.equal(
        resolveAnalyticsConfig({
          ...base,
          firebaseEnv,
          isDevBundle: true,
          allowDevelopmentFlag: 'true',
        }).enabled,
        false,
      );
    }
  });

  it('attribution hosts stay empty unless analytics is on', () => {
    assert.deepEqual(
      resolveAnalyticsConfig({ attributionHosts: 'go.example.com' })
        .attributionHosts,
      [],
    );
    assert.deepEqual(
      resolveAnalyticsConfig({
        enabledFlag: 'true',
        distributionChannel: 'beta',
        token: 'phc_real',
        attributionHosts: ' GO.example.com, bad host,https://x.y ',
      }).attributionHosts,
      ['go.example.com'],
    );
  });
});

describe('disabled analytics', () => {
  it('never creates the SDK and keeps nothing to send later', async () => {
    let created = 0;
    const client = createAnalyticsClient({
      config: resolveAnalyticsConfig({}),
      createTransport: async () => {
        created += 1;
        return createFakeTransport();
      },
      binary: () => ({ appVersion: null, appBuild: null }),
    });
    await client.start();
    client.reportAuthState(USER_A);
    client.captureDeviceEvent('app_opened', {});
    client.captureForUser('uidA', 'visibility_changed', { enabled: true });
    client.setPersonProperties('uidA', { profile_type: 'personal' });
    await client.start();
    assert.equal(created, 0);
    assert.equal(client.isEnabled(), false);
  });

  it('facade calls with no runtime do nothing and do not throw', async () => {
    const store = memoryStore();
    trackSignupCompleted({ uid: 'u', method: 'email' });
    trackOnboardingStepCompleted('u', 'basics');
    trackProfileCompleted('u');
    trackAlertOpened({ source: 'inbox' });
    handleCampaignLink('https://go.example.com/c/a?utm_medium=email');
    noteProfileWrite('u', { mode: 'personal' });
    await settle();
    assert.equal(store.data.size, 0);
  });

  it('early push buffer is unused unless analytics was configured', () => {
    trackAlertOpened({ source: 'push' });
    const { fake, client } = setup();
    bindFacade(client, memoryStore());
    client.reportAuthState(USER_A);
    void client.start();
    assert.equal(fake.captured('alert_opened').length, 0);
  });
});

describe('allowlist', () => {
  it('drops unknown and excluded properties, reporting names only', async () => {
    const logs: string[] = [];
    const fake = createFakeTransport();
    const client = createAnalyticsClient({
      config: ENABLED,
      createTransport: async () => fake,
      binary: () => ({ appVersion: '2.0.10', appBuild: '73' }),
      logger: (code, details) => {
        logs.push(`${code}:${JSON.stringify(details ?? {})}`);
      },
    });
    await client.start();
    client.reportAuthState(USER_A);
    client.captureForUser('uidA', 'visibility_changed', {
      enabled: true,
      gender: 'x',
      latitude: 1.5,
      secret: 'jane@example.com',
    });
    const [event] = fake.captured('visibility_changed');
    assert.equal(event?.properties.enabled, true);
    for (const name of ['gender', 'latitude', 'secret']) {
      assert.equal(name in (event?.properties ?? {}), false);
    }
    assert.equal(logs.join().includes('jane@example.com'), false);
    assert.equal(logs.join().includes('gender'), true);
  });

  it('rejects wrong types instead of coercing them', async () => {
    const { fake, client } = setup();
    await client.start();
    client.reportAuthState(USER_A);
    client.captureForUser('uidA', 'discovery_opened', {
      load_time_sec: '2',
      people_shown: 3.5,
    });
    const props = fake.captured('discovery_opened')[0]?.properties ?? {};
    assert.equal('load_time_sec' in props, false);
    assert.equal('people_shown' in props, false);
  });

  it('adds approved technical properties from the binary', async () => {
    const { fake, client } = setup();
    await client.start();
    client.captureDeviceEvent('app_opened', {});
    client.reportAuthState(null);
    const props = fake.captured('app_opened')[0]?.properties;
    assert.equal(props?.platform, 'iOS');
    assert.equal(props?.app_version, '2.0.10');
    assert.equal(props?.app_build, '73');
    assert.equal(props?.environment, 'production');
    assert.equal(props?.tracking_plan_version, TRACKING_PLAN_VERSION);
  });

  it('the contract has no exclusions or monetization', () => {
    for (const excluded of [
      'premium_activated',
      'paywall_viewed',
      'subscription_started',
      'alert_sent',
    ]) {
      assert.equal(ANALYTICS_EVENT_NAMES.includes(excluded as never), false);
    }
    for (const name of ['gender', 'seniority', 'industry', 'event_cohort']) {
      assert.equal(name in PERSON_PROPERTY_RULES, false);
      assert.equal(FORBIDDEN_PROPERTY_NAMES.has(name), true);
      for (const rules of Object.values(EVENT_RULES)) {
        assert.equal(name in rules, false);
      }
    }
  });

  it('the SDK guard blocks every automatic event', () => {
    for (const blocked of [
      '$screen',
      '$autocapture',
      '$feature_flag_called',
      '$exception',
      '$rageclick',
      '$push_notification_opened',
      'Application Opened',
      'Application Installed',
    ]) {
      assert.equal(isAllowedOutgoingEvent(blocked), false);
    }
    assert.equal(isAllowedOutgoingEvent('$identify'), true);
    assert.equal(isAllowedOutgoingEvent('app_opened'), true);
  });
});

describe('SDK failures', () => {
  it('sync failures never reach the app and later calls continue', async () => {
    const { fake, client } = setup();
    await client.start();
    client.reportAuthState(USER_A);
    fake.throwOn.add('capture');
    assert.doesNotThrow(() => {
      client.captureForUser('uidA', 'visibility_changed', { enabled: true });
    });
    fake.throwOn.clear();
    client.captureForUser('uidA', 'visibility_changed', { enabled: false });
    assert.equal(fake.captured('visibility_changed').length, 1);
  });

  it('async flush failure is contained', async () => {
    const fake = createFakeTransport();
    fake.flush = () => Promise.reject(new Error('network'));
    const { client } = setup({ fake });
    await client.start();
    assert.doesNotThrow(() => client.flush());
    await settle();
  });

  it('a failing SDK start disables analytics and clears the queue', async () => {
    const client = createAnalyticsClient({
      config: ENABLED,
      createTransport: async () => {
        throw new Error('native module missing');
      },
      binary: () => ({ appVersion: null, appBuild: null }),
    });
    client.reportAuthState(USER_A);
    client.captureForUser('uidA', 'visibility_changed', { enabled: true });
    await client.start();
    assert.equal(client.isEnabled(), false);
    assert.doesNotThrow(() => client.captureDeviceEvent('app_opened', {}));
  });

  it('a throwing binary reader only omits the version', async () => {
    const fake = createFakeTransport();
    const client = createAnalyticsClient({
      config: ENABLED,
      createTransport: async () => fake,
      binary: () => {
        throw new Error('no native module');
      },
    });
    await client.start();
    client.reportAuthState(null);
    client.captureDeviceEvent('app_opened', {});
    const props = fake.captured('app_opened')[0]?.properties ?? {};
    assert.equal('app_version' in props, false);
    assert.equal(props.platform, 'iOS');
  });
});

describe('identity', () => {
  it('identifies on login and restore with Firebase UID and email', async () => {
    const { fake, client } = setup();
    await client.start();
    client.reportAuthState(USER_A);
    const identify = fake.calls.find((c) => c.op === 'identify');
    assert.equal(identify?.op, 'identify');
    if (identify?.op === 'identify') {
      assert.equal(identify.uid, 'uidA');
      assert.equal(identify.set.user_id, 'uidA');
      assert.equal(identify.set.email, 'a@example.com');
      assert.equal(identify.set.platform, 'iOS');
      assert.equal(identify.setOnce.account_created_at, '2026-11-02T10:00:00.000Z');
    }
  });

  it('never invents an email', async () => {
    const { fake, client } = setup();
    await client.start();
    client.reportAuthState(USER_B);
    const identify = fake.calls.find((c) => c.op === 'identify');
    if (identify?.op === 'identify') {
      assert.equal('email' in identify.set, false);
    }
  });

  it('identifying the same account twice is one identify', async () => {
    const { fake, client } = setup();
    await client.start();
    client.reportAuthState(USER_A);
    client.reportAuthState(USER_A);
    assert.equal(fake.calls.filter((c) => c.op === 'identify').length, 1);
  });

  it('resets on logout', async () => {
    const { fake, client } = setup();
    await client.start();
    client.reportAuthState(USER_A);
    client.reportAuthState(null);
    assert.equal(fake.calls.at(-1)?.op, 'reset');
  });

  it('resets before A→B', async () => {
    const { fake, client } = setup();
    await client.start();
    client.reportAuthState(USER_A);
    client.reportAuthState(USER_B);
    assert.deepEqual(
      fake.calls.map((c) => c.op),
      ['identify', 'reset', 'identify'],
    );
  });

  it('a persisted identity of another account is reset at restore', async () => {
    const { fake, client } = setup({ fake: createFakeTransport('uidOld') });
    await client.start();
    client.reportAuthState(USER_B);
    assert.deepEqual(
      fake.calls.map((c) => c.op),
      ['reset', 'identify'],
    );
  });

  it('a late event of account A cannot attach to account B', async () => {
    const { fake, client } = setup();
    await client.start();
    client.reportAuthState(USER_A);
    client.reportAuthState(USER_B);
    const sent = client.captureForUser('uidA', 'discovery_opened', {
      people_shown: 1,
      load_time_sec: 1,
    });
    assert.equal(sent, false);
    assert.equal(fake.captured('discovery_opened').length, 0);
    assert.equal(client.setPersonProperties('uidA', { profile_type: 'personal' }), false);
    assert.equal(fake.calls.some((c) => c.op === 'setPerson'), false);
  });

  it('a signup event can precede the auth listener', async () => {
    const { fake, client } = setup({ live: () => USER_A });
    await client.start();
    client.reportAuthState(null);
    client.captureForUser('uidA', 'signup_completed', { signup_method: 'email' });
    const [event] = fake.captured('signup_completed');
    assert.equal(event?.distinctId, 'uidA');
  });

  it('calls wait for the SDK and keep their order', async () => {
    const { fake, client } = setup();
    client.reportAuthState(USER_A);
    client.captureForUser('uidA', 'visibility_changed', { enabled: true });
    client.reportAuthState(USER_B);
    client.captureForUser('uidB', 'visibility_changed', { enabled: false });
    await client.start();
    assert.deepEqual(
      fake.calls.map((c) => c.op),
      ['identify', 'capture', 'reset', 'identify', 'capture'],
    );
    assert.deepEqual(
      fake.captured('visibility_changed').map((c) => c.distinctId),
      ['uidA', 'uidB'],
    );
  });

  it('device events wait until the session is known', async () => {
    const { fake, client } = setup();
    await client.start();
    client.captureDeviceEvent('app_opened', {});
    assert.equal(fake.captured('app_opened').length, 0);
    client.reportAuthState(USER_A);
    assert.equal(fake.captured('app_opened')[0]?.distinctId, 'uidA');
  });
});

describe('signup_completed', () => {
  it('social sign-in counts only when Firebase confirms a new account', async () => {
    const { fake, client } = setup();
    bindFacade(client, memoryStore());
    await client.start();
    client.reportAuthState(USER_A);
    trackSocialAuthSession('google', { uid: 'uidA', isNewUser: false });
    trackSocialAuthSession('google', { uid: 'uidA' });
    await settle();
    assert.equal(fake.captured('signup_completed').length, 0);
    trackSocialAuthSession('google', { uid: 'uidA', isNewUser: true });
    await settle();
    assert.equal(fake.captured('signup_completed')[0]?.properties.signup_method, 'google');
  });

  it('is not repeated for the same account generation', async () => {
    const store = memoryStore();
    const first = setup();
    bindFacade(first.client, store);
    await first.client.start();
    first.client.reportAuthState(USER_A);
    trackSignupCompleted({ uid: 'uidA', method: 'email' });
    trackSignupCompleted({ uid: 'uidA', method: 'email' });
    await settle();
    assert.equal(first.fake.captured('signup_completed').length, 1);

    const restart = setup();
    bindFacade(restart.client, store);
    await restart.client.start();
    restart.client.reportAuthState(USER_A);
    trackSignupCompleted({ uid: 'uidA', method: 'email' });
    await settle();
    assert.equal(restart.fake.captured('signup_completed').length, 0);
  });

  it('a recreated account with the same UID is a new registration', async () => {
    const store = memoryStore();
    const first = setup();
    bindFacade(first.client, store);
    await first.client.start();
    first.client.reportAuthState(USER_A);
    trackLinkedInAuthSession('uidA', created(USER_A.creationTime));
    await settle();
    assert.equal(first.fake.captured('signup_completed').length, 1);

    const recreated = setup();
    bindFacade(recreated.client, store);
    await recreated.client.start();
    recreated.client.reportAuthState({
      ...USER_A,
      creationTime: 'Fri, 06 Nov 2026 10:00:00 GMT',
    });
    trackLinkedInAuthSession('uidA', created('Fri, 06 Nov 2026 10:00:00 GMT'));
    await settle();
    assert.equal(recreated.fake.captured('signup_completed').length, 1);
  });

  it('without a creation date dedupe never persists per UID', async () => {
    const store = memoryStore();
    const ledger = createEventLedger(store);
    assert.equal(await ledger.claim('u', null, 'x'), true);
    assert.equal(await ledger.claim('u', null, 'x'), false);
    assert.equal(store.data.size, 0);
    const restarted = createEventLedger(store);
    assert.equal(await restarted.claim('u', null, 'x'), true);
  });

  it('an unreadable ledger still dedupes in memory', async () => {
    const broken: StringStore = {
      getItem: async () => {
        throw new Error('disk');
      },
      setItem: async () => {
        throw new Error('disk');
      },
      removeItem: async () => {},
    };
    const ledger = createEventLedger(broken);
    assert.equal(await ledger.claim('u', USER_A.creationTime, 'x'), true);
    assert.equal(await ledger.claim('u', USER_A.creationTime, 'x'), false);
  });
});

describe('LinkedIn signup from the Identity signal', () => {
  it('created for this generation: one signup, identify before it', async () => {
    const { fake, client } = setup();
    bindFacade(client, memoryStore());
    await client.start();
    client.reportAuthState(USER_A);
    trackLinkedInAuthSession('uidA', created(USER_A.creationTime));
    await settle();
    const [event] = fake.captured('signup_completed');
    assert.equal(event?.properties.signup_method, 'linkedin');
    assert.equal(event?.distinctId, 'uidA');
    const identify = fake.calls.findIndex((c) => c.op === 'identify');
    const capture = fake.calls.findIndex((c) => c.op === 'capture' && c.event === 'signup_completed');
    assert.ok(identify >= 0 && identify < capture);
  });

  it('login of an existing account emits nothing', async () => {
    const { fake, client } = setup();
    bindFacade(client, memoryStore());
    await client.start();
    client.reportAuthState(USER_A);
    trackLinkedInAuthSession('uidA', {
      accountOutcome: 'existing',
      authCreationTimeMs: Date.parse(USER_A.creationTime ?? ''),
    });
    await settle();
    assert.equal(fake.captured('signup_completed').length, 0);
  });

  it('an old response without the signal emits nothing', async () => {
    const { fake, client } = setup();
    bindFacade(client, memoryStore());
    await client.start();
    client.reportAuthState(USER_A);
    trackLinkedInAuthSession('uidA', null);
    await settle();
    assert.equal(fake.captured('signup_completed').length, 0);
  });

  it('created with the time of another generation emits nothing', async () => {
    const { fake, client } = setup();
    bindFacade(client, memoryStore());
    await client.start();
    client.reportAuthState(USER_A);
    trackLinkedInAuthSession('uidA', created(USER_A.creationTime, 1000));
    trackLinkedInAuthSession('uidA', created('Fri, 06 Nov 2026 10:00:00 GMT'));
    await settle();
    assert.equal(fake.captured('signup_completed').length, 0);
  });

  it('without a Firebase creation time nothing is claimed', async () => {
    const { fake, client } = setup();
    bindFacade(client, memoryStore());
    await client.start();
    client.reportAuthState({ ...USER_A, creationTime: null });
    trackLinkedInAuthSession('uidA', created(USER_A.creationTime));
    await settle();
    assert.equal(fake.captured('signup_completed').length, 0);
  });

  it('resume or a repeated finalize counts once (UID + creation time)', async () => {
    const store = memoryStore();
    const first = setup();
    bindFacade(first.client, store);
    await first.client.start();
    first.client.reportAuthState(USER_A);
    trackLinkedInAuthSession('uidA', created(USER_A.creationTime));
    trackLinkedInAuthSession('uidA', created(USER_A.creationTime));
    await settle();
    const resumed = setup();
    bindFacade(resumed.client, store);
    await resumed.client.start();
    resumed.client.reportAuthState(USER_A);
    trackLinkedInAuthSession('uidA', created(USER_A.creationTime));
    await settle();
    assert.equal(first.fake.captured('signup_completed').length, 1);
    assert.equal(resumed.fake.captured('signup_completed').length, 0);
  });

  it('a recreated account (same UID, new generation) counts again', async () => {
    const store = memoryStore();
    const first = setup();
    bindFacade(first.client, store);
    await first.client.start();
    first.client.reportAuthState(USER_A);
    trackLinkedInAuthSession('uidA', created(USER_A.creationTime));
    await settle();
    const recreatedAt = 'Fri, 06 Nov 2026 10:00:00 GMT';
    const second = setup();
    bindFacade(second.client, store);
    await second.client.start();
    second.client.reportAuthState({ ...USER_A, creationTime: recreatedAt });
    trackLinkedInAuthSession('uidA', created(recreatedAt));
    await settle();
    assert.equal(first.fake.captured('signup_completed').length, 1);
    assert.equal(second.fake.captured('signup_completed').length, 1);
  });

  it('account change: a signal for A never lands on B', async () => {
    const { fake, client } = setup();
    bindFacade(client, memoryStore());
    await client.start();
    client.reportAuthState(USER_B);
    trackLinkedInAuthSession('uidA', created(USER_A.creationTime));
    trackLinkedInAuthSession('uidB', created(USER_A.creationTime));
    await settle();
    assert.equal(fake.captured('signup_completed').length, 0);
    trackLinkedInAuthSession('uidB', created(USER_B.creationTime));
    await settle();
    assert.deepEqual(fake.captured('signup_completed').map((e) => e.distinctId), ['uidB']);
  });

  it('a pending campaign link becomes its acquisition', async () => {
    const store = memoryStore();
    const { fake, client } = setup();
    const services = bindFacade(client, store);
    await client.start();
    const link = parseCampaignLink(
      'https://go.example.com/c/x?utm_medium=qr&utm_campaign=launch',
      services.attributionHosts,
      NOW,
    );
    assert.ok(link);
    await services.attribution.save(link);
    client.reportAuthState(USER_A);
    trackLinkedInAuthSession('uidA', created(USER_A.creationTime));
    await settle();
    const [event] = fake.captured('signup_completed');
    assert.equal(event?.properties.signup_source, 'qr');
    assert.equal(event?.properties.signup_campaign, 'launch');
  });
});

describe('onboarding through the facade', () => {
  it('reports each milestone once, surviving rerenders and retreat', async () => {
    const { fake, client } = setup();
    bindFacade(client, memoryStore());
    await client.start();
    client.reportAuthState(USER_A);
    trackOnboardingStepCompleted('uidA', 'basics');
    trackOnboardingStepCompleted('uidA', 'basics');
    await settle();
    trackOnboardingStepCompleted('uidA', 'basics');
    await settle();
    const events = fake.captured('onboarding_step_completed');
    assert.equal(events.length, 1);
    assert.equal(events[0]?.properties.step_number, 2);
    assert.equal(events[0]?.properties.skipped, false);
  });

  it('never fabricates earlier milestones when resuming midway', async () => {
    const { fake, client } = setup();
    bindFacade(client, memoryStore());
    await client.start();
    client.reportAuthState(USER_A);
    trackOnboardingStepCompleted('uidA', 'interests', {
      itemCount: 12,
      catalogCount: 11,
      customCount: 1,
    });
    await settle();
    assert.deepEqual(
      fake.captured('onboarding_step_completed').map((e) => e.properties.step),
      ['interests'],
    );
  });

  it('profile_completed carries the time since account creation', async () => {
    const { fake, client } = setup();
    bindFacade(client, memoryStore());
    await client.start();
    client.reportAuthState(USER_B);
    trackProfileCompleted('uidB');
    trackProfileCompleted('uidB');
    await settle();
    const events = fake.captured('profile_completed');
    assert.equal(events.length, 1);
    assert.equal(events[0]?.properties.completion_time_min, 30);
    assert.equal(events[0]?.properties.account_created_at, '2026-11-03T10:00:00.000Z');
  });

  it('profile_completed omits the time with a future creation date', async () => {
    const { fake, client } = setup();
    bindFacade(client, memoryStore());
    await client.start();
    client.reportAuthState({ ...USER_B, creationTime: '2030-01-01T00:00:00Z' });
    trackProfileCompleted('uidB');
    await settle();
    const props = fake.captured('profile_completed')[0]?.properties ?? {};
    assert.equal('completion_time_min' in props, false);
  });
});

describe('socials through the facade', () => {
  it('adding a link reports it; editing or hydrating does not', async () => {
    const { fake, client } = setup();
    bindFacade(client, memoryStore());
    await client.start();
    client.reportAuthState(USER_A);
    const before = { linkedin: 'https://www.linkedin.com/in/ann' };
    trackManualSocialLinksSaved('uidA', before, {
      linkedin: 'https://www.linkedin.com/in/ann2',
    });
    trackManualSocialLinksSaved('uidA', before, before);
    assert.equal(fake.captured('social_linked').length, 0);
    trackManualSocialLinksSaved('uidA', before, {
      ...before,
      website: 'https://example.com',
    });
    const [event] = fake.captured('social_linked');
    assert.equal(event?.properties.social_platform, 'website');
    assert.equal(event?.properties.link_type, 'manual');
    assert.equal(event?.properties.platform, 'iOS');
  });
});

describe('Beta classification', () => {
  it('every event carries it, anonymous ones too', async () => {
    const { fake, client } = setup();
    await client.start();
    client.reportAuthState(null);
    client.captureDeviceEvent('app_opened', { open_type: 'cold_start' });
    client.reportAuthState(USER_A);
    client.captureForUser('uidA', 'visibility_changed', { enabled: true });
    assert.equal(fake.captured().length, 2);
    for (const { properties } of fake.captured()) {
      assert.equal(properties.is_test_user, true);
      assert.equal(properties.distribution_channel, 'beta');
      assert.equal(properties.environment, 'production');
    }
  });

  it('the person is marked with the real UID, each account on its own', async () => {
    const { fake, client } = setup();
    await client.start();
    client.reportAuthState(USER_A);
    client.reportAuthState(USER_B);
    const identifies = fake.calls.filter(
      (c): c is Extract<typeof c, { op: 'identify' }> => c.op === 'identify',
    );
    assert.deepEqual(identifies.map((c) => c.uid), ['uidA', 'uidB']);
    for (const { set } of identifies) assert.equal(set.is_test_user, true);
  });

  it('production never writes is_test_user, so a Beta mark on the person stays', async () => {
    const fake = createFakeTransport();
    const client = createAnalyticsClient({
      config: { ...ENABLED, distributionChannel: 'production', isTestInstall: false },
      createTransport: async () => fake,
      binary: () => ({ appVersion: '2.0.11', appBuild: '80' }),
    });
    await client.start();
    client.reportAuthState(USER_A);
    client.captureForUser('uidA', 'visibility_changed', { enabled: true });
    client.setPersonProperties('uidA', { is_test_user: false });
    assert.equal(JSON.stringify(fake.calls).includes('is_test_user'), false);
    assert.equal(fake.captured()[0]?.properties.distribution_channel, 'production');
    const identify = fake.calls.find((c) => c.op === 'identify');
    assert.ok(identify && identify.op === 'identify');
    assert.equal(identify.set.distribution_channel, 'production');
  });

  it('a build outside Beta cannot write false, by config or by a caller', async () => {
    const fake = createFakeTransport();
    const client = createAnalyticsClient({
      config: { ...ENABLED, distributionChannel: null, isTestInstall: false },
      createTransport: async () => fake,
      binary: () => ({ appVersion: '2.0.11', appBuild: '80' }),
    });
    await client.start();
    client.reportAuthState(USER_A);
    client.captureForUser('uidA', 'visibility_changed', { enabled: true });
    client.setPersonProperties('uidA', { is_test_user: false }, { is_test_user: false });
    assert.equal(JSON.stringify(fake.calls).includes('is_test_user'), false);
    assert.equal(fake.captured()[0]?.properties.distribution_channel, undefined);
  });
});

describe('account deletion', () => {
  it('drops its queue and identity, and refuses later events of that generation', async () => {
    let live: AuthSnapshot | null = USER_A;
    const { fake, client } = setup({ live: () => live });
    await client.start();
    client.reportAuthState(USER_A);
    client.discardAccount('uidA');
    assert.ok(fake.calls.some((c) => c.op === 'discard' && c.distinctId === 'uidA'));
    assert.equal(fake.getIdentifiedId(), null);
    assert.equal(client.currentAuth(), null);
    fake.calls.length = 0;
    assert.equal(client.captureForUser('uidA', 'visibility_changed', { enabled: true }), false);
    assert.equal(client.setPersonProperties('uidA', { profile_type: 'personal' }), false);
    client.reportAuthState(USER_A);
    client.captureForCurrentUser('visibility_changed', { enabled: true });
    assert.deepEqual(fake.calls, []);
    live = null;
  });

  it('a recreated account with the same UID is another generation', async () => {
    const { fake, client } = setup();
    await client.start();
    client.reportAuthState(USER_A);
    client.discardAccount('uidA');
    const recreated = { ...USER_A, creationTime: 'Fri, 06 Nov 2026 10:00:00 GMT' };
    client.reportAuthState(recreated);
    assert.equal(client.captureForUser('uidA', 'visibility_changed', { enabled: true }), true);
    assert.equal(fake.getIdentifiedId(), 'uidA');
  });

  it('later closure phases do not reopen the account or discard again', async () => {
    let live: AuthSnapshot | null = USER_A;
    const { fake, client } = setup({ live: () => live });
    await client.start();
    client.reportAuthState(USER_A);
    client.discardAccount('uidA');
    live = null;
    client.discardAccount('uidA');
    assert.equal(fake.calls.filter((c) => c.op === 'discard').length, 1);
    client.reportAuthState(USER_A);
    assert.equal(client.currentAuth(), null);
  });

  it('a closure that ends lets the same account back in', async () => {
    let live: AuthSnapshot | null = USER_A;
    const { fake, client } = setup({ live: () => live });
    await client.start();
    client.reportAuthState(USER_A);
    client.discardAccount('uidA');
    assert.equal(client.clearClosedAccount(), true);
    assert.equal(client.clearClosedAccount(), false);
    client.reportAuthState(USER_A);
    assert.equal(fake.getIdentifiedId(), 'uidA');
    assert.equal(client.captureForUser('uidA', 'visibility_changed', { enabled: true }), true);
    live = null;
  });

  it('identity operations pass the pending cap while events do not', async () => {
    const fake = createFakeTransport();
    let ready: (t: FakeTransport) => void = () => {};
    const client = createAnalyticsClient({
      config: ENABLED,
      createTransport: () => new Promise((resolve) => (ready = resolve)),
      binary: () => ({ appVersion: '2.0.11', appBuild: '80' }),
    });
    const starting = client.start();
    client.reportAuthState(USER_A);
    for (let i = 0; i < 150; i += 1) {
      client.captureForUser('uidA', 'visibility_changed', { enabled: true });
    }
    client.discardAccount('uidA');
    client.reportAuthState(USER_B);
    await Promise.resolve();
    ready(fake);
    await starting;
    assert.ok(fake.calls.some((c) => c.op === 'discard' && c.distinctId === 'uidA'));
    assert.equal(fake.getIdentifiedId(), 'uidB');
    assert.ok(fake.captured().length < 150);
  });

  it('intent holds the account: its new events are dropped, not queued', async () => {
    const { fake, client } = setup();
    await client.start();
    client.reportAuthState(USER_A);
    fake.calls.length = 0;
    client.holdAccount('uidA');
    assert.equal(client.captureForUser('uidA', 'visibility_changed', { enabled: true }), false);
    client.captureDeviceEvent('app_opened', { open_type: 'return_from_background' });
    assert.equal(client.setPersonProperties('uidA', { profile_type: 'personal' }), false);
    assert.deepEqual(fake.calls, []);
    assert.equal(fake.getIdentifiedId(), 'uidA', 'identity is untouched until confirmed');
  });

  it('cancellation releases the hold and nothing was discarded', async () => {
    const { fake, client } = setup();
    await client.start();
    client.reportAuthState(USER_A);
    client.holdAccount('uidA');
    client.holdAccount(null);
    assert.equal(client.captureForUser('uidA', 'visibility_changed', { enabled: true }), true);
    assert.equal(fake.calls.some((c) => c.op === 'discard'), false);
  });

  it('a hold on one account does not touch another', async () => {
    const { fake, client } = setup();
    await client.start();
    client.reportAuthState(USER_B);
    client.holdAccount('uidA');
    assert.equal(client.captureForUser('uidB', 'visibility_changed', { enabled: true }), true);
    client.captureDeviceEvent('app_opened', { open_type: 'cold_start' });
    assert.equal(fake.captured().length, 2);
  });

  it('an SDK failure during the discard never reaches the deletion flow', async () => {
    const { fake, client } = setup();
    await client.start();
    client.reportAuthState(USER_A);
    fake.throwOn.add('discard');
    assert.doesNotThrow(() => client.discardAccount('uidA'));
  });

  it('with analytics off it does nothing', () => {
    const fake = createFakeTransport();
    const client = createAnalyticsClient({
      config: resolveAnalyticsConfig({}),
      createTransport: async () => fake,
      binary: () => ({ appVersion: null, appBuild: null }),
    });
    client.discardAccount('uidA');
    assert.deepEqual(fake.calls, []);
  });
});

describe('match_made through the facade', () => {
  it('one per profile and session; new session counts again', async () => {
    const { fake, client } = setup();
    bindFacade(client, memoryStore());
    await client.start();
    client.reportAuthState(USER_A);
    trackMatchPresented('uidA', 'other1', 80);
    trackMatchPresented('uidA', 'other1', 80);
    trackMatchPresented('uidA', 'other2', 49);
    await settle();
    assert.equal(fake.captured('match_made').length, 2);
    fake.sessionId = 'session-2';
    trackMatchPresented('uidA', 'other1', 80);
    await settle();
    assert.equal(fake.captured('match_made').length, 3);
  });

  it('absent score is not zero; a real zero is', async () => {
    const { fake, client } = setup();
    bindFacade(client, memoryStore());
    await client.start();
    client.reportAuthState(USER_A);
    trackMatchPresented('uidA', 'other', undefined);
    trackMatchPresented('uidA', 'other', null);
    await settle();
    assert.equal(fake.captured('match_made').length, 0);
    trackMatchPresented('uidA', 'other', 0);
    await settle();
    assert.equal(fake.captured('match_made')[0]?.properties.match_score, 0);
    assert.equal(fake.captured('match_made')[0]?.properties.match_score_range, 'low');
  });

  it('only a score in 0-100 counts, and it does not burn the dedupe', async () => {
    const { fake, client } = setup();
    bindFacade(client, memoryStore());
    await client.start();
    client.reportAuthState(USER_A);
    for (const bad of [-1, 100.5, 101, NaN, Infinity]) {
      trackMatchPresented('uidA', 'other', bad);
    }
    await settle();
    assert.equal(fake.captured('match_made').length, 0);
    trackMatchPresented('uidA', 'other', 74.5);
    trackMatchPresented('uidA', 'other2', 75);
    trackMatchPresented('uidA', 'other3', 100);
    trackMatchPresented('uidA', 'other4', 49.9);
    await settle();
    assert.deepEqual(
      fake.captured('match_made').map((e) => e.properties.match_score_range),
      ['medium', 'high', 'high', 'low'],
    );
  });

  it('list row and later profile opening count once', async () => {
    const { fake, client } = setup();
    bindFacade(client, memoryStore());
    await client.start();
    client.reportAuthState(USER_A);
    trackMatchPresented('uidA', 'other', 80); // row
    await settle();
    trackMatchPresented('uidA', 'other', 80); // opening
    await settle();
    assert.equal(fake.captured('match_made').length, 1);
  });

  it('A→B counts separately for the same profile', async () => {
    const { fake, client } = setup();
    bindFacade(client, memoryStore());
    await client.start();
    client.reportAuthState(USER_A);
    trackMatchPresented('uidA', 'other', 80);
    await settle();
    client.reportAuthState(USER_B);
    trackMatchPresented('uidB', 'other', 80);
    await settle();
    assert.deepEqual(
      fake.captured('match_made').map((e) => e.distinctId),
      ['uidA', 'uidB'],
    );
  });

  it('match_id is optional: a failed hash still reports the event', async () => {
    const { fake, client } = setup();
    bindFacade(client, memoryStore(), {
      sha256Hex: async () => {
        throw new Error('no crypto');
      },
    });
    await client.start();
    client.reportAuthState(USER_A);
    trackMatchPresented('uidA', 'other', 80);
    await settle();
    const [event] = fake.captured('match_made');
    assert.equal(event?.properties.match_score, 80);
    assert.equal('match_id' in (event?.properties ?? {}), false);
  });

  it('never sends the other UID', async () => {
    const { fake, client } = setup();
    bindFacade(client, memoryStore(), {
      sha256Hex: async () => 'ab'.repeat(32),
    });
    await client.start();
    client.reportAuthState(USER_A);
    trackMatchPresented('uidA', 'otherSecretUid', 90);
    await settle();
    const [event] = fake.captured('match_made');
    assert.equal(event?.properties.match_id, 'ab'.repeat(16));
    assert.equal(JSON.stringify(event).includes('otherSecretUid'), false);
  });
});

describe('withExternalAuthFlow', () => {
  it('runs the sign-in and reports begin and end', async () => {
    const flow: boolean[] = [];
    const { client } = setup();
    bindFacade(client, memoryStore(), {
      noteExternalAuthFlow: (active) => flow.push(active),
    });
    assert.equal(await withExternalAuthFlow(async () => 'done'), 'done');
    await assert.rejects(
      withExternalAuthFlow(async () => {
        throw new Error('cancelled');
      }),
      /cancelled/,
    );
    assert.deepEqual(flow, [true, false, true, false]);
  });

  it('with analytics off it only runs the sign-in', async () => {
    assert.equal(await withExternalAuthFlow(async () => 7), 7);
  });
});

describe('alert_opened through the facade', () => {
  it('a push tap before foreground start is sent once analytics binds', async () => {
    markAnalyticsConfigured();
    trackAlertOpened({ source: 'push', alertId: 'a1', motive: 'interest' });
    const { fake, client } = setup();
    bindFacade(client, memoryStore());
    await client.start();
    client.reportAuthState(USER_A);
    const [event] = fake.captured('alert_opened');
    assert.equal(event?.properties.source, 'push');
    assert.equal(event?.properties.alert_id, 'a1');
  });
});

describe('attribution flows', () => {
  const LINK =
    'https://go.example.com/c/summit?utm_medium=email&utm_source=mailchimp&utm_campaign=altercall_summit_2026&utm_content=hero';

  it('a new account keeps the campaign as its original acquisition', async () => {
    const { fake, client } = setup();
    const store = memoryStore();
    bindFacade(client, store);
    await client.start();
    client.reportAuthState(null);
    handleCampaignLink(LINK);
    await settle();
    assert.equal(JSON.stringify([...store.data.values()]).includes('https://'), false);

    client.reportAuthState(USER_A);
    trackSignupCompleted({ uid: 'uidA', method: 'email' });
    await settle();
    const props = fake.captured('signup_completed')[0]?.properties;
    assert.equal(props?.signup_source, 'email');
    assert.equal(props?.signup_campaign, 'altercall_summit_2026');
    assert.equal(props?.signup_content, 'hero');
    assert.equal(props?.signup_tool, 'mailchimp');
    assert.equal(props?.attribution_method, 'universal_link');
    const person = fake.calls.find((c) => c.op === 'setPerson');
    if (person?.op === 'setPerson') {
      assert.equal(person.setOnce.signup_campaign, 'altercall_summit_2026');
      assert.equal('signup_campaign' in person.set, false);
    } else {
      assert.fail('expected acquisition person properties');
    }
  });

  it('signup without evidence writes no organic or unknown', async () => {
    const { fake, client } = setup();
    bindFacade(client, memoryStore());
    await client.start();
    client.reportAuthState(USER_A);
    trackSignupCompleted({ uid: 'uidA', method: 'apple' });
    await settle();
    const props = fake.captured('signup_completed')[0]?.properties ?? {};
    assert.equal('signup_source' in props, false);
    assert.equal(fake.calls.some((c) => c.op === 'setPerson'), false);
  });

  it('attribution arriving after signup can still fill acquisition', async () => {
    const { fake, client } = setup();
    bindFacade(client, memoryStore());
    await client.start();
    client.reportAuthState(USER_B);
    trackSignupCompleted({ uid: 'uidB', method: 'google' });
    await settle();
    handleCampaignLink(LINK);
    await settle();
    assert.equal(fake.captured('acquisition_attributed').length, 1);
    assert.equal(fake.captured('campaign_accessed').length, 0);
  });

  it('an existing user gets a separate access, never acquisition', async () => {
    const { fake, client } = setup();
    bindFacade(client, memoryStore(), {
      now: () => Date.parse('2026-12-01T00:00:00Z'),
    });
    await client.start();
    client.reportAuthState(USER_A);
    handleCampaignLink(LINK);
    await settle();
    const [event] = fake.captured('campaign_accessed');
    assert.equal(event?.properties.campaign_name, 'altercall_summit_2026');
    assert.equal('signup_source' in (event?.properties ?? {}), false);
    assert.equal(
      fake.calls.some(
        (c) => c.op === 'setPerson' && 'signup_source' in c.setOnce,
      ),
      false,
    );
  });

  it('a second link on a fresh account does not overwrite acquisition', async () => {
    const { fake, client } = setup();
    bindFacade(client, memoryStore());
    await client.start();
    client.reportAuthState(USER_B);
    handleCampaignLink(LINK);
    await settle();
    handleCampaignLink(
      'https://go.example.com/c/x?utm_medium=qr&utm_campaign=other',
    );
    await settle();
    assert.equal(fake.captured('acquisition_attributed').length, 1);
    assert.equal(fake.captured('campaign_accessed')[0]?.properties.campaign_name, 'other');
  });

  it('an expired pending link is ignored', async () => {
    const { fake, client } = setup();
    const store = memoryStore();
    const attribution = parseCampaignLink(LINK, ['go.example.com'], NOW - 8 * 86400000);
    const services = bindFacade(client, store);
    assert.ok(attribution);
    await services.attribution.save(attribution);
    await client.start();
    client.reportAuthState(USER_A);
    await resolvePendingAttribution(services, USER_A);
    assert.equal(fake.calls.filter((c) => c.op === 'capture').length, 0);
  });
});

describe('canonical contract names', () => {
  it('events', () => {
    assert.ok('campaign_accessed' in EVENT_RULES);
    assert.equal('campaign_access' in EVENT_RULES, false);
    assert.ok('acquisition_attributed' in EVENT_RULES);
    assert.deepEqual(Object.keys(EVENT_RULES.foreground_location), ['granted']);
    assert.deepEqual(Object.keys(EVENT_RULES.background_location), ['granted']);
    assert.deepEqual(EVENT_RULES.alert_opened.source, {
      kind: 'enum',
      values: ['push', 'inbox'],
    });
  });

  it('person properties', () => {
    for (const name of [
      'social_platforms_manual',
      'social_platforms_verified',
      'foreground_location_granted',
      'background_location_granted',
      'distribution_channel',
      'is_test_user',
    ]) {
      assert.ok(name in PERSON_PROPERTY_RULES, name);
    }
    for (const name of [
      'socials_manual',
      'socials_verified',
      'foreground_location',
      'background_location',
    ]) {
      assert.equal(name in PERSON_PROPERTY_RULES, false, name);
    }
  });

  it('every new name passes the filter and is_test_user can only be true', () => {
    assert.equal(isAllowedOutgoingEvent('campaign_accessed'), true);
    assert.equal(isAllowedOutgoingEvent('campaign_access'), false);
    assert.equal(isValidValue(PERSON_PROPERTY_RULES.is_test_user, true), true);
    assert.equal(isValidValue(PERSON_PROPERTY_RULES.is_test_user, false), false);
  });
});

describe('source guards', () => {
  const read = (path: string) =>
    readFileSync(join(repoRoot, path), 'utf8');

  it('deletion reaches analytics only as a guarded subscriber', () => {
    const runtime = read('packages/shared/src/analytics/runtime.ts');
    for (const call of [
      'subscribeAccountDeletionClosure(syncAccountDeletion)',
      'subscribeAccountDeletionSession(syncAccountDeletion)',
      'subscribePendingAccountDeletion(syncAccountDeletion)',
      'await deletionRecords.purgeQueued(transport)',
    ]) {
      assert.ok(runtime.includes(call), call);
    }
    const session = read('packages/shared/src/services/accountDeletionSession.ts');
    assert.equal(session.includes('analytics'), false);
    assert.ok(/listener\(\);\s*\} catch/.test(session));
  });

  it('sign-in entry points and Discovery are wired', () => {
    for (const path of [
      'packages/shared/src/hooks/useGoogleSignInFlow.ts',
      'packages/shared/src/hooks/useFacebookSignInFlow.ts',
      'packages/shared/src/hooks/useAppleSignInFlow.ts',
      'packages/shared/src/authentication/linkedinA3/browserSession.ts',
    ]) {
      assert.ok(read(path).includes('withExternalAuthFlow('), path);
    }
    const profile = read('packages/shared/src/screens/DiscoveryProfileScreen.tsx');
    assert.ok(profile.includes('trackMatchPresented(viewerUid, uid, score)'));
    const app = read('packages/shared/src/App.tsx');
    assert.ok(app.includes('pushOpenCoordinator.setSession(lastUid);'));
  });

  it('PostHog runs with every automatic capture off', () => {
    const source = read('packages/shared/src/analytics/postHogTransport.ios.ts');
    for (const option of [
      'captureAppLifecycleEvents: false',
      'enableSessionReplay: false',
      'disableRemoteFeatureFlags: true',
      'disableRemoteConfig: true',
      'preloadFeatureFlags: false',
      'disableSurveys: true',
      'disableGeoip: true',
      'capturePushNotificationOpened: false',
      'capturePushNotificationSubscriptions: false',
    ]) {
      assert.ok(source.includes(option), option);
    }
    assert.equal(source.includes('PostHogProvider'), false);
    assert.equal(/enabled:\s*true/.test(source), false);
  });

  it('only the iOS transport imports the SDK', () => {
    const runtime = read('packages/shared/src/analytics/runtime.ts');
    assert.equal(/from 'posthog-react-native'/.test(runtime), false);
    assert.equal(/from 'expo-application'/.test(runtime), false);
    const noop = read('packages/shared/src/analytics/postHogTransport.ts');
    assert.equal(noop.includes('posthog-react-native'), false);
  });

  it('the runtime stops before touching anything when disabled', () => {
    const source = read('packages/shared/src/analytics/runtime.ts');
    const gate = source.indexOf('if (!config.enabled) return;');
    assert.ok(gate > 0);
    for (const later of [
      'AppState.addEventListener',
      'createAnalyticsClient({',
      'createEventLedger(',
    ]) {
      assert.ok(source.indexOf(later) > gate, later);
    }
  });

  it('bound services wait for a real foreground', () => {
    const source = read('packages/shared/src/analytics/runtime.ts');
    assert.ok(source.includes("if (state === 'active') ensureForegroundStarted();"));
    const location = read('packages/shared/src/background/locationTask.ios.ts');
    assert.equal(location.includes('analytics'), false);
  });

  it('dependencies are pinned and nothing turns delivery on', () => {
    const pkg = JSON.parse(read('apps/nearsy-ios/package.json'));
    assert.equal(pkg.dependencies['posthog-react-native'], '4.85.3');
    assert.equal(pkg.dependencies['expo-application'], '7.0.8');
  });

  it('eas.json: non-secret switches only, each channel in its own profile, never a token', () => {
    const raw = read('apps/nearsy-ios/eas.json');
    const eas = JSON.parse(raw);
    assert.equal(/phc_[A-Za-z0-9]/.test(raw), false);
    assert.equal(raw.includes('EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN'), false);
    const allowed = new Set([
      'EXPO_PUBLIC_POSTHOG_ENABLED',
      'EXPO_PUBLIC_POSTHOG_DISTRIBUTION_CHANNEL',
    ]);
    const channelFor: Record<string, string> = { beta: 'beta', production: 'production' };
    for (const [name, profile] of Object.entries(eas.build) as [string, any][]) {
      const keys = Object.keys(profile.env ?? {}).filter((k) => k.includes('POSTHOG'));
      for (const key of keys) assert.ok(allowed.has(key), `${name}: ${key}`);
      if (keys.length === 0) continue;
      assert.ok(name in channelFor, `${name} cannot declare analytics`);
      assert.equal(profile.env.EXPO_PUBLIC_POSTHOG_DISTRIBUTION_CHANNEL, channelFor[name], name);
      assert.notEqual(profile.env.EXPO_PUBLIC_NEARSY_FIREBASE_ENV, 'development', name);
    }
  });

  it('eas.json today: Beta declared, public production numbered and off', () => {
    const eas = JSON.parse(read('apps/nearsy-ios/eas.json'));
    assert.deepEqual(eas.build.production.env, {
      EXPO_PUBLIC_NEARSY_FIREBASE_ENV: 'production',
      NEARSY_IOS_VERSION: '2.0.10',
      NEARSY_IOS_BUILD_NUMBER: '78',
    });
    assert.equal(eas.build.production.environment, 'production');
    assert.equal(eas.build.production.autoIncrement, false);
    assert.equal(eas.build.beta.extends, 'production');
    assert.deepEqual(eas.build.beta.env, {
      EXPO_PUBLIC_NEARSY_FIREBASE_ENV: 'production',
      EXPO_PUBLIC_POSTHOG_ENABLED: 'true',
      EXPO_PUBLIC_POSTHOG_DISTRIBUTION_CHANNEL: 'beta',
      NEARSY_IOS_VERSION: '2.0.10',
      NEARSY_IOS_BUILD_NUMBER: '74',
    });
    const config = resolveAnalyticsConfig({
      enabledFlag: eas.build.beta.env.EXPO_PUBLIC_POSTHOG_ENABLED,
      distributionChannel: eas.build.beta.env.EXPO_PUBLIC_POSTHOG_DISTRIBUTION_CHANNEL,
      firebaseEnv: eas.build.beta.env.EXPO_PUBLIC_NEARSY_FIREBASE_ENV,
      token: 'phc_fake',
    });
    assert.equal(config.enabled, true);
    assert.equal(config.isTestInstall, true);
    assert.equal(
      resolveAnalyticsConfig({ ...eas.build.beta.env, token: 'phc_fake' }).enabled,
      false,
      'the token alone, or the profile without a token, never turns it on',
    );
  });

  it('location code never reaches the analytics payloads', () => {
    const source = read('packages/shared/src/analytics/locationPermissions.ts');
    assert.equal(/coords|latitude|longitude/.test(source.replace(/\/\*[\s\S]*?\*\//g, '')), false);
  });
});

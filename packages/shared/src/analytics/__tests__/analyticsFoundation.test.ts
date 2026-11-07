/**
 * PostHog foundation batch: identity, gating, ordering, failures, app_opened.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { resolveAnalyticsConfig } from '../analyticsConfig.ts';
import {
  computeCompletionTimeMin,
  describeForInspection,
  isAllowedOutgoingEvent,
  isConfirmedNewAccount,
} from '../analyticsContract.ts';
import {
  createAnalyticsSession,
  type AnalyticsAuthUser,
  type AnalyticsTransport,
} from '../analyticsCore.ts';
import {
  buildBasePersonProperties,
  buildPersonProperties,
} from '../analyticsPersonProperties.ts';
import {
  APP_OPENED_MIN_BACKGROUND_MS,
  createAppOpenedTracker,
} from '../appOpenedTracker.ts';

const here = dirname(fileURLToPath(import.meta.url));
const read = (fromSrc: string) => readFileSync(join(here, '..', '..', fromSrc), 'utf8');

const VALID_TOKEN = `phc_${'a'.repeat(24)}`;
const NOW = Date.parse('2026-11-06T12:00:00.000Z');

type Call = [string, ...unknown[]];

function fakeTransport(options: { persisted?: string | null; failing?: boolean } = {}) {
  const calls: Call[] = [];
  const record = (name: string, ...args: unknown[]) => {
    calls.push([name, ...args]);
    if (options.failing) return Promise.reject(new Error(`${name} failed`));
  };
  const transport: AnalyticsTransport = {
    getIdentifiedDistinctId: () => options.persisted ?? null,
    getSessionId: () => 'session-1',
    identify: (uid, properties) => record('identify', uid, properties),
    setPersonProperties: (properties) => record('set', properties),
    reset: () => record('reset'),
    register: (properties) => record('register', properties),
    capture: (event, properties) => record('capture', event, properties),
  };
  return { calls, transport };
}

function makeSession(
  initialUser: AnalyticsAuthUser | null,
  options: {
    persisted?: string | null;
    failing?: boolean;
    loadFails?: boolean;
    creationTime?: () => unknown;
  } = {},
) {
  const auth = { user: initialUser };
  const { calls, transport } = fakeTransport(options);
  const session = createAnalyticsSession({
    loadTransport: async () => {
      if (options.loadFails) throw new Error('sdk unavailable');
      return transport;
    },
    getAuthUser: () => auth.user,
    readCreationTime: options.creationTime ?? (() => '2026-11-06T11:30:00.000Z'),
    buildBaseProperties: (user) => buildBasePersonProperties({ authEmail: user.email }),
    buildProfileProperties: (user, doc) =>
      buildPersonProperties({
        doc,
        authEmail: user.email,
        normalizeLanguages: (values) => values as string[],
      }),
    superProperties: { platform: 'Android', environment: 'production' },
    now: () => NOW,
  });
  const names = () => calls.map(([name, first]) =>
    name === 'capture' || name === 'identify' ? `${name}:${first}` : name,
  );
  return { auth, calls, names, session };
}

describe('account identity', () => {
  it('a new account identifies before signup_completed', async () => {
    const { names, session } = makeSession({ uid: 'A', email: 'a@example.com' });
    session.trackSignupCompleted('A');
    session.noteAuthChange();
    await session.settled();
    assert.deepEqual(names(), ['register', 'identify:A', 'capture:signup_completed']);
  });

  it('only a confirmed new credential counts as a signup', () => {
    assert.equal(isConfirmedNewAccount({ additionalUserInfo: { isNewUser: true } }), true);
    assert.equal(isConfirmedNewAccount({ additionalUserInfo: { isNewUser: false } }), false);
    assert.equal(isConfirmedNewAccount({ additionalUserInfo: {} }), false);
    assert.equal(isConfirmedNewAccount({}), false);
    assert.equal(isConfirmedNewAccount(null), false);
  });

  it('an existing account or a restored session emits no signup', async () => {
    const { names, session } = makeSession({ uid: 'A' }, { persisted: 'A' });
    session.noteAuthChange();
    await session.settled();
    assert.deepEqual(names(), ['register']);
  });

  it('login identifies without any event', async () => {
    const { names, session } = makeSession({ uid: 'A' });
    session.noteAuthChange();
    await session.settled();
    assert.deepEqual(names(), ['register', 'identify:A']);
  });

  it('logout resets and restores technical properties', async () => {
    const { auth, names, session } = makeSession({ uid: 'A' }, { persisted: 'A' });
    auth.user = null;
    session.noteAuthChange();
    await session.settled();
    assert.deepEqual(names(), ['register', 'reset', 'register']);
  });

  it('an anonymous session does not rotate its id', async () => {
    const { names, session } = makeSession(null);
    session.noteAuthChange();
    await session.settled();
    assert.deepEqual(names(), ['register']);
  });

  it('changing from A to B resets before identifying B', async () => {
    const { auth, names, session } = makeSession({ uid: 'A' }, { persisted: 'A' });
    auth.user = { uid: 'B' };
    session.trackSignupCompleted('B');
    session.noteAuthChange();
    await session.settled();
    assert.deepEqual(names(), [
      'register',
      'reset',
      'register',
      'identify:B',
      'capture:signup_completed',
    ]);
  });

  it('a persisted id from another account is replaced at startup', async () => {
    const { names, session } = makeSession({ uid: 'B' }, { persisted: 'A' });
    session.noteAuthChange();
    await session.settled();
    assert.deepEqual(names(), ['register', 'reset', 'register', 'identify:B']);
  });

  it('events for a previous user are dropped after the switch', async () => {
    const { auth, names, session } = makeSession({ uid: 'B' }, { persisted: 'B' });
    auth.user = { uid: 'B' };
    session.trackSignupCompleted('A');
    session.trackProfileCompleted('A');
    session.syncPersonProfile('A', { mode: 'personal' });
    await session.settled();
    assert.deepEqual(names(), ['register']);
  });

  it('a stale logout callback does not reset the new user', async () => {
    const { names, session } = makeSession({ uid: 'B' }, { persisted: 'B' });
    session.noteAuthChange();
    await session.settled();
    assert.deepEqual(names(), ['register']);
  });

  it('signup_completed is not repeated for the same account', async () => {
    const { names, session } = makeSession({ uid: 'A' }, { persisted: 'A' });
    session.trackSignupCompleted('A');
    session.trackSignupCompleted('A');
    await session.settled();
    assert.deepEqual(names(), ['register', 'capture:signup_completed']);
  });
});

describe('remote activation', () => {
  const production = {
    nearsyFirebaseEnv: 'production',
    nearsyDevClient: false,
    nearsyAnalytics: { enabled: true, environment: 'production', token: VALID_TOKEN },
  };

  it('is off by default, including production', () => {
    assert.equal(resolveAnalyticsConfig({ extras: null, isDev: false }).mode, 'off');
    assert.equal(resolveAnalyticsConfig({ extras: {}, isDev: false }).mode, 'off');
    assert.equal(
      resolveAnalyticsConfig({
        extras: { nearsyFirebaseEnv: 'production', nearsyAnalytics: { enabled: false } },
        isDev: false,
      }).mode,
      'off',
    );
  });

  it('rejects invalid configuration', () => {
    const cases = [
      { ...production, nearsyAnalytics: { ...production.nearsyAnalytics, enabled: 'true' } },
      { ...production, nearsyAnalytics: { ...production.nearsyAnalytics, token: '' } },
      { ...production, nearsyAnalytics: { ...production.nearsyAnalytics, token: 'phx_personal' } },
      { ...production, nearsyAnalytics: { ...production.nearsyAnalytics, environment: 'preview' } },
      { ...production, nearsyAnalytics: { ...production.nearsyAnalytics, environment: '' } },
      { ...production, nearsyFirebaseEnv: 'development' },
      { ...production, nearsyDevClient: true },
    ];
    for (const extras of cases) {
      assert.equal(resolveAnalyticsConfig({ extras, isDev: false }).mode, 'off');
    }
  });

  it('development only inspects locally, even with a valid configuration', () => {
    assert.deepEqual(resolveAnalyticsConfig({ extras: production, isDev: true }), {
      mode: 'inspect',
      environment: 'development',
    });
  });

  it('needs every condition and always uses the US host', () => {
    const config = resolveAnalyticsConfig({ extras: production, isDev: false });
    assert.equal(config.mode, 'remote');
    assert.equal(config.mode === 'remote' && config.host, 'https://us.i.posthog.com');
  });

  it('the build embeds no token unless capture is enabled', () => {
    const appConfig = readFileSync(
      join(here, '..', '..', '..', '..', '..', 'apps', 'nearsy-android', 'app.config.js'),
      'utf8',
    );
    const buildConfig = readFileSync(
      join(here, '..', '..', '..', '..', '..', 'apps', 'nearsy-android', 'plugins', 'analyticsBuildConfig.js'),
      'utf8',
    );
    assert.doesNotMatch(appConfig, /phc_/);
    assert.doesNotMatch(buildConfig, /phc_/);
  });

  it('the disabled path never loads the SDK', () => {
    const binding = read('analytics/analytics.android.ts');
    assert.doesNotMatch(binding, /^import .*posthog-react-native/m);
    assert.match(binding, /if \(config\.mode === 'off'\) return null;/);
    const base = read('analytics/analytics.ts');
    assert.doesNotMatch(base, /posthog|firebase|react-native/);
  });

  it('keeps automatic capture, flags and GeoIP off', () => {
    const binding = read('analytics/analyticsSdkTransport.ts');
    for (const option of [
      'captureAppLifecycleEvents: false',
      'enableSessionReplay: false',
      'errorTracking: { autocapture: false }',
      'preloadFeatureFlags: false',
      'disableRemoteFeatureFlags: true',
      'disableSurveys: true',
      'disableGeoip: true',
    ]) {
      assert.ok(binding.includes(option), option);
    }
    assert.doesNotMatch(binding, /PostHogProvider/);
  });

  it('only events of this batch may leave the device', () => {
    for (const allowed of ['app_opened', 'signup_completed', 'profile_completed', '$identify', '$set']) {
      assert.equal(isAllowedOutgoingEvent(allowed), true);
    }
    for (const blocked of ['$screen', '$autocapture', '$exception', 'Application Opened', 'premium_activated', undefined]) {
      assert.equal(isAllowedOutgoingEvent(blocked), false);
    }
  });

  it('background location code does not touch analytics', () => {
    assert.doesNotMatch(read('background/locationTask.android.ts'), /analytics/i);
  });
});

describe('failures never reach the product flow', () => {
  it('a failing SDK neither throws nor rejects, and later calls still run', async () => {
    const { names, session } = makeSession({ uid: 'A' }, { failing: true });
    assert.doesNotThrow(() => session.trackSignupCompleted('A'));
    assert.doesNotThrow(() => session.trackProfileCompleted('A'));
    await assert.doesNotReject(session.settled());
    assert.deepEqual(names(), ['register', 'identify:A', 'identify:A']);
  });

  it('a failed identify blocks the event instead of sending it to another person', async () => {
    const { names, session } = makeSession({ uid: 'A' }, { failing: true });
    session.trackSignupCompleted('A');
    await session.settled();
    assert.equal(names().includes('capture:signup_completed'), false);
  });

  it('an SDK that cannot load turns the session into a no-op', async () => {
    const { calls, session } = makeSession({ uid: 'A' }, { loadFails: true });
    session.noteAuthChange();
    session.trackAppOpened();
    session.trackProfileCompleted('A');
    session.syncPersonProfile('A', { mode: 'personal' });
    await assert.doesNotReject(session.settled());
    assert.equal(calls.length, 0);
  });

  it('call sites do not await analytics', () => {
    for (const file of [
      'services/authService.android.ts',
      'services/firebaseGoogleAuth.android.ts',
      'services/firebaseFacebookAuth.android.ts',
      'screens/ProfileCompletionScreen.tsx',
    ]) {
      assert.doesNotMatch(read(file), /await track(Signup|Profile)Completed/);
    }
  });
});

describe('signup_completed wiring', () => {
  it('fires for email only after the account was created', () => {
    const source = read('services/authService.android.ts');
    assert.ok(
      source.indexOf('createUserWithEmailAndPassword') <
        source.indexOf('trackSignupCompleted(userCredential.user.uid)'),
    );
    const login = source.slice(source.indexOf('export const loginWithEmail'));
    assert.doesNotMatch(login, /trackSignupCompleted/);
  });

  it('Google and Facebook need the confirmed new-account flag', () => {
    for (const file of [
      'services/firebaseGoogleAuth.android.ts',
      'services/firebaseFacebookAuth.android.ts',
    ]) {
      assert.match(
        read(file),
        /if \(isConfirmedNewAccount\(userCredential\)\) \{\s+trackSignupCompleted\(/,
      );
    }
  });

  it('LinkedIn is outside this batch', () => {
    assert.doesNotMatch(
      read('authentication/linkedin/linkedinAuth.android.ts'),
      /trackSignupCompleted/,
    );
  });
});

describe('profile_completed', () => {
  it('fires right after the awaited final save, and not before', () => {
    const source = read('screens/ProfileCompletionScreen.tsx');
    const save = source.indexOf('await updateUserProfilePartial(uid, {\n        profileSetupCompleted: true')
      >= 0
      ? source.indexOf('await updateUserProfilePartial(uid, {\n        profileSetupCompleted: true')
      : source.indexOf('await updateUserProfilePartial(uid, {\r\n        profileSetupCompleted: true');
    const track = source.indexOf('trackProfileCompleted(uid)');
    const start = source.indexOf('async function finishOnboarding');
    assert.ok(start >= 0 && start < save && save < track);
    assert.equal(source.split('trackProfileCompleted(uid)').length, 2);
    assert.match(source.slice(save, track), /\}\);\s+$/);
  });

  it('a save that fails never reaches the event', async () => {
    const { names, session } = makeSession({ uid: 'A' }, { persisted: 'A' });
    const finish = async (save: () => Promise<void>) => {
      await save();
      session.trackProfileCompleted('A');
    };
    await assert.rejects(finish(() => Promise.reject(new Error('offline'))));
    await session.settled();
    assert.deepEqual(names(), []);
    await finish(() => Promise.resolve());
    await session.settled();
    assert.deepEqual(names(), ['register', 'capture:profile_completed']);
  });

  it('sends elapsed minutes since account creation', async () => {
    const { calls, session } = makeSession({ uid: 'A' }, { persisted: 'A' });
    session.trackProfileCompleted('A');
    await session.settled();
    assert.deepEqual(calls.at(-1), ['capture', 'profile_completed', { completion_time_min: 30 }]);
  });

  it('a retried save does not repeat the event', async () => {
    const { names, session } = makeSession({ uid: 'A' }, { persisted: 'A' });
    session.trackProfileCompleted('A');
    session.trackProfileCompleted('A');
    await session.settled();
    assert.equal(names().filter((n) => n === 'capture:profile_completed').length, 1);
  });

  for (const [label, creationTime] of [
    ['missing', () => undefined],
    ['invalid', () => 'not-a-date'],
    ['in the future', () => '2026-11-06T13:00:00.000Z'],
    ['throwing getter', () => { throw new RangeError('Invalid time value'); }],
  ] as const) {
    it(`omits the duration when the date is ${label}, keeping the event`, async () => {
      const { calls, session } = makeSession({ uid: 'A' }, { persisted: 'A', creationTime });
      session.trackProfileCompleted('A');
      await session.settled();
      assert.deepEqual(calls.at(-1), ['capture', 'profile_completed', {}]);
    });
  }

  it('computes durations and rejects unusable dates', () => {
    assert.equal(computeCompletionTimeMin('2026-11-06T11:59:00.000Z', NOW), 1);
    assert.equal(computeCompletionTimeMin('2026-11-06T12:00:00.000Z', NOW), 0);
    assert.equal(computeCompletionTimeMin('2026-11-06T11:59:30.000Z', NOW), 0.5);
    assert.equal(computeCompletionTimeMin('', NOW), undefined);
    assert.equal(computeCompletionTimeMin(null, NOW), undefined);
    assert.equal(computeCompletionTimeMin(1234, NOW), undefined);
    assert.equal(computeCompletionTimeMin('1970-01-01T00:00:00.000Z', NOW), undefined);
  });
});

describe('person properties', () => {
  const normalizeLanguages = (values: unknown) => values as string[];

  it('omits what is unknown', () => {
    assert.deepEqual(
      buildPersonProperties({ doc: {}, authEmail: null, normalizeLanguages }),
      { platform: 'Android' },
    );
    assert.equal(
      buildPersonProperties({ doc: null, authEmail: 'a@example.com', normalizeLanguages }),
      null,
    );
  });

  it('sends confirmed empty values explicitly', () => {
    assert.deepEqual(
      buildPersonProperties({
        doc: {
          mode: 'personal',
          languageCodes: [],
          profiles: { personal: { occupation: '  ' } },
        },
        authEmail: null,
        normalizeLanguages,
      }),
      { platform: 'Android', profile_type: 'personal', occupation: null, languages: [] },
    );
  });

  it('reads the active mode and prefers the auth email', () => {
    assert.deepEqual(
      buildPersonProperties({
        doc: {
          email: 'doc@example.com',
          mode: 'professional',
          languageCodes: ['es', 'en'],
          occupation: 'Top',
          profiles: {
            personal: { occupation: 'Personal' },
            professional: { occupation: 'Designer' },
          },
        },
        authEmail: 'auth@example.com',
        appVersion: '2.0.9',
        normalizeLanguages,
      }),
      {
        platform: 'Android',
        app_version: '2.0.9',
        email: 'auth@example.com',
        profile_type: 'professional',
        occupation: 'Designer',
        languages: ['es', 'en'],
      },
    );
  });

  it('falls back to the document email for providers without one', () => {
    assert.equal(
      buildPersonProperties({
        doc: { email: 'doc@example.com' },
        authEmail: '',
        normalizeLanguages,
      })?.email,
      'doc@example.com',
    );
  });

  it('never sends excluded fields', () => {
    const properties = buildPersonProperties({
      doc: {
        mode: 'personal',
        birthCountryCode: 'MX',
        currentCity: { countryCode: 'US' },
        birthDate: '1990-01-01',
        gender: 'x',
        seniority: 'x',
        industry: 'x',
      },
      authEmail: null,
      normalizeLanguages,
    });
    for (const excluded of ['gender', 'seniority', 'industry']) {
      assert.equal(excluded in (properties ?? {}), false, excluded);
    }
  });

  it('repeated snapshots do not rewrite unchanged properties', async () => {
    const { calls, session } = makeSession({ uid: 'A' }, { persisted: 'A' });
    const doc = { mode: 'personal', languageCodes: ['es'] };
    session.syncPersonProfile('A', doc);
    session.syncPersonProfile('A', { ...doc });
    await session.settled();
    assert.equal(calls.filter(([name]) => name === 'set').length, 1);
    session.syncPersonProfile('A', { ...doc, mode: 'professional' });
    await session.settled();
    assert.equal(calls.filter(([name]) => name === 'set').length, 2);
  });

  it('the next user gets a full write after a change of account', async () => {
    const { auth, calls, session } = makeSession({ uid: 'A' }, { persisted: 'A' });
    const doc = { mode: 'personal' };
    session.syncPersonProfile('A', doc);
    await session.settled();
    auth.user = { uid: 'B' };
    session.syncPersonProfile('B', doc);
    await session.settled();
    assert.equal(calls.filter(([name]) => name === 'set').length, 2);
  });

  it('the profile listener hands data to analytics and to the gate', () => {
    assert.match(
      read('navigation/AppNavigator.tsx'),
      /syncAnalyticsPersonProfile\(uid, data\);\s+onData\(data\);/,
    );
  });
});

describe('local inspection', () => {
  it('masks personal data and keeps technical values', () => {
    const view = describeForInspection({
      email: 'a@example.com',
      occupation: 'Designer',
      session_id: 'abc',
      token: 'phc_secret',
      languages: ['es'],
      platform: 'Android',
      completion_time_min: 3,
      profile_type: 'personal',
    });
    assert.deepEqual(view, {
      email: '<redacted>',
      occupation: '<redacted>',
      session_id: '<redacted>',
      token: '<redacted>',
      languages: '<1 items>',
      platform: 'Android',
      completion_time_min: 3,
      profile_type: 'personal',
    });
    assert.doesNotMatch(JSON.stringify(view), /a@example|Designer|phc_secret/);
  });

  it('the inspect transport does not log the uid', () => {
    assert.match(
      read('analytics/analytics.android.ts'),
      /identify: \(_uid, properties\) => log\('identify', properties\)/,
    );
  });
});

describe('app_opened', () => {
  function makeTracker() {
    let now = 1_000;
    let count = 0;
    const tracker = createAppOpenedTracker({ now: () => now, emit: () => { count += 1; } });
    return {
      tracker,
      advance: (ms: number) => { now += ms; },
      count: () => count,
    };
  }

  it('fires once at foreground start after auth is known', () => {
    const { count, tracker } = makeTracker();
    tracker.noteAppState('active');
    assert.equal(count(), 0);
    tracker.noteAuthReady();
    assert.equal(count(), 1);
    tracker.noteAuthReady();
    tracker.noteAppState('active');
    assert.equal(count(), 1);
  });

  it('does not fire for a process started in the background', () => {
    const { count, tracker } = makeTracker();
    tracker.noteAppState('background');
    tracker.noteAuthReady();
    assert.equal(count(), 0);
    tracker.noteAppState('active');
    assert.equal(count(), 1);
  });

  it('ignores inactive to active transitions', () => {
    const { advance, count, tracker } = makeTracker();
    tracker.noteAuthReady();
    tracker.noteAppState('active');
    tracker.noteAppState('inactive');
    advance(APP_OPENED_MIN_BACKGROUND_MS * 2);
    tracker.noteAppState('active');
    assert.equal(count(), 1);
  });

  it('fires again on a real return from background', () => {
    const { advance, count, tracker } = makeTracker();
    tracker.noteAuthReady();
    tracker.noteAppState('active');
    tracker.noteAppState('background');
    advance(APP_OPENED_MIN_BACKGROUND_MS);
    tracker.noteAppState('active');
    assert.equal(count(), 2);
    tracker.noteAppState('active');
    assert.equal(count(), 2);
  });

  it('ignores a short pause such as a permission dialog', () => {
    const { advance, count, tracker } = makeTracker();
    tracker.noteAuthReady();
    tracker.noteAppState('active');
    tracker.noteAppState('background');
    advance(APP_OPENED_MIN_BACKGROUND_MS - 1);
    tracker.noteAppState('active');
    assert.equal(count(), 1);
  });

  it('counts the first background moment, not repeated reports', () => {
    const { advance, count, tracker } = makeTracker();
    tracker.noteAuthReady();
    tracker.noteAppState('active');
    tracker.noteAppState('background');
    advance(APP_OPENED_MIN_BACKGROUND_MS);
    tracker.noteAppState('background');
    tracker.noteAppState('active');
    assert.equal(count(), 2);
  });

  it('uses the SDK session id, identifies first and omits is_first_open', async () => {
    const { calls, names, session } = makeSession({ uid: 'A' });
    session.trackAppOpened();
    await session.settled();
    assert.deepEqual(names(), ['register', 'identify:A', 'capture:app_opened']);
    assert.deepEqual(calls.at(-1), ['capture', 'app_opened', { session_id: 'session-1' }]);
  });

  it('clears a stale identity before the open of a signed-out user', async () => {
    const { names, session } = makeSession(null, { persisted: 'A' });
    session.trackAppOpened();
    await session.settled();
    assert.deepEqual(names(), ['register', 'reset', 'register', 'capture:app_opened']);
  });

  it('never infers is_first_open from the welcome flag', () => {
    for (const file of [
      'analytics/analytics.android.ts',
      'analytics/analyticsCore.ts',
      'analytics/appOpenedTracker.ts',
    ]) {
      assert.doesNotMatch(read(file), /is_first_open|hasSeenWelcome/);
    }
  });

  it('starts from the mounted app', () => {
    assert.match(read('App.tsx'), /useEffect\(\(\) => startAnalytics\(\), \[\]\);/);
  });
});

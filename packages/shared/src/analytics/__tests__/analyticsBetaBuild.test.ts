/**
 * The whole path of a build, from the real files to the wire: eas.json profile,
 * app.config.js, the runtime resolver, the Android binding and the real SDK class.
 * Native modules are stubbed and the network is scripted, so this is not a device
 * run. The token is fake.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import { dirname, join } from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  installFakeServer,
  loadRealPostHog,
  restoreGlobals,
  tick,
} from './realSdkHarness.ts';

const nodeRequire = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, '..', '..', '..', '..', '..', 'apps', 'nearsy-android');
const FAKE_TOKEN = 'phc_fake_token_only_for_this_test_0001';
const CONFIG_URL = `https://us-assets.i.posthog.com/array/${FAKE_TOKEN}/config`;
const BATCH_URL = 'https://us.i.posthog.com/batch/';
const REAL_UID = 'firebaseUidOfARealAccount123';

type BuildProfile = { extends?: string; env?: Record<string, string> };

/** Env of a profile, parents first, as `extends` resolves it. */
function profileEnv(name: string): Record<string, string> {
  const { build } = JSON.parse(readFileSync(join(appDir, 'eas.json'), 'utf8')) as {
    build: Record<string, BuildProfile>;
  };
  const profile = build[name];
  return {
    ...(profile.extends ? profileEnv(profile.extends) : {}),
    ...profile.env,
  };
}

/** Evaluates the real app.config.js with exactly this environment. */
function extrasFor(env: Record<string, string>): Record<string, unknown> {
  const saved = { ...process.env };
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('NEARSY_')) delete process.env[key];
  }
  Object.assign(process.env, env);
  try {
    const path = join(appDir, 'app.config.js');
    delete nodeRequire.cache[path];
    const loaded = nodeRequire(path);
    const config = typeof loaded === 'function' ? loaded({ config: {} }) : (loaded.default ?? loaded);
    return (config.expo ?? config).extra;
  } finally {
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, saved);
  }
}

type Stubs = {
  auth: {
    currentUser: { uid: string; email?: string; metadata?: { creationTime?: string } } | null;
    app: { options: { projectId: string } };
    onAuthStateChanged(listener: () => void): () => void;
    listeners: Array<() => void>;
  };
};
const stubs = globalThis as unknown as { __analyticsStubs: Stubs & Record<string, unknown> };

const authStub: Stubs['auth'] = {
  currentUser: null,
  app: { options: { projectId: 'nearsy-pj' } },
  listeners: [],
  onAuthStateChanged(listener) {
    authStub.listeners.push(listener);
    listener();
    return () => {};
  },
};

const STUB_SOURCES: Record<string, string> = {
  'stub:react-native': `
    const rn = globalThis.__analyticsStubs.reactNative;
    export const AppState = rn.AppState;
    export const Linking = rn.Linking;`,
  'stub:firebase': `export const firebaseAuth = globalThis.__analyticsStubs.auth;`,
  'stub:languages': `export const normalizeLanguageCodes = (values) => values;`,
};

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'react-native') return { url: 'stub:react-native', shortCircuit: true };
    if (specifier.endsWith('config/firebaseConfig.android')) {
      return { url: 'stub:firebase', shortCircuit: true };
    }
    if (specifier.endsWith('profileContext/languageCatalog')) {
      return { url: 'stub:languages', shortCircuit: true };
    }
    if (specifier.startsWith('./analytics') || specifier.startsWith('./appOpened') ||
        specifier.startsWith('./ownExternal')) {
      if (context.parentURL?.includes('/analytics/') && !/\.ts(\?|$)/.test(specifier)) {
        return next(`${specifier}.ts`, context);
      }
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    const source = STUB_SOURCES[url];
    return source !== undefined
      ? { format: 'module', source, shortCircuit: true }
      : next(url, context);
  },
});

const memoryStorage = () => {
  const stored = new Map<string, string>();
  return {
    getItem: async (key: string) => stored.get(key) ?? null,
    setItem: async (key: string, value: string) => void stored.set(key, value),
    removeItem: async (key: string) => void stored.delete(key),
  };
};

let RealPostHog: new (token: string, options: Record<string, unknown>) => object;

before(() => {
  RealPostHog = loadRealPostHog() as typeof RealPostHog;
  stubs.__analyticsStubs = {
    auth: authStub,
    reactNative: {
      AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
      Linking: {
        getInitialURL: async () => null,
        addEventListener: () => ({ remove() {} }),
      },
    },
  };
});
after(() => {
  restoreGlobals();
  delete (globalThis as { require?: unknown }).require;
});
beforeEach(() => {
  authStub.currentUser = null;
  authStub.listeners.length = 0;
});

let caseNumber = 0;

/** Loads a fresh copy of the binding, as a new process of a build with these extras. */
async function startBuild(extra: Record<string, unknown>, remoteConfig: Record<string, unknown> = {}) {
  const constructed: Array<Record<string, unknown>> = [];
  const storage = memoryStorage();
  class ObservedPostHog extends RealPostHog {
    constructor(token: string, options: Record<string, unknown>) {
      constructed.push({ token, ...options });
      // Only timing and storage differ from what the binding asked for.
      super(token, {
        ...options,
        flushAt: 1,
        flushInterval: 0,
        disableCompression: true,
        customStorage: storage,
      });
    }
  }
  (globalThis as { require?: unknown }).require = (name: string) => {
    switch (name) {
      case 'expo-constants':
        return { default: { expoConfig: { extra } } };
      case 'expo-application':
        return { nativeApplicationVersion: '2.0.9', nativeBuildVersion: '300' };
      case 'posthog-react-native':
        return { default: ObservedPostHog };
      case '@react-native-async-storage/async-storage':
        return { default: storage };
      case 'expo-location':
        return {
          getForegroundPermissionsAsync: async () => ({ status: 'granted' }),
          getBackgroundPermissionsAsync: async () => ({ status: 'denied' }),
        };
      default:
        throw new Error(`Unexpected require: ${name}`);
    }
  };
  const server = installFakeServer((request) =>
    request.url === CONFIG_URL
      ? {
          status: 200,
          body: { hasFeatureFlags: false, supportedCompression: [], ...remoteConfig },
        }
      : undefined,
  );
  caseNumber += 1;
  const binding = await import(
    `${pathToFileURL(join(here, '..', 'analytics.android.ts')).href}?case=${caseNumber}`
  );
  binding.startAnalytics();
  await tick(30);
  const signIn = async (user: NonNullable<Stubs['auth']['currentUser']> | null) => {
    authStub.currentUser = user;
    for (const listener of authStub.listeners) listener();
    await tick(30);
  };
  return { binding, constructed, server, signIn };
}

const betaEnv = () => ({ ...profileEnv('beta'), NEARSY_POSTHOG_TOKEN: FAKE_TOKEN });

describe('eas.json', () => {
  it('beta extends production and declares capture without the token', () => {
    const raw = readFileSync(join(appDir, 'eas.json'), 'utf8');
    const eas = JSON.parse(raw);
    assert.equal(eas.build.beta.extends, 'production');
    assert.equal(eas.submit.beta.android.track, 'internal');
    assert.equal(eas.build.beta.developmentClient, undefined);
    assert.deepEqual(profileEnv('beta'), {
      NEARSY_FIREBASE_ENV: 'production',
      NEARSY_DEV_CLIENT: 'false',
      NEARSY_ANALYTICS_BETA_ENABLED: 'true',
      NEARSY_ANALYTICS_DISTRIBUTION_CHANNEL: 'beta',
      NEARSY_ANALYTICS_ENV: 'production',
      NEARSY_ANALYTICS_ENABLED: 'false',
    });
    assert.ok(!raw.includes('NEARSY_POSTHOG_TOKEN'));
    assert.ok(!raw.includes('phc_'));
  });

  it('production keeps its behaviour', () => {
    const eas = JSON.parse(readFileSync(join(appDir, 'eas.json'), 'utf8'));
    assert.deepEqual(eas.build.production, {
      autoIncrement: true,
      environment: 'production',
      distribution: 'store',
      prebuildCommand: 'npx expo prebuild --platform android --clean',
      node: '22.23.4',
      env: { NEARSY_FIREBASE_ENV: 'production', NEARSY_DEV_CLIENT: 'false' },
      android: { buildType: 'app-bundle' },
    });
    assert.deepEqual(eas.submit.production, {
      android: { track: 'production', releaseStatus: 'draft' },
    });
  });
});

describe('beta build, from the profile to the wire', () => {
  it('the app config carries the declaration and the production Firebase', () => {
    const extra = extrasFor(betaEnv());
    assert.equal(extra.nearsyFirebaseEnv, 'production');
    assert.equal(extra.nearsyFirebaseProjectId, 'nearsy-pj');
    assert.equal(extra.nearsyDevClient, false);
    assert.deepEqual((extra.nearsyAnalytics as { beta: unknown }).beta, {
      enabled: true,
      environment: 'production',
      distributionChannel: 'beta',
      token: FAKE_TOKEN,
    });
    assert.equal((extra.nearsyAnalytics as { enabled: unknown }).enabled, false);
  });

  it('marks anonymous events and identifies with the real UID, unprefixed', async () => {
    const { binding, constructed, server, signIn } = await startBuild(extrasFor(betaEnv()));
    assert.equal(constructed.length, 1);
    assert.equal(constructed[0].token, FAKE_TOKEN);
    assert.equal(constructed[0].host, 'https://us.i.posthog.com');

    const anonymous = server.events().find((item) => item.event === 'app_opened');
    assert.ok(anonymous, 'the first open is sent before login');
    assert.notEqual(anonymous.distinct_id, REAL_UID);
    assert.equal(anonymous.properties.is_test_user, true);
    assert.equal(anonymous.properties.distribution_channel, 'beta');
    assert.equal(anonymous.properties.environment, 'production');
    assert.equal(anonymous.properties.platform, 'Android');
    assert.equal(anonymous.properties.app_version, '2.0.9');
    assert.equal(anonymous.properties.app_build, '300');
    assert.equal(anonymous.properties.tracking_plan_version, 'v1');
    assert.equal(anonymous.properties.$process_person_profile, false);

    await signIn({ uid: REAL_UID, email: 'person@example.test' });
    binding.trackSignupCompleted(REAL_UID);
    binding.trackMatchPresented(REAL_UID, 'peer-secret', 80, 'nearby_list');
    await tick(30);

    const events = server.events();
    const identify = events.find((item) => item.event === '$identify');
    assert.equal(identify?.distinct_id, REAL_UID);
    const signup = events.find((item) => item.event === 'signup_completed');
    assert.equal(signup?.distinct_id, REAL_UID);
    assert.equal(
      events.find((item) => item.properties.$set_once?.is_test_user === true)?.distinct_id,
      REAL_UID,
    );
    for (const item of events) {
      assert.equal(item.properties.is_test_user, true, item.event);
      assert.equal(item.properties.distribution_channel, 'beta', item.event);
    }
    const match = events.find((item) => item.event === 'match_made');
    assert.equal(match?.properties.match_score_range, 'high');
    assert.ok(!JSON.stringify(events).includes('peer-secret'));
  });

  it('asks for no flags, replay or surveys, even if the project has them on', async () => {
    const { binding, constructed, server, signIn } = await startBuild(extrasFor(betaEnv()), {
      hasFeatureFlags: true,
      surveys: [{ id: 's1' }],
      sessionRecording: { endpoint: '/s/' },
      errorTracking: { autocaptureExceptions: true },
    });
    const options = constructed[0];
    assert.equal(options.disableRemoteFeatureFlags, true);
    assert.equal(options.preloadFeatureFlags, false);
    assert.equal(options.enableSessionReplay, false);
    assert.equal(options.disableSurveys, true);
    assert.equal(options.captureAppLifecycleEvents, false);
    assert.equal(options.persistence, 'file');

    await signIn({ uid: REAL_UID });
    binding.syncAnalyticsPersonProfile(REAL_UID, { mode: 'personal' });
    await tick(30);
    assert.deepEqual([...new Set(server.paths())].sort(), [BATCH_URL, CONFIG_URL].sort());
    const allowed = new Set([
      '$identify',
      '$set',
      'app_opened',
      'foreground_location',
      'background_location',
    ]);
    for (const item of server.events()) assert.ok(allowed.has(item.event), item.event);
  });
});

describe('builds that must send nothing', () => {
  const cases: Array<[string, () => Record<string, string>]> = [
    ['no analytics variables', () => ({})],
    ['production profile, even with the token available', () => ({
      ...profileEnv('production'),
      NEARSY_POSTHOG_TOKEN: FAKE_TOKEN,
    })],
    ['beta and general capture together', () => ({
      ...betaEnv(),
      NEARSY_ANALYTICS_ENABLED: 'true',
    })],
    ['beta without the token', () => profileEnv('beta')],
    ['beta on a development Firebase', () => ({
      ...betaEnv(),
      NEARSY_FIREBASE_ENV: 'development',
    })],
  ];
  for (const [name, env] of cases) {
    it(name, async () => {
      const extra = extrasFor(env());
      if (name !== 'beta on a development Firebase') {
        assert.ok(!JSON.stringify(extra).includes('phc_'), 'no token in the app config');
      }
      const { binding, constructed, server, signIn } = await startBuild(extra);
      await signIn({ uid: REAL_UID });
      binding.trackSignupCompleted(REAL_UID);
      await tick(30);
      assert.deepEqual(constructed, []);
      assert.deepEqual(server.requests, []);
    });
  }
});

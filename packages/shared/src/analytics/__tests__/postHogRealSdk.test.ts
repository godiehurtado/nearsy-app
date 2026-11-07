/**
 * Runs the real posthog-react-native code in Node, through the Nearsy transport.
 * Native modules are stubbed and `fetch` is intercepted, so no request can leave
 * this process. This is not native QA: it says nothing about AsyncStorage, app
 * lifecycle or networking on a device.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import { gunzipSync } from 'node:zlib';

import { createAnalyticsClient } from '../client';
import { resolveAnalyticsConfig } from '../config';
import type { PostHogDeliveryOverrides } from '../postHogTransport.ios';
import type { AnalyticsLogger, AnalyticsTransport } from '../transport';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require('node:module') as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};

const memoryStorage = new Map<string, string>();
const asyncStorage = {
  getItem: async (key: string) => memoryStorage.get(key) ?? null,
  setItem: async (key: string, value: string) => {
    memoryStorage.set(key, value);
  },
  removeItem: async (key: string) => {
    memoryStorage.delete(key);
  },
};

const reactNativeStub = {
  AppState: {
    currentState: 'active',
    addEventListener: () => ({ remove: () => {} }),
  },
  Platform: { OS: 'ios', Version: '18.0', select: (o: { ios?: unknown }) => o.ios },
  Dimensions: { get: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }) },
  NativeModules: {},
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  Linking: { addEventListener: () => ({ remove: () => {} }), getInitialURL: async () => null },
  I18nManager: { isRTL: false },
  StyleSheet: { create: <T,>(s: T) => s, flatten: <T,>(s: T) => s, hairlineWidth: 1 },
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  Image: 'Image',
  TextInput: 'TextInput',
  TouchableOpacity: 'TouchableOpacity',
  Modal: 'Modal',
  Keyboard: { addListener: () => ({ remove: () => {} }) },
  Animated: { View: 'View', Value: class {}, timing: () => ({ start: () => {} }) },
  PanResponder: { create: () => ({ panHandlers: {} }) },
};

const NATIVE_STUBS: Record<string, unknown> = {
  'react-native': reactNativeStub,
  '@react-native-async-storage/async-storage': {
    __esModule: true,
    default: asyncStorage,
    ...asyncStorage,
  },
};

const originalLoad = Module._load;
const originalFetch = globalThis.fetch;

type Sent = { url: string; method: string; body: Record<string, any> | null };
let requests: Sent[] = [];
let respond: (url: string) => Promise<Response> | Response = () =>
  new Response('{"status":1}', { status: 200 });

function parseBody(init: RequestInit | undefined): Record<string, any> | null {
  const body = init?.body;
  if (!body) return null;
  const headers = (init?.headers ?? {}) as Record<string, string>;
  if (headers['Content-Encoding'] === 'gzip') {
    const raw =
      body instanceof Uint8Array
        ? Buffer.from(body)
        : Buffer.from(body as unknown as ArrayBuffer);
    return JSON.parse(gunzipSync(raw).toString('utf8'));
  }
  if (typeof body === 'string') return JSON.parse(body);
  return null;
}

async function parseAnyBody(init: RequestInit | undefined) {
  if (init?.body && typeof Blob !== 'undefined' && init.body instanceof Blob) {
    const bytes = new Uint8Array(await init.body.arrayBuffer());
    return parseBody({ ...init, body: bytes });
  }
  return parseBody(init);
}

const silentTimers: ReturnType<typeof setTimeout>[] = [];

before(() => {
  Module._load = function patched(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(NATIVE_STUBS, request)) {
      return NATIVE_STUBS[request];
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  (globalThis as { __DEV__?: boolean }).__DEV__ = false;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push({
      url,
      method: init?.method ?? 'GET',
      body: await parseAnyBody(init),
    });
    return respond(url);
  }) as typeof fetch;
});

after(() => {
  Module._load = originalLoad;
  globalThis.fetch = originalFetch;
  silentTimers.forEach(clearTimeout);
});

beforeEach(() => {
  requests = [];
  respond = () => new Response('{"status":1}', { status: 200 });
  memoryStorage.clear();
});

const FAST: PostHogDeliveryOverrides = {
  flushAt: 1000,
  flushInterval: 0,
  fetchRetryCount: 1,
  fetchRetryDelay: 1,
};

const config = resolveAnalyticsConfig({
  enabledFlag: 'true',
  distributionChannel: 'beta',
  token: 'phc_fake_token_for_tests',
  firebaseEnv: 'production',
});

const USER_A = { uid: 'uidA', email: 'a@example.com', creationTime: 'Mon, 02 Nov 2026 10:00:00 GMT' };
const USER_B = { uid: 'uidB', email: null, creationTime: 'Tue, 03 Nov 2026 10:00:00 GMT' };

async function makeTransport(
  logger: AnalyticsLogger = () => {},
  delivery: PostHogDeliveryOverrides = FAST,
): Promise<AnalyticsTransport> {
  const { createPostHogTransport } = await import('../postHogTransport.ios');
  const transport = await createPostHogTransport(config, logger, delivery);
  assert.ok(transport);
  return transport;
}

function makeClient(transport: AnalyticsTransport) {
  return createAnalyticsClient({
    config,
    createTransport: async () => transport,
    binary: () => ({ appVersion: '2.0.11', appBuild: '80' }),
  });
}

const batches = () => requests.filter((r) => r.url.includes('/batch'));
const sentEvents = () =>
  batches().flatMap((r) => (r.body?.batch ?? []) as Record<string, any>[]);

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

describe('real SDK: pinned assumptions', () => {
  it('runs the exact SDK versions this code was checked against', () => {
    // Neither package exports its package.json, so it is read next to the entry.
    const versionOf = (name: string): string => {
      let dir = dirname(require.resolve(name));
      while (!dir.endsWith(join('node_modules', ...name.split('/')))) dir = dirname(dir);
      return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version;
    };
    assert.equal(versionOf('posthog-react-native'), '4.85.3');
    assert.equal(versionOf('@posthog/core'), '1.64.1');
  });

  it('without the override the SDK does request remote config', async () => {
    const { PostHog } = require('posthog-react-native') as typeof import('posthog-react-native');
    const plain = new PostHog('phc_fake_token_for_tests', {
      host: config.host,
      persistence: 'file',
      customStorage: asyncStorage,
      captureAppLifecycleEvents: false,
      disableRemoteFeatureFlags: true,
      disableRemoteConfig: true,
      preloadFeatureFlags: false,
      disableSurveys: true,
      flushInterval: 0,
    });
    await plain.ready();
    await settle();
    assert.ok(
      requests.some((r) => r.url.includes('/config')),
      'If this fails the SDK now honors the option: remove the override.',
    );
  });
});

describe('real SDK: nothing leaves without an explicit flush', () => {
  it('start makes no request at all with the Nearsy transport', async () => {
    await makeTransport();
    await settle();
    assert.deepEqual(requests.map((r) => r.url), []);
  });

  it('every intercepted request goes only to the configured host', async () => {
    const transport = await makeTransport();
    const client = makeClient(transport);
    await client.start();
    client.reportAuthState(USER_A);
    client.captureDeviceEvent('app_opened', { open_type: 'cold_start' });
    await transport.flush();
    assert.ok(requests.length > 0);
    for (const request of requests) {
      assert.ok(request.url.startsWith('https://us.i.posthog.com/'), request.url);
    }
    assert.equal(requests.some((r) => r.url.includes('/flags')), false);
    assert.equal(requests.some((r) => r.url.includes('/config')), false);
  });
});

describe('real SDK: capture and identity', () => {
  it('sends identify, $set, $set_once, $unset and contract events on the wire', async () => {
    const transport = await makeTransport();
    const client = makeClient(transport);
    await client.start();
    client.reportAuthState(USER_A);
    client.captureForUser('uidA', 'visibility_changed', { enabled: true });
    client.setPersonProperties(
      'uidA',
      { profile_type: 'personal' },
      { signup_source: 'qr' },
      ['occupation'],
    );
    await transport.flush();

    const events = sentEvents();
    const identify = events.find((e) => e.event === '$identify');
    assert.ok(identify);
    assert.equal(identify.distinct_id, 'uidA');
    assert.equal(identify.properties.$set.user_id, 'uidA');
    assert.equal(identify.properties.$set.is_test_user, true);
    assert.equal(identify.properties.$set.distribution_channel, 'beta');
    assert.equal(identify.properties.$set_once.account_created_at, '2026-11-02T10:00:00.000Z');

    const capture = events.find((e) => e.event === 'visibility_changed');
    assert.equal(capture?.distinct_id, 'uidA');
    assert.equal(capture?.properties.enabled, true);
    assert.equal(capture?.properties.is_test_user, true);
    assert.equal(capture?.properties.environment, 'production');
    assert.equal(capture?.properties.$device_name, null);
    assert.equal(capture?.properties.$geoip_disable, true);

    const set = events.find(
      (e) => e.event === '$set' && e.properties.$set?.profile_type === 'personal',
    );
    assert.ok(set);
    assert.equal(set.properties.$set_once.signup_source, 'qr');
    const unset = events.find((e) => e.properties.$unset);
    assert.deepEqual(unset?.properties.$unset, ['occupation']);
  });

  it('anonymous events carry is_test_user before any login', async () => {
    const transport = await makeTransport();
    const client = makeClient(transport);
    await client.start();
    client.reportAuthState(null);
    client.captureDeviceEvent('app_opened', { open_type: 'cold_start' });
    await transport.flush();
    const [event] = sentEvents();
    assert.equal(event?.event, 'app_opened');
    assert.equal(event?.properties.is_test_user, true);
    assert.equal(event?.properties.distribution_channel, 'beta');
    assert.notEqual(event?.distinct_id, 'uidA');
  });

  it('before_send blocks events outside the contract', async () => {
    const codes: string[] = [];
    const { createPostHogTransport } = await import('../postHogTransport.ios');
    const transport = await createPostHogTransport(config, (code) => codes.push(code), FAST);
    assert.ok(transport);
    transport.capture('not_in_contract', {});
    await transport.flush();
    assert.equal(sentEvents().length, 0);
    assert.deepEqual(codes, ['sdk_event_blocked']);
  });

  it('A→B: each queued event keeps the identity it was captured under', async () => {
    const transport = await makeTransport();
    const client = makeClient(transport);
    await client.start();
    client.reportAuthState(USER_A);
    client.captureForUser('uidA', 'visibility_changed', { enabled: true });
    const sessionA = client.getSessionId();
    client.reportAuthState(USER_B);
    client.captureForUser('uidB', 'visibility_changed', { enabled: false });
    assert.notEqual(client.getSessionId(), sessionA);
    await transport.flush();
    const events = sentEvents().filter((e) => e.event === 'visibility_changed');
    assert.deepEqual(
      events.map((e) => [e.distinct_id, e.properties.enabled]),
      [
        ['uidA', true],
        ['uidB', false],
      ],
    );
  });

  it('restart with the same account does not re-link it, and keeps sending person data', async () => {
    const first = await makeTransport();
    const firstClient = makeClient(first);
    await firstClient.start();
    firstClient.reportAuthState(USER_A);
    await first.flush();
    await settle();
    requests = [];

    const second = await makeTransport();
    assert.equal(second.getIdentifiedId(), 'uidA');
    const secondClient = makeClient(second);
    await secondClient.start();
    secondClient.reportAuthState(USER_A);
    await second.flush();
    assert.equal(sentEvents().some((e) => e.event === '$identify'), false);
  });
});

describe('real SDK: session', () => {
  it('session id comes from the SDK and survives within the process', async () => {
    const transport = await makeTransport();
    const id = transport.getSessionId();
    assert.ok(id && id.length > 0);
    assert.equal(transport.getSessionId(), id);
  });

  it('reset starts a new session', async () => {
    const transport = await makeTransport();
    const id = transport.getSessionId();
    transport.reset();
    assert.notEqual(transport.getSessionId(), id);
  });
});

describe('real SDK: queue and retries', () => {
  it('reset does not empty the queue: events still go, under their own identity', async () => {
    const transport = await makeTransport();
    const client = makeClient(transport);
    await client.start();
    client.reportAuthState(USER_A);
    client.captureForUser('uidA', 'visibility_changed', { enabled: true });
    client.reportAuthState(null);
    assert.equal(transport.getIdentifiedId(), null);
    await transport.flush();
    assert.equal(
      sentEvents().find((e) => e.event === 'visibility_changed')?.distinct_id,
      'uidA',
    );
  });

  it('a network failure keeps the events for the next flush', async () => {
    const transport = await makeTransport();
    const client = makeClient(transport);
    await client.start();
    client.reportAuthState(USER_A);
    client.captureForUser('uidA', 'visibility_changed', { enabled: true });
    respond = () => {
      throw new TypeError('Network request failed');
    };
    await assert.rejects(Promise.resolve(transport.flush()));
    const attempts = batches().length;
    assert.equal(attempts, 2, 'one try plus one retry');
    requests = [];
    respond = () => new Response('{"status":1}', { status: 200 });
    await transport.flush();
    assert.ok(sentEvents().some((e) => e.event === 'visibility_changed'));
  });

  it('a server error is not hidden: it rejects, it is logged, and the batch is dropped', async () => {
    const codes: { code: string; name?: unknown }[] = [];
    const transport = await makeTransport((code, details) =>
      codes.push({ code, name: details?.name }),
    );
    const client = makeClient(transport);
    await client.start();
    client.reportAuthState(USER_A);
    client.captureForUser('uidA', 'visibility_changed', { enabled: true });
    respond = () => new Response('nope', { status: 400 });
    await assert.rejects(Promise.resolve(transport.flush()));
    assert.ok(codes.some((c) => c.code === 'sdk_error'));
    assert.equal(JSON.stringify(codes).includes('a@example.com'), false);
    requests = [];
    respond = () => new Response('{"status":1}', { status: 200 });
    await transport.flush();
    assert.equal(sentEvents().some((e) => e.event === 'visibility_changed'), false);
  });

  it('the queue survives a restart and is delivered by the next process', async () => {
    const first = await makeTransport();
    const client = makeClient(first);
    await client.start();
    client.reportAuthState(USER_A);
    client.captureForUser('uidA', 'visibility_changed', { enabled: true });
    await settle();
    await new Promise((resolve) => setTimeout(resolve, 700));
    const second = await makeTransport();
    await second.flush();
    assert.ok(sentEvents().some((e) => e.event === 'visibility_changed'));
  });
});

describe('real SDK: account deletion', () => {
  it('removes queued events of the deleted account and resets the identity', async () => {
    const transport = await makeTransport();
    const client = makeClient(transport);
    await client.start();
    client.reportAuthState(USER_A);
    client.captureForUser('uidA', 'visibility_changed', { enabled: true });
    client.discardAccount('uidA');
    assert.equal(transport.getIdentifiedId(), null);
    await transport.flush();
    assert.equal(JSON.stringify(sentEvents()).includes('uidA'), false);
  });

  it('events after deletion are not sent for it, nor attributed to the next account', async () => {
    const transport = await makeTransport();
    const client = makeClient(transport);
    await client.start();
    client.reportAuthState(USER_A);
    client.discardAccount('uidA');
    assert.equal(client.captureForUser('uidA', 'visibility_changed', { enabled: true }), false);
    client.reportAuthState(USER_A); // Firebase has not emitted the sign-out yet.
    client.captureForCurrentUser('visibility_changed', { enabled: true });
    client.reportAuthState(USER_B);
    client.captureForUser('uidB', 'visibility_changed', { enabled: false });
    await transport.flush();
    const events = sentEvents().filter((e) => e.event === 'visibility_changed');
    assert.deepEqual(events.map((e) => [e.distinct_id, e.properties.enabled]), [['uidB', false]]);
    assert.equal(JSON.stringify(sentEvents()).includes('uidA'), false);
  });

  it('keeps events queued for other identities', async () => {
    const transport = await makeTransport();
    const client = makeClient(transport);
    await client.start();
    client.reportAuthState(USER_B);
    client.captureForUser('uidB', 'visibility_changed', { enabled: true });
    client.reportAuthState(USER_A);
    client.captureForUser('uidA', 'visibility_changed', { enabled: false });
    client.discardAccount('uidA');
    await transport.flush();
    assert.deepEqual(
      sentEvents().filter((e) => e.event === 'visibility_changed').map((e) => e.distinct_id),
      ['uidB'],
    );
  });

  it('a discard stays durable: the next process does not send them', async () => {
    const first = await makeTransport();
    const client = makeClient(first);
    await client.start();
    client.reportAuthState(USER_A);
    client.captureForUser('uidA', 'visibility_changed', { enabled: true });
    client.discardAccount('uidA');
    await new Promise((resolve) => setTimeout(resolve, 700));
    const second = await makeTransport();
    await second.flush();
    assert.equal(JSON.stringify(sentEvents()).includes('uidA'), false);
  });

  it('a batch already on the wire cannot be recalled: this limit is documented', async () => {
    let release: (r: Response) => void = () => {};
    respond = () => new Promise<Response>((resolve) => (release = resolve));
    const transport = await makeTransport();
    const client = makeClient(transport);
    await client.start();
    client.reportAuthState(USER_A);
    client.captureForUser('uidA', 'visibility_changed', { enabled: true });
    const flushing = Promise.resolve(transport.flush());
    await settle();
    client.discardAccount('uidA');
    release(new Response('{"status":1}', { status: 200 }));
    await flushing;
    assert.ok(JSON.stringify(sentEvents()).includes('uidA'));
    requests = [];
    await transport.flush();
    assert.equal(sentEvents().length, 0, 'but nothing else follows it');
  });
});

afterEach(async () => {
  await settle();
});

/**
 * Loads the real posthog-react-native under Node with `react-native` stubbed, and
 * replaces global fetch with a scripted server. This proves SDK behaviour against
 * the transport, not device behaviour: no native module or Hermes is involved.
 */
import Module, { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const moduleInternals = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = moduleInternals._load;
const originalFetch = globalThis.fetch;

const reactNativeStub = {
  Platform: { OS: 'android', Version: 34, select: (o: Record<string, unknown>) => o.android ?? o.default },
  AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
  Dimensions: { get: () => ({ width: 360, height: 800, scale: 2, fontScale: 1 }) },
  Linking: {
    getInitialURL: async () => null,
    addEventListener: () => ({ remove() {} }),
  },
  NativeModules: {},
  StyleSheet: { create: (s: unknown) => s, hairlineWidth: 1 },
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  TurboModuleRegistry: { get: () => null, getEnforcing: () => ({}) },
  requireNativeComponent: () => 'Native',
  findNodeHandle: () => null,
  useWindowDimensions: () => ({ width: 360, height: 800 }),
};

export function loadRealPostHog(): unknown {
  (globalThis as { __DEV__?: boolean }).__DEV__ = false;
  moduleInternals._load = function load(request, parent, isMain) {
    if (request === 'react-native') return reactNativeStub;
    return originalLoad.call(this, request, parent, isMain);
  };
  return (require('posthog-react-native') as { default: unknown }).default;
}

export function restoreGlobals(): void {
  moduleInternals._load = originalLoad;
  globalThis.fetch = originalFetch;
}

export type RecordedRequest = {
  url: string;
  method: string | undefined;
  gzip: boolean;
  batch: Array<{
    event: string;
    uuid?: string;
    distinct_id?: string;
    properties: Record<string, any>;
  }>;
};

export type ServerAnswer = { status: number; body?: unknown } | Error;

/** Every request ends here. `answer` decides the response of each one. */
export function installFakeServer(
  answer: (request: RecordedRequest) => ServerAnswer | undefined = () => undefined,
) {
  const requests: RecordedRequest[] = [];
  globalThis.fetch = (async (url: string, options?: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  }) => {
    const gzip = options?.headers?.['Content-Encoding'] === 'gzip';
    let batch: RecordedRequest['batch'] = [];
    if (typeof options?.body === 'string') {
      batch = (JSON.parse(options.body) as { batch?: RecordedRequest['batch'] }).batch ?? [];
    }
    const request = { url: String(url), method: options?.method, gzip, batch };
    requests.push(request);
    const result = answer(request) ?? { status: 200, body: {} };
    if (result instanceof Error) throw result;
    return {
      status: result.status,
      headers: { get: () => null },
      text: async () => JSON.stringify(result.body ?? {}),
      json: async () => result.body ?? {},
    };
  }) as unknown as typeof fetch;
  return {
    requests,
    paths: () => requests.map((request) => request.url),
    batches: () => requests.filter((request) => request.url.endsWith('/batch/')),
    events: () =>
      requests
        .filter((request) => request.url.endsWith('/batch/'))
        .flatMap((request) => request.batch),
  };
}

/** Lets requests the SDK started without awaiting, such as remote config, finish. */
export function tick(ms = 5): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Manual flushes and no waiting between retries. */
export const FAST_SDK_OPTIONS = {
  flushAt: 100,
  flushInterval: 0,
  fetchRetryCount: 2,
  fetchRetryDelay: 1,
  disableCompression: true,
};

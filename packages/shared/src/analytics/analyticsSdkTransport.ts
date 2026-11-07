/**
 * Builds the transport on the real PostHog SDK class. Free of React Native and
 * Firebase imports, so the same code runs against the real SDK under Node.
 *
 * A subclass overrides `fetch`, the only method through which the SDK reaches the
 * network (`PostHogCoreStateless` calls `this.fetch`), in every mode:
 *
 * - Only event batches may leave. SDK 4.85.3 requests `/array/{token}/config` at
 *   startup and has no option to stop it, so that and any other path get a local
 *   empty answer.
 * - While intercepting, batches end in a callback too. The rest of the SDK runs
 *   for real: queueing, flush, identify, before_send, sessions.
 */
import { sanitizeOutgoingEvent } from './analyticsContract.ts';
import type { AnalyticsTransport } from './analyticsCore.ts';

type SdkFetchOptions = { method?: string; body?: unknown };

type SdkClient = {
  ready(): Promise<void>;
  getDistinctId(): string;
  getAnonymousId(): string;
  getSessionId(): string;
  identify(id: string, properties: unknown): void;
  setPersonProperties(set?: unknown, setOnce?: unknown): void;
  reset(): void;
  register(properties: unknown): void | Promise<void>;
  capture(event: string, properties?: unknown): void | Promise<void>;
  flush(): Promise<void>;
};

type SdkClass = new (token: string, options: Record<string, unknown>) => SdkClient;

export type InterceptedRequest = {
  path: string;
  events: Array<{ event: string; propertyKeys: string[]; personKeys: string[] }>;
};

/** Keeps names only: values never reach this record or the logs built from it. */
export function describeInterceptedRequest(
  url: string,
  options: SdkFetchOptions | undefined,
): InterceptedRequest {
  let path = url;
  try {
    path = new URL(url).pathname;
  } catch {
    // Keep the raw value; the host is the fixed intercept host anyway.
  }
  const events: InterceptedRequest['events'] = [];
  try {
    const body =
      typeof options?.body === 'string' ? JSON.parse(options.body) : undefined;
    for (const item of Array.isArray(body?.batch) ? body.batch : []) {
      const person = {
        ...item?.$set,
        ...item?.properties?.$set,
        ...item?.$set_once,
        ...item?.properties?.$set_once,
      };
      events.push({
        event: String(item?.event),
        propertyKeys: Object.keys(item?.properties ?? {}).filter(
          (key) => !key.startsWith('$'),
        ),
        personKeys: Object.keys(person),
      });
    }
  } catch {
    // A compressed or unexpected body is reported as a request without events.
  }
  return { path, events };
}

const LOCAL_RESPONSE = {
  status: 200,
  text: async () => '{}',
  json: async () => ({}),
};

export function isOutboundEventPath(url: string): boolean {
  try {
    return new URL(url).pathname === '/batch/';
  } catch {
    return false;
  }
}

function guardedSubclass(
  PostHog: SdkClass,
  onIntercepted?: (request: InterceptedRequest) => void,
): SdkClass {
  const Base = PostHog as unknown as new (
    token: string,
    options: Record<string, unknown>,
  ) => SdkClient & { fetch(url: string, options?: SdkFetchOptions): Promise<unknown> };
  return class GuardedPostHog extends Base {
    async fetch(url: string, options?: SdkFetchOptions) {
      if (onIntercepted) {
        try {
          onIntercepted(describeInterceptedRequest(url, options));
        } catch {
          // Observation must not change what the SDK sees.
        }
        return LOCAL_RESPONSE;
      }
      return isOutboundEventPath(url) ? super.fetch(url, options) : LOCAL_RESPONSE;
    }
  } as unknown as SdkClass;
}

export async function createSdkTransport(input: {
  PostHog: unknown;
  token: string;
  host: string;
  persistence: 'file' | 'memory';
  /** When set, nothing reaches the network: requests end in this callback. */
  onInterceptedRequest?: (request: InterceptedRequest) => void;
}): Promise<AnalyticsTransport & { flush(): Promise<void> }> {
  const Client = guardedSubclass(input.PostHog as SdkClass, input.onInterceptedRequest);
  const client = new Client(input.token, {
    host: input.host,
    persistence: input.persistence,
    captureAppLifecycleEvents: false,
    enableSessionReplay: false,
    errorTracking: { autocapture: false },
    preloadFeatureFlags: false,
    disableRemoteFeatureFlags: true,
    disableSurveys: true,
    disableGeoip: true,
    before_send: (event: { event?: unknown } | null) => sanitizeOutgoingEvent(event),
    // A readable body and prompt flushes, only while requests are intercepted.
    ...(input.onInterceptedRequest ? { disableCompression: true, flushAt: 1 } : {}),
  });
  await client.ready();
  return {
    getIdentifiedDistinctId: () => {
      const distinctId = client.getDistinctId();
      return distinctId && distinctId !== client.getAnonymousId()
        ? distinctId
        : null;
    },
    getSessionId: () => client.getSessionId() || undefined,
    identify: (id, properties) => client.identify(id, { $set: properties }),
    setPersonProperties: (properties, once) =>
      client.setPersonProperties(properties, once),
    reset: () => client.reset(),
    register: (properties) => client.register(properties),
    capture: (event, properties) => client.capture(event, properties),
    flush: () => client.flush(),
  };
}

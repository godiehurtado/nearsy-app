/**
 * Builds the transport on the real PostHog SDK class. Free of React Native and
 * Firebase imports, so the same code runs against the real SDK under Node.
 *
 * A subclass overrides `fetch`, the only method through which the SDK reaches the
 * network (`fetchWithRetry` calls `this.fetch`). What it does depends on the mode:
 *
 * - Sending (`beta`, `remote`): the real answer reaches the SDK, errors included,
 *   so its retries and queue keep working. Two requests are allowed: event batches,
 *   and the remote config the SDK always asks for at startup, which carries no
 *   person data and sets the compression the server accepts. Anything else is
 *   refused with an error, never answered with a fictitious success.
 * - Intercepting (`sdk_intercept`): nothing leaves, and answers are simulated.
 */
import {
  applyInstallClassification,
  sanitizeOutgoingEvent,
  type InstallClassification,
} from './analyticsContract.ts';
import type { AnalyticsTransport } from './analyticsCore.ts';

type SdkFetchOptions = { method?: string; body?: unknown };

type SdkClient = {
  ready(): Promise<void>;
  getDistinctId(): string;
  getAnonymousId(): string;
  getSessionId(): string;
  identify(id: string, properties: unknown): void;
  setPersonProperties(set?: unknown, setOnce?: unknown, reloadFeatureFlags?: boolean): void;
  unsetPersonProperties(names: string[], reloadFeatureFlags?: boolean): void;
  reset(): void;
  register(properties: unknown): void | Promise<void>;
  capture(event: string, properties?: unknown): void | Promise<void>;
  flush(): Promise<void>;
  getPersistedProperty(key: string): unknown;
  setPersistedProperty(key: string, value: unknown): void;
  flushStorage?(): Promise<void>;
};

/** The SDK's persisted event queue (PostHogPersistedProperty.Queue). */
const SDK_QUEUE_KEY = 'queue';

/** Decides, per distinct_id, whether a queued event may leave (see analyticsDeletionGuard). */
export type DeliveryGuard = {
  decide(distinctId: unknown): 'send' | 'drop' | 'defer';
  version(): number;
};

type SdkMessage = { distinct_id?: unknown } | undefined;

type SdkClass = new (token: string, options: Record<string, unknown>) => SdkClient;

export type InterceptedRequest = {
  path: string;
  events: Array<{
    event: string;
    propertyKeys: string[];
    personKeys: string[];
    unsetKeys?: string[];
  }>;
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
      const unset = item?.properties?.$unset;
      events.push({
        event: String(item?.event),
        propertyKeys: Object.keys(item?.properties ?? {}).filter(
          (key) => !key.startsWith('$'),
        ),
        personKeys: Object.keys(person),
        ...(Array.isArray(unset) ? { unsetKeys: unset.map(String) } : {}),
      });
    }
  } catch {
    // A compressed or unexpected body is reported as a request without events.
  }
  return { path, events };
}

/** Faults worth seeing, without URLs, tokens or payloads. */
export type TransportIssue =
  | { kind: 'batch_rejected'; status: number }
  | { kind: 'batch_network_error' }
  | { kind: 'config_failed'; status?: number }
  | { kind: 'request_blocked' };

type SdkRequestKind = 'batch' | 'config' | 'other';

/**
 * The SDK moves the US and EU config requests to an assets host. Exact host and
 * path are required, so a look-alike URL does not count as either request.
 */
export function classifySdkRequest(
  url: string,
  sender: { host: string; token: string },
): SdkRequestKind {
  let parsed: URL;
  let hostname: string;
  try {
    parsed = new URL(url);
    hostname = new URL(sender.host).hostname;
  } catch {
    return 'other';
  }
  if (parsed.hostname === hostname && parsed.pathname === '/batch/') return 'batch';
  const assets = hostname.replace(/^(us|eu)\.i\./, '$1-assets.i.');
  return (parsed.hostname === hostname || parsed.hostname === assets) &&
    parsed.pathname === `/array/${sender.token}/config`
    ? 'config'
    : 'other';
}

const SIMULATED_OK = {
  status: 200,
  text: async () => '{}',
  json: async () => ({}),
};

/** Only for `sdk_intercept`: the fields of a real answer that the SDK acts on. */
const SIMULATED_REMOTE_CONFIG = {
  status: 200,
  text: async () => '{"hasFeatureFlags":false,"supportedCompression":["gzip-js"]}',
  json: async () => ({ hasFeatureFlags: false, supportedCompression: ['gzip-js'] }),
};

function guardedSubclass(input: {
  PostHog: SdkClass;
  host: string;
  token: string;
  onInterceptedRequest?: (request: InterceptedRequest) => void;
  onTransportIssue?: (issue: TransportIssue) => void;
  deliveryGuard?: DeliveryGuard;
}): SdkClass {
  const Base = input.PostHog as unknown as new (
    token: string,
    options: Record<string, unknown>,
  ) => SdkClient & {
    fetch(url: string, options?: SdkFetchOptions): Promise<{ status: number }>;
    sendBatch(messages: SdkMessage[], retryOptions?: unknown, route?: unknown): Promise<void>;
  };
  const guard = input.deliveryGuard;
  /** The batch being sent: the SDK flushes one batch at a time. */
  let batchInFlight: { defer: boolean; version: number } | null = null;
  const report = (issue: TransportIssue) => {
    try {
      input.onTransportIssue?.(issue);
    } catch {
      // Observation must not change what the SDK sees.
    }
  };
  return class GuardedPostHog extends Base {
    /**
     * Every batch, including one loaded from disk after a restart, passes the
     * guard before it is built. Dropped events are left out; when nothing is left
     * the batch counts as handled and the SDK removes it from its queue. A held
     * event keeps the whole batch queued (see `fetch`).
     */
    async sendBatch(messages: SdkMessage[], retryOptions?: unknown, route?: unknown) {
      if (!guard) return super.sendBatch(messages, retryOptions, route);
      const decisions = messages.map((message) => guard.decide(message?.distinct_id));
      const defer = decisions.includes('defer');
      const kept = defer ? messages : messages.filter((_, index) => decisions[index] === 'send');
      if (!defer && kept.length === 0) return;
      batchInFlight = { defer, version: guard.version() };
      try {
        return await super.sendBatch(kept, retryOptions, route);
      } finally {
        batchInFlight = null;
      }
    }

    async fetch(url: string, options?: SdkFetchOptions) {
      const kind = classifySdkRequest(url, input);
      // A held batch, or one built before the guard changed (a retry of a request
      // that failed): refused locally. The SDK treats it as a network failure and
      // keeps the events, so the next flush decides again. A request that already
      // left cannot be recalled.
      if (
        kind === 'batch' &&
        guard &&
        batchInFlight &&
        (batchInFlight.defer || batchInFlight.version !== guard.version())
      ) {
        throw new Error('PostHog batch held by the deletion guard');
      }
      if (input.onInterceptedRequest) {
        try {
          input.onInterceptedRequest(describeInterceptedRequest(url, options));
        } catch {
          // Observation must not change what the SDK sees.
        }
        return kind === 'config' ? SIMULATED_REMOTE_CONFIG : SIMULATED_OK;
      }
      if (kind === 'other') {
        report({ kind: 'request_blocked' });
        throw new Error('PostHog request outside the analytics contract');
      }
      try {
        const response = await super.fetch(url, options);
        if (response.status < 200 || response.status >= 300) {
          report(
            kind === 'batch'
              ? { kind: 'batch_rejected', status: response.status }
              : { kind: 'config_failed', status: response.status },
          );
        }
        return response;
      } catch (error) {
        report(kind === 'batch' ? { kind: 'batch_network_error' } : { kind: 'config_failed' });
        throw error;
      }
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
  onTransportIssue?: (issue: TransportIssue) => void;
  /** Declared by a Beta build; stamped on every event of this install. */
  installClassification?: InstallClassification;
  /** Account deletion: events of a held or deleted account never leave. */
  deliveryGuard?: DeliveryGuard;
  /** Timing and storage overrides for tests. */
  sdkOptions?: Record<string, unknown>;
}): Promise<
  AnalyticsTransport & {
    flush(): Promise<void>;
    purgeQueued(distinctIds: string[]): Promise<number>;
  }
> {
  const Client = guardedSubclass({
    PostHog: input.PostHog as SdkClass,
    host: input.host,
    token: input.token,
    onInterceptedRequest: input.onInterceptedRequest,
    onTransportIssue: input.onTransportIssue,
    deliveryGuard: input.deliveryGuard,
  });
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
    // Both default to true, and the native side would send outside before_send.
    capturePushNotificationSubscriptions: false,
    capturePushNotificationOpened: false,
    // Only read by /flags, which is off.
    setDefaultPersonProperties: false,
    before_send: (event: { event?: unknown } | null) =>
      applyInstallClassification(sanitizeOutgoingEvent(event), input.installClassification),
    // A readable body and prompt flushes, only while requests are intercepted.
    ...(input.onInterceptedRequest ? { disableCompression: true, flushAt: 1 } : {}),
    ...input.sdkOptions,
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
      client.setPersonProperties(properties, once, false),
    unsetPersonProperties: (names) => client.unsetPersonProperties(names, false),
    reset: () => client.reset(),
    register: (properties) => client.register(properties),
    capture: (event, properties) => client.capture(event, properties),
    flush: () => client.flush(),
    purgeQueued: async (distinctIds) => {
      if (distinctIds.length === 0) return 0;
      const drop = new Set(distinctIds);
      const queue = client.getPersistedProperty(SDK_QUEUE_KEY);
      if (!Array.isArray(queue)) return 0;
      // A flush that is running removes what it sent by uuid against the stored
      // queue, so rewriting it here does not race with that removal.
      const next = queue.filter(
        (item: { message?: SdkMessage } | undefined) => !drop.has(item?.message?.distinct_id as string),
      );
      const removed = queue.length - next.length;
      if (removed > 0) {
        client.setPersistedProperty(SDK_QUEUE_KEY, next);
        await client.flushStorage?.();
      }
      return removed;
    },
  };
}

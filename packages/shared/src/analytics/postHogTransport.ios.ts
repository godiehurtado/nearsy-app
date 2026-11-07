/**
 * The only file that touches posthog-react-native. The SDK is required lazily
 * so a disabled build never constructs it, opens its storage or calls the network.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { AnalyticsConfig } from './config';
import { isAllowedOutgoingEvent } from './contract';
import type { AnalyticsLogger, AnalyticsTransport } from './transport';

type PostHogModule = typeof import('posthog-react-native');

/**
 * The SDK has two gaps and no supported option for either, so both live here.
 * posthog-react-native is pinned to an exact version and postHogRealSdk.test.ts
 * runs the real SDK to fail if an upgrade changes either assumption.
 */
function defineNearsyPostHog({ PostHog, PostHogPersistedProperty }: PostHogModule) {
  return class NearsyPostHog extends PostHog {
    /**
     * `disableRemoteConfig` is a declared no-op in this version: the SDK always
     * loads remote config at start. Returning undefined is the SDK's own "not
     * loaded" result, the same as a failed fetch. Only this config read is
     * affected: event delivery and its errors are untouched.
     */
    override reloadRemoteConfigAsync() {
      return Promise.resolve(undefined);
    }

    /** `reset` keeps the queue by design, and no public call removes from it. */
    discardQueuedEventsFor(distinctId: string): number {
      const key = PostHogPersistedProperty.Queue;
      const queue =
        this.getPersistedProperty<{ message?: { distinct_id?: unknown } }[]>(key) ??
        [];
      const kept = queue.filter((item) => item.message?.distinct_id !== distinctId);
      if (kept.length !== queue.length) this.setPersistedProperty(key, kept);
      return queue.length - kept.length;
    }
  };
}

/** Delivery timing only. Tests shorten it; the app uses the SDK defaults. */
export type PostHogDeliveryOverrides = {
  flushAt?: number;
  flushInterval?: number;
  fetchRetryCount?: number;
  fetchRetryDelay?: number;
};

export async function createPostHogTransport(
  config: AnalyticsConfig,
  logger: AnalyticsLogger,
  delivery: PostHogDeliveryOverrides = {},
): Promise<AnalyticsTransport | null> {
  if (!config.enabled || !config.token) return null;

  const NearsyPostHog = defineNearsyPostHog(
    require('posthog-react-native') as PostHogModule,
  );
  const client = new NearsyPostHog(config.token, {
    ...delivery,
    host: config.host,
    persistence: 'file',
    customStorage: AsyncStorage,
    captureAppLifecycleEvents: false,
    enableSessionReplay: false,
    disableRemoteFeatureFlags: true,
    disableRemoteConfig: true,
    preloadFeatureFlags: false,
    sendFeatureFlagEvent: false,
    disableSurveys: true,
    disableGeoip: true,
    setDefaultPersonProperties: false,
    capturePushNotificationSubscriptions: false,
    capturePushNotificationOpened: false,
    errorTracking: { autocapture: false },
    // A user-given device name can be personal text.
    customAppProperties: (properties) => ({
      ...properties,
      $device_name: null,
    }),
    before_send: (event) => {
      if (!event || !isAllowedOutgoingEvent(event.event)) {
        logger('sdk_event_blocked');
        return null;
      }
      return event;
    },
  });
  client.on('error', (error: unknown) => {
    // Ingestion failures stay visible, by name only.
    logger('sdk_error', { name: error instanceof Error ? error.name : 'unknown' });
  });
  await client.ready();

  return {
    capture: (event, properties) => {
      client.capture(event, { ...properties } as Record<string, never>);
    },
    identify: (uid, set, setOnce) => {
      client.identify(uid, {
        $set: { ...set },
        $set_once: { ...setOnce },
      } as Record<string, never>);
    },
    setPersonProperties: (set, setOnce) => {
      client.setPersonProperties(
        { ...set } as Record<string, never>,
        { ...setOnce } as Record<string, never>,
        false,
      );
    },
    unsetPersonProperties: (names) => {
      client.unsetPersonProperties([...names], false);
    },
    reset: () => {
      client.reset();
    },
    discardQueuedEventsFor: (distinctId) =>
      client.discardQueuedEventsFor(distinctId),
    getIdentifiedId: () => {
      const distinctId = client.getDistinctId();
      return distinctId && distinctId !== client.getAnonymousId()
        ? distinctId
        : null;
    },
    getSessionId: () => client.getSessionId() || null,
    flush: () => client.flush(),
  };
}

/**
 * The only file that touches posthog-react-native. The SDK is required lazily
 * so a disabled build never constructs it, opens its storage or calls the network.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { AnalyticsConfig } from './config';
import { isAllowedOutgoingEvent } from './contract';
import type { AnalyticsLogger, AnalyticsTransport } from './transport';

export async function createPostHogTransport(
  config: AnalyticsConfig,
  logger: AnalyticsLogger,
): Promise<AnalyticsTransport | null> {
  if (!config.enabled || !config.token) return null;

  const { PostHog } =
    require('posthog-react-native') as typeof import('posthog-react-native');
  // SDK 4.85.3 declares disableRemoteConfig but never reads it: every start would
  // fetch remote config. Nothing here uses it, so the call is replaced.
  class NearsyPostHog extends PostHog {
    override reloadRemoteConfigAsync() {
      return Promise.resolve(undefined);
    }
  }
  const client = new NearsyPostHog(config.token, {
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

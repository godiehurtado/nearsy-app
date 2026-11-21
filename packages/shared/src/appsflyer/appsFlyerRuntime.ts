/**
 * AppsFlyer/OneLink runtime (contract nc1). Platform-neutral and testable: the SDK,
 * build values and app callbacks are injected.
 *
 * Starts only when the build carries NEARSY_APPSFLYER_ENABLED=true and a dev key.
 * What it does NOT do, on purpose (C7):
 * - no setCustomerUserId (the Firebase UID never reaches AppsFlyer);
 * - no logEvent / in-app events / S2S (PostHog stays the product analytics);
 * - no conversion-data listener on iOS (without IDFA a deferred match is never
 *   deterministic, so it could only produce estimates);
 * - no ATT prompt, no IDFA (strict pod + setDisableAdvertisingIdentifiers);
 * - no clipboard reading; no handleOpenURL / continueUserActivity from JS
 *   (the native layer forwards OneLink universal links only).
 */
import type { CampaignAttribution } from '../analytics/attribution';
import { parseOneLinkResult, type OneLinkDestination } from './oneLinkContract';

/** The subset of react-native-appsflyer 7.0.4 Nearsy calls. */
export type AppsFlyerSdkPort = {
  registerDeepLinkListener(callbacks: { onDeepLinking?: (data: unknown) => void }): Promise<void>;
  init(params: { devKey: string; appId?: string | null }): Promise<void>;
  enableDebug(params: { enabled: boolean }): Promise<void>;
  setDisableAdvertisingIdentifiers(params: { disable: boolean }): Promise<void>;
  setDisableCollectASA(params: { disable: boolean }): Promise<void>;
  setDisableAppleAdsAttribution(params: { disable: boolean }): Promise<void>;
  setDisableSKAdNetwork(params: { disable: boolean }): Promise<void>;
  setShouldCollectDeviceName(params: { collect: boolean }): Promise<void>;
  setSharingFilterForPartners(params: { partners: string[] | null }): Promise<void>;
  registerSessionReadyListener(onReady: () => void): Promise<void>;
  start(params?: { awaitResponse?: boolean }): Promise<void>;
};

export type AppsFlyerRuntimeConfig = {
  enabled: boolean;
  devKey: string | null;
  appleAppId: string | null;
  debug: boolean;
};

export const EXTRA_KEYS = {
  enabled: 'NEARSY_APPSFLYER_ENABLED',
  devKey: 'NEARSY_APPSFLYER_DEV_KEY',
  appleAppId: 'NEARSY_APPSFLYER_APPLE_APP_ID',
} as const;

export function resolveAppsFlyerRuntimeConfig(
  extra: Record<string, unknown> | null | undefined,
  firebaseEnv: string | null | undefined,
): AppsFlyerRuntimeConfig {
  const read = (key: string) => {
    const value = extra?.[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  };
  const devKey = read(EXTRA_KEYS.devKey);
  const appleAppId = read(EXTRA_KEYS.appleAppId);
  const enabled =
    read(EXTRA_KEYS.enabled) === 'true' &&
    devKey !== null &&
    appleAppId !== null &&
    /^[0-9]{6,12}$/.test(appleAppId);
  return {
    enabled,
    devKey: enabled ? devKey : null,
    appleAppId: enabled ? appleAppId : null,
    // Debug logs only on nearsy-dev builds; they can include link parameters.
    debug: enabled && String(firebaseEnv ?? '').trim().toLowerCase() === 'development',
  };
}

export type AppsFlyerRuntimeDeps = {
  config: AppsFlyerRuntimeConfig;
  loadSdk: () => AppsFlyerSdkPort | null;
  now: () => number;
  currentUid: () => string | null;
  onAttribution: (attribution: CampaignAttribution) => void;
  onDestination: (input: { key: OneLinkDestination; deferred: boolean; uid: string | null }) => void;
  log?: (event: string) => void;
};

/** Returns false when it did not start (off, missing SDK, or already started). */
export function startAppsFlyerRuntime(deps: AppsFlyerRuntimeDeps): boolean {
  const { config, log = () => {} } = deps;
  if (!config.enabled || !config.devKey || !config.appleAppId) return false;
  const sdk = deps.loadSdk();
  if (!sdk) {
    log('appsflyer_sdk_missing');
    return false;
  }
  const ignore = () => {};

  // Before init (react-native-appsflyer 7.x): the SDK does not buffer a result
  // that arrives before a listener exists.
  void sdk
    .registerDeepLinkListener({
      onDeepLinking: (data) => {
        try {
          const touch = parseOneLinkResult(data, deps.now());
          if (!touch) return;
          if (touch.estimated) log('onelink_estimated_match_dropped');
          if (touch.attribution) deps.onAttribution(touch.attribution);
          if (touch.destination) {
            deps.onDestination({
              key: touch.destination,
              deferred: touch.isDeferred,
              uid: deps.currentUid(),
            });
          }
        } catch {
          // A malformed result never reaches the product.
        }
      },
    })
    .catch(ignore);

  void sdk.init({ devKey: config.devKey, appId: config.appleAppId }).catch(() => log('appsflyer_init_failed'));
  if (config.debug) void sdk.enableDebug({ enabled: true }).catch(ignore);

  // Privacy defaults (C7); the native RPC queue keeps them ahead of start().
  void sdk.setDisableAdvertisingIdentifiers({ disable: true }).catch(ignore);
  void sdk.setDisableCollectASA({ disable: true }).catch(ignore);
  void sdk.setDisableAppleAdsAttribution({ disable: true }).catch(ignore);
  void sdk.setDisableSKAdNetwork({ disable: true }).catch(ignore);
  void sdk.setShouldCollectDeviceName({ collect: false }).catch(ignore);
  void sdk.setSharingFilterForPartners({ partners: ['all'] }).catch(ignore);

  void sdk
    .registerSessionReadyListener(() => {
      void sdk.start().catch(() => log('appsflyer_start_failed'));
    })
    .catch(ignore);
  return true;
}

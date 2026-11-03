/**
 * Resolve iOS distribution channel for getAppUpdatePolicy.
 *
 * An EAS `production` / STORE profile build installed via TestFlight is NOT
 * distinguishable from App Store by bundle id alone. We only claim
 * `testflight` when an explicit channel signal exists; otherwise
 * `undetermined` — callers must NOT fall back to production policy (that
 * could open an older public listing for a Beta install).
 */

export type IosAppUpdateChannelResolution =
  | { kind: 'production' }
  | { kind: 'testflight' }
  | { kind: 'undetermined'; reason: string };

export type ChannelResolutionInput = {
  /** expo-constants expoConfig.extra.appUpdateChannel or eas.channel */
  explicitChannel?: string | null;
  /** expo-updates channel when available */
  updatesChannel?: string | null;
};

function normalize(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim().toLowerCase();
  return t.length > 0 ? t : null;
}

export function resolveIosAppUpdateChannel(
  input: ChannelResolutionInput,
): IosAppUpdateChannelResolution {
  const explicit = normalize(input.explicitChannel);
  if (explicit === 'testflight' || explicit === 'tf' || explicit === 'beta') {
    return { kind: 'testflight' };
  }
  if (
    explicit === 'production' ||
    explicit === 'store' ||
    explicit === 'appstore'
  ) {
    return { kind: 'production' };
  }

  const updates = normalize(input.updatesChannel);
  if (updates === 'testflight' || updates === 'preview' || updates === 'beta') {
    return { kind: 'testflight' };
  }
  if (updates === 'production' || updates === 'store') {
    return { kind: 'production' };
  }

  return {
    kind: 'undetermined',
    reason:
      'No reliable TestFlight vs App Store signal on this install (EAS production/STORE builds share the same binary shape).',
  };
}

/**
 * Facebook Login availability (ENH-AUTH-FB-01). app.config.js sets
 * `extra.facebookAuthConfigured` only when App ID + Client Token were valid
 * at build time; the native SDK must not be touched otherwise.
 */
export function resolveFacebookAuthConfigured(
  extras: { facebookAuthConfigured?: unknown } | null | undefined,
): boolean {
  return extras?.facebookAuthConfigured === true;
}

export function isNearsyFacebookAuthConfigured(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Constants =
      require('expo-constants').default ?? require('expo-constants');
    return resolveFacebookAuthConfigured(Constants.expoConfig?.extra);
  } catch {
    return false;
  }
}

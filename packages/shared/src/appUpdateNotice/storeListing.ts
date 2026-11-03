/** Official destinations allowlisted by Functions app-update policy v2. */

export const IOS_APP_STORE_LISTING_URL =
  'https://apps.apple.com/app/id6759302206' as const;

export const IOS_TESTFLIGHT_LISTING_URL =
  'https://beta.itunes.apple.com/v1/app/6759302206' as const;

const ALLOWED_PREFIXES = [
  'https://apps.apple.com/app/id6759302206',
  'https://beta.itunes.apple.com/v1/app/6759302206',
  'https://testflight.apple.com/',
] as const;

export function isOfficialIosStoreUrl(value: string): boolean {
  return value.trim() === IOS_APP_STORE_LISTING_URL;
}

/** Accept App Store + TestFlight destinations from the server allowlist. */
export function isAllowlistedIosUpdateUrl(value: string): boolean {
  const url = value.trim();
  if (!url) return false;
  if (url === IOS_APP_STORE_LISTING_URL) return true;
  if (url === IOS_TESTFLIGHT_LISTING_URL) return true;
  return ALLOWED_PREFIXES.some(
    (prefix) => url === prefix || url.startsWith(prefix),
  );
}

export function isPublicAppStoreUrl(value: string): boolean {
  return value.trim().startsWith('https://apps.apple.com/');
}

export function isTestFlightUpdateUrl(value: string): boolean {
  const url = value.trim();
  return (
    url.startsWith('https://beta.itunes.apple.com/') ||
    url.startsWith('https://testflight.apple.com/')
  );
}

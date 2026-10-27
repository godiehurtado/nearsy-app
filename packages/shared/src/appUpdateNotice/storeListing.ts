/** Official App Store listing for Nearsy (`com.nearsy.app.client`). */
export const IOS_APP_STORE_LISTING_URL =
  'https://apps.apple.com/app/id6759302206' as const;

export function isOfficialIosStoreUrl(value: string): boolean {
  return value.trim() === IOS_APP_STORE_LISTING_URL;
}

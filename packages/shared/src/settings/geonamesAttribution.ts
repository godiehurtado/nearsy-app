/**
 * GeoNames attribution (CC BY 4.0) for current-city data, shown in Settings.
 * Opens the system browser through the same HTTPS-only path as public social
 * links: no `canOpenURL`, no embedded browser, no tracking, never logs.
 */

import { isAllowedDiscoverySocialHttpsUrl } from '../visibility/discoverySocialLinks';

export const GEONAMES_ATTRIBUTION_URL = 'https://www.geonames.org';

export type HttpsLinkOpener = {
  openURL: (url: string) => Promise<unknown>;
};

export async function openGeoNamesAttribution(
  opener: HttpsLinkOpener,
): Promise<'opened' | 'failed'> {
  if (!isAllowedDiscoverySocialHttpsUrl(GEONAMES_ATTRIBUTION_URL)) {
    return 'failed';
  }
  try {
    await opener.openURL(GEONAMES_ATTRIBUTION_URL);
    return 'opened';
  } catch {
    return 'failed';
  }
}

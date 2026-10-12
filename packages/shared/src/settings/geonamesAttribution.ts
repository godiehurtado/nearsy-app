/**
 * GeoNames attribution (CC BY 4.0) for current-city data, shown in More > About.
 * Opens only the fixed GeoNames HTTPS URL through the system handler: no
 * `canOpenURL`, no embedded browser, no tracking parameters, never logs.
 */

export const GEONAMES_ATTRIBUTION_URL = 'https://www.geonames.org';
const GEONAMES_HOST = 'www.geonames.org';

export type HttpsLinkOpener = {
  openURL: (url: string) => Promise<unknown>;
};

export type GeoNamesOpenResult = 'opened' | 'failed';

export function isGeoNamesAttributionUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname === GEONAMES_HOST &&
      !parsed.username &&
      !parsed.password &&
      !parsed.port &&
      !parsed.search &&
      !parsed.hash
    );
  } catch {
    return false;
  }
}

export async function openGeoNamesAttribution(
  opener: HttpsLinkOpener,
): Promise<GeoNamesOpenResult> {
  if (!isGeoNamesAttributionUrl(GEONAMES_ATTRIBUTION_URL)) return 'failed';
  try {
    await opener.openURL(GEONAMES_ATTRIBUTION_URL);
    return 'opened';
  } catch {
    return 'failed';
  }
}

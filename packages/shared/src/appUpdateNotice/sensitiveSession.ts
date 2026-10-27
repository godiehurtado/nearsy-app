/**
 * Suppress the optional update modal during OAuth, ownership returns,
 * permission journeys, and inactive→active (in-app auth / system dialogs).
 */

const SENSITIVE_URL_PATTERN =
  /linkedin-auth|youtube-ownership|tiktok-ownership|x-ownership|instagram\.com\/oauth/i;

export function isSensitiveUpdateNoticeUrl(
  url: string | null | undefined,
): boolean {
  if (!url || typeof url !== 'string') return false;
  return SENSITIVE_URL_PATTERN.test(url);
}

/** True foreground resume — not an in-app auth overlay. */
export function shouldConsultOnAppStateChange(
  from: string | null | undefined,
  to: string | null | undefined,
): boolean {
  return from === 'background' && to === 'active';
}

export function shouldSuppressUpdateNoticeModal(input: {
  inboundUrl?: string | null;
  linkedInBusy?: boolean;
  locationJourneyActive?: boolean;
}): boolean {
  if (input.linkedInBusy) return true;
  if (input.locationJourneyActive) return true;
  if (isSensitiveUpdateNoticeUrl(input.inboundUrl)) return true;
  return false;
}

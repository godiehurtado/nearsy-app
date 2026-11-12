/**
 * Alerts row copy helpers — presentation only; no data fetching.
 */
import type { AlertItem } from '../hooks/nearbyAlertsMapping';
import { resolveInterestChips } from '../visibility/interestDisplay';
import { industryLang, industryShortLabel } from '../industries/industryCatalog.ts';

export const NOTIFICATION_AVATAR_SIZE = 38;

type Translate = (key: string, options?: Record<string, unknown>) => string;

type TranslateItem = (nameKey: string, fallback: string) => string;

export function formatAlertRelativeTime(
  atMs: number,
  nowMs: number,
  t: Translate,
): string {
  const diffMinutes = Math.max(1, Math.round((nowMs - atMs) / 60000));
  if (diffMinutes < 60) {
    return t('notifications.time.minutes', { count: diffMinutes });
  }
  const hours = Math.round(diffMinutes / 60);
  return t('notifications.time.hours', { count: hours });
}

/** Longest affiliation name shown in a row, in characters (not UTF-16 units). */
export const ALERT_AFFILIATION_NAME_MAX = 40;

/** Keeps a long name from pushing the person's name out of a 2-line row. */
export function shortenAffiliationName(name: string): string {
  const chars = Array.from(name.trim());
  return chars.length <= ALERT_AFFILIATION_NAME_MAX
    ? chars.join('')
    : `${chars.slice(0, ALERT_AFFILIATION_NAME_MAX - 1).join('').trimEnd()}…`;
}

export function buildAlertRowMessage(
  alert: AlertItem,
  t: Translate,
  translateItem: TranslateItem,
  language?: string,
): string {
  // Industry beats every other motive, as in the push (contract §3).
  if (alert.sharedIndustry) {
    const industry = industryShortLabel(
      alert.sharedIndustry.id,
      industryLang(language),
      alert.sharedIndustry.name,
    );
    if (industry) {
      return t('notifications.messages.industryNearby', { name: alert.name, industry });
    }
  }
  // Then an affiliation match, as in the push.
  if (alert.sharesAffiliation) {
    const first = alert.sharedAffiliationNames?.[0];
    if (!first) {
      return t('notifications.messages.affiliationNearby', { name: alert.name });
    }
    const affiliation = shortenAffiliationName(first);
    const total = Math.max(
      alert.sharedAffiliationCount ?? 0,
      alert.sharedAffiliationNames?.length ?? 0,
    );
    return total > 1
      ? t('notifications.messages.affiliationNearbyNamedMore', {
          name: alert.name,
          affiliation,
          count: total - 1,
        })
      : t('notifications.messages.affiliationNearbyNamed', {
          name: alert.name,
          affiliation,
        });
  }
  const sharedIds = alert.sharedInterests ?? [];
  if (sharedIds.length > 0) {
    const labels = resolveInterestChips(sharedIds.slice(0, 2), translateItem).map(
      (chip) => chip.label,
    );
    const interestsSuffix =
      labels.length > 0
        ? t('notifications.messages.interestsSuffix', {
            interests: labels.join(', '),
          })
        : '';
    return t('notifications.messages.interestNearby', {
      name: alert.name,
      interests: interestsSuffix,
    });
  }

  return t('notifications.messages.nearbyOnly', { name: alert.name });
}

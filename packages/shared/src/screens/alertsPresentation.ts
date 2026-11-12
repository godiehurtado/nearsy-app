/**
 * Alerts row copy helpers — presentation only; no data fetching.
 */
import type { AlertItem } from '../hooks/useNearbyAlerts';
import { resolveInterestChips } from '../visibility/interestDisplay';
import { industryShortLabel, type IndustryLocale } from '../industries/catalog';

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

export function buildAlertRowMessage(
  alert: AlertItem,
  t: Translate,
  translateItem: TranslateItem,
  locale: IndustryLocale = 'en',
): string {
  // Industry first (Product priority). The label comes from the bundled catalog
  // by id; the server's English name is only a fallback for unknown ids.
  if (alert.sharedIndustry) {
    const industry = industryShortLabel(
      alert.sharedIndustry.id,
      locale,
      alert.sharedIndustry.name,
    );
    if (industry) {
      return t('notifications.messages.industryNearby', { name: alert.name, industry });
    }
  }
  // Then affiliations. The affiliation names go on their own line
  // (buildAlertAffiliationDetail) so a long name never hides the person.
  if (alert.sharedAffiliations) {
    return alert.sharedAffiliationNames?.length && alert.sharedAffiliationTotal === 1
      ? t('notifications.messages.affiliationNearbyOne', { name: alert.name })
      : t('notifications.messages.affiliationNearby', { name: alert.name });
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

export type AlertAffiliationDetail = {
  /** First server-resolved name; the UI may truncate it to one line. */
  name: string;
  /** "and 2 more" / "y 2 más"; never truncated. Absent when only one. */
  more?: string;
};

/** The shared affiliation line, or null when the server sent no valid names. */
export function buildAlertAffiliationDetail(
  alert: AlertItem,
  t: Translate,
): AlertAffiliationDetail | null {
  const names = alert.sharedAffiliationNames;
  // One motive per row: an Industry row shows no affiliation line.
  if (alert.sharedIndustry) return null;
  if (!alert.sharedAffiliations || !names?.length) return null;
  // Contract §3a: N = sharedAffiliationCount − 1 (names never outnumber it).
  const others = Math.max(alert.sharedAffiliationTotal ?? names.length, names.length) - 1;
  return others > 0
    ? { name: names[0], more: t('notifications.messages.affiliationMore', { count: others }) }
    : { name: names[0] };
}

/** Full text for VoiceOver: the message plus the untruncated affiliation line. */
export function buildAlertAccessibilityLabel(
  message: string,
  detail: AlertAffiliationDetail | null,
): string {
  if (!detail) return message;
  return [message, [detail.name, detail.more].filter(Boolean).join(' ')].join(' ');
}

export function formatAlertDistance(
  distanceFt: number | undefined,
  t: Translate,
): string | null {
  if (typeof distanceFt !== 'number' || !Number.isFinite(distanceFt)) {
    return null;
  }
  return t('notifications.distance', { count: Math.round(distanceFt) });
}

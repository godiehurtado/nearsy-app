/**
 * Alerts row copy helpers — presentation only; no data fetching.
 */
import type { AlertItem } from '../hooks/useNearbyAlerts';
import { resolveInterestChips } from '../visibility/interestDisplay';

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
): string {
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

export function formatAlertDistance(
  distanceFt: number | undefined,
  t: Translate,
): string | null {
  if (typeof distanceFt !== 'number' || !Number.isFinite(distanceFt)) {
    return null;
  }
  return t('notifications.distance', { count: Math.round(distanceFt) });
}

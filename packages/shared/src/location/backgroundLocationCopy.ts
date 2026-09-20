import type { TFunction } from 'i18next';

export function backgroundLocationNotificationCopy(t: TFunction): {
  notificationTitle: string;
  notificationBody: string;
} {
  return {
    notificationTitle: t('settings.backgroundVisibility.fgsNotificationTitle'),
    notificationBody: t('settings.backgroundVisibility.fgsNotificationBody'),
  };
}

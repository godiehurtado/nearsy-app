import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from '../i18n';
import { getVisibilityDiscoveryClient } from '../visibility/iosVisibilityFoundation';
import type { CurrentCity } from './currentCity';
import {
  createSingleFlight,
  syncDiscoveryContextSafely,
} from './ownProfileSaveFlow';
import { syncDiscoveryProfileContextAfterSave } from './syncDiscoveryProfileContext';

/**
 * Own Profile save plumbing: a single-flight guard shared by save and retry, an
 * unmount flag (focus is tracked separately by the screen), the Discovery
 * context sync, and a Retry prompt that re-runs only the sync, never the write.
 */
export function useDiscoveryContextSyncRetry() {
  const { t } = useTranslation();
  const flightRef = useRef(createSingleFlight());
  const aliveRef = useRef(true);
  useEffect(
    () => () => {
      aliveRef.current = false;
    },
    [],
  );

  const syncNow = async () =>
    syncDiscoveryProfileContextAfterSave(await getVisibilityDiscoveryClient());

  const offerRetry = (expectedCity: CurrentCity | null) => {
    Alert.alert(t('profile.context.syncRetryBody'), undefined, [
      { text: t('profile.context.syncDismiss'), style: 'cancel' },
      {
        text: t('profile.context.syncRetry'),
        onPress: () => {
          void flightRef.current.run(async () => {
            const status = await syncDiscoveryContextSafely(syncNow, expectedCity);
            if (status === 'failed' && aliveRef.current) offerRetry(expectedCity);
          });
        },
      },
    ]);
  };

  return { flightRef, aliveRef, syncNow, offerRetry };
}

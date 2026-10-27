import React, { useEffect, useRef } from 'react';
import { Alert, AppState, Linking, Platform } from 'react-native';
import Constants from 'expo-constants';

import { getLinkedInA3OrchestratorBusy } from '../authentication/linkedinA3/orchestrator';
import { useTranslation } from '../i18n';
import { isLocationPermissionJourneyActive } from '../visibility/locationPermissionJourney';
import { createAsyncStorageSnoozeStore } from './asyncStorageSnooze';
import { createAppUpdateNoticeController } from './controller';
import { loadAppUpdateNoticeFromFunctions } from './iosAppUpdateNoticeFoundation';
import { readInstalledNativeVersionFromConstants } from './nativeVersion';
import {
  isSensitiveUpdateNoticeUrl,
  shouldSuppressUpdateNoticeModal,
} from './sensitiveSession';
import { isOfficialIosStoreUrl } from './storeListing';

const snoozeStore = createAsyncStorageSnoozeStore();

export function AppUpdateNoticeHost() {
  const { t } = useTranslation();
  const inboundUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'ios') return undefined;

    const appStateRef = { current: AppState.currentState };

    const controller = createAppUpdateNoticeController({
      nowMs: () => Date.now(),
      platform: 'ios',
      readInstalledNativeVersion: () =>
        readInstalledNativeVersionFromConstants(Constants),
      loadNotice: loadAppUpdateNoticeFromFunctions,
      snoozeStore,
      isSensitiveSession: () =>
        shouldSuppressUpdateNoticeModal({
          inboundUrl: inboundUrlRef.current,
          linkedInBusy: getLinkedInA3OrchestratorBusy(),
          locationJourneyActive: isLocationPermissionJourneyActive(),
        }),
      present: (latestVersion) =>
        new Promise((resolve) => {
          Alert.alert(
            t('appUpdateNotice.title'),
            t('appUpdateNotice.message'),
            [
              {
                text: t('appUpdateNotice.later'),
                style: 'cancel',
                onPress: () => resolve('later'),
              },
              {
                text: t('appUpdateNotice.update'),
                onPress: () => resolve('update'),
              },
            ],
            { cancelable: false },
          );
          void latestVersion;
        }),
      openStoreListing: (storeUrl) => {
        if (!isOfficialIosStoreUrl(storeUrl)) return;
        void Linking.openURL(storeUrl).catch(() => {});
      },
    });

    function rememberUrl(url: string | null) {
      if (url && isSensitiveUpdateNoticeUrl(url)) {
        inboundUrlRef.current = url;
      }
    }

    void Linking.getInitialURL()
      .then((url) => {
        rememberUrl(url);
      })
      .catch(() => {});

    const linkingSub = Linking.addEventListener('url', ({ url }) => {
      rememberUrl(url);
    });

    void controller.consult('open');

    const appSub = AppState.addEventListener('change', (next) => {
      const from = appStateRef.current;
      appStateRef.current = next;
      controller.onAppStateChange(from, next);
      if (next === 'active') {
        queueMicrotask(() => {
          inboundUrlRef.current = null;
        });
      }
    });

    return () => {
      linkingSub.remove();
      appSub.remove();
    };
  }, [t]);

  return null;
}

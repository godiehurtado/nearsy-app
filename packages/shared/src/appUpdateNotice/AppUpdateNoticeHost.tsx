import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Constants from 'expo-constants';

import { getLinkedInA3OrchestratorBusy } from '../authentication/linkedinA3/orchestrator';
import { useTranslation } from '../i18n';
import { useAppTheme } from '../theme';
import { fontSize, fontWeight } from '../theme/typography';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { isLocationPermissionJourneyActive } from '../visibility/locationPermissionJourney';
import { createAsyncStorageSnoozeStore } from './asyncStorageSnooze';
import { resolveIosAppUpdateChannel } from './channel';
import {
  createAppUpdateNoticeController,
  type AppUpdateNoticePresentChoice,
  type AppUpdateNoticePresentation,
} from './controller';
import { loadAppUpdateNoticeFromFunctions } from './iosAppUpdateNoticeFoundation';
import { readInstalledNativeReleaseFromConstants } from './nativeVersion';
import {
  isSensitiveUpdateNoticeUrl,
  shouldSuppressUpdateNoticeModal,
} from './sensitiveSession';
import { isAllowlistedIosUpdateUrl } from './storeListing';

const snoozeStore = createAsyncStorageSnoozeStore();

function readExplicitChannelFromConstants(): string | null {
  const extra =
    (Constants.expoConfig?.extra as Record<string, unknown> | undefined) ??
    {};
  const direct = extra.appUpdateChannel;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const eas = extra.eas as { channel?: unknown } | undefined;
  if (typeof eas?.channel === 'string' && eas.channel.trim()) {
    return eas.channel.trim();
  }
  return null;
}

function readUpdatesChannel(): string | null {
  try {
    // Optional — not all installs ship expo-updates; never throw.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Updates = require('expo-updates') as {
      channel?: string | null;
    };
    if (typeof Updates.channel === 'string' && Updates.channel.trim()) {
      return Updates.channel.trim();
    }
  } catch {
    /* optional */
  }
  return null;
}

export function AppUpdateNoticeHost() {
  const { t } = useTranslation();
  const { palette } = useAppTheme();
  const inboundUrlRef = useRef<string | null>(null);
  const forceResolveRef = useRef<
    ((choice: AppUpdateNoticePresentChoice) => void) | null
  >(null);
  const [forcePresentation, setForcePresentation] =
    useState<Extract<AppUpdateNoticePresentation, { kind: 'force' }> | null>(
      null,
    );

  useEffect(() => {
    if (Platform.OS !== 'ios') return undefined;

    const appStateRef = { current: AppState.currentState };

    const controller = createAppUpdateNoticeController({
      nowMs: () => Date.now(),
      platform: 'ios',
      resolveChannel: () =>
        resolveIosAppUpdateChannel({
          explicitChannel: readExplicitChannelFromConstants(),
          updatesChannel: readUpdatesChannel(),
        }),
      readInstalledRelease: () =>
        readInstalledNativeReleaseFromConstants({
          nativeAppVersion: Constants.nativeAppVersion,
          nativeBuildVersion: Constants.nativeBuildVersion,
        }),
      loadNotice: loadAppUpdateNoticeFromFunctions,
      snoozeStore,
      isSensitiveSession: () =>
        shouldSuppressUpdateNoticeModal({
          inboundUrl: inboundUrlRef.current,
          linkedInBusy: getLinkedInA3OrchestratorBusy(),
          locationJourneyActive: isLocationPermissionJourneyActive(),
        }),
      present: (presentation) =>
        new Promise((resolve) => {
          if (presentation.kind === 'force') {
            forceResolveRef.current = resolve;
            setForcePresentation(presentation);
            return;
          }
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
        }),
      dismissForce: () => {
        const resolve = forceResolveRef.current;
        forceResolveRef.current = null;
        setForcePresentation(null);
        resolve?.('dismissed');
      },
      openStoreListing: (storeUrl) => {
        if (!isAllowlistedIosUpdateUrl(storeUrl)) return;
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
      forceResolveRef.current = null;
      setForcePresentation(null);
    };
  }, [t]);

  function completeForce(choice: AppUpdateNoticePresentChoice) {
    const resolve = forceResolveRef.current;
    forceResolveRef.current = null;
    setForcePresentation(null);
    resolve?.(choice);
  }

  return (
    <Modal
      visible={forcePresentation != null}
      animationType="fade"
      transparent
      onRequestClose={() => {
        /* Force stays until Update or policy dismissForce. */
      }}
    >
      <View style={styles.forceOverlay} accessibilityViewIsModal>
        <View
          style={[styles.forceCard, { backgroundColor: palette.surface }]}
        >
          <Text
            style={[styles.forceTitle, { color: palette.textPrimary }]}
            accessibilityRole="header"
          >
            {t('appUpdateNotice.forceTitle', {
              defaultValue: t('appUpdateNotice.title'),
            })}
          </Text>
          <Text style={[styles.forceBody, { color: palette.textSecondary }]}>
            {t('appUpdateNotice.forceMessage', {
              defaultValue: t('appUpdateNotice.message'),
            })}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('appUpdateNotice.update')}
            onPress={() => completeForce('update')}
            style={({ pressed }) => [
              styles.forceBtn,
              { backgroundColor: palette.primary },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.forceBtnText, { color: palette.surface }]}>
              {t('appUpdateNotice.update')}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  forceOverlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  forceCard: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  forceTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  forceBody: {
    fontSize: fontSize.md,
  },
  forceBtn: {
    marginTop: spacing.sm,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  forceBtnText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  pressed: {
    opacity: 0.85,
  },
});

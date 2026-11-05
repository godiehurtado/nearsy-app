/**
 * Android Play update notice host (contract v2). Consults on cold start and
 * foreground, re-checks no sooner than the server `cacheTtlSeconds`. The soft
 * notice never blocks navigation, OAuth, or permissions; the mandatory surface
 * exists only while a validated `forceEnabled` + full `minimum` policy is within
 * its TTL and is removed (fail open) the moment it stops being valid.
 * Production policy stays server-side (all flags default off).
 */

import { useEffect, useState } from 'react';
import { Alert, AppState, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { i18n } from '../i18n';
import type { AppUpdateHostState } from './appUpdateHost.ts';
import {
  fetchAppUpdatePolicy,
  readNativeAppUpdateChannel,
  readNativeInstalledRelease,
} from './appUpdate';
import { allowlistedAndroidUpdateUrl } from './parsePolicy.ts';
import {
  createAppUpdateNoticeSession,
  type AppUpdateCopy,
} from './noticeSession.ts';
import {
  readAppUpdatePostpone,
  writeAppUpdatePostpone,
} from './postponeStore.ts';

function copy(channel: 'production' | 'playInternal'): AppUpdateCopy {
  const internal = channel === 'playInternal';
  return {
    soft: {
      title: i18n.t('appUpdate.title'),
      message: i18n.t(
        internal ? 'appUpdate.messageInternal' : 'appUpdate.message',
      ),
      update: i18n.t('appUpdate.update'),
      later: i18n.t('appUpdate.later'),
    },
    mandatory: {
      title: i18n.t('appUpdate.mandatoryTitle'),
      message: i18n.t(
        internal
          ? 'appUpdate.mandatoryMessageInternal'
          : 'appUpdate.mandatoryMessage',
      ),
      update: i18n.t('appUpdate.update'),
    },
  };
}

export function useAppUpdateNotice(): AppUpdateHostState {
  const [mandatory, setMandatory] =
    useState<AppUpdateHostState['mandatory']>(null);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const channel = readNativeAppUpdateChannel();
    const session = createAppUpdateNoticeSession({
      channel,
      now: () => Date.now(),
      fetchPolicy: fetchAppUpdatePolicy,
      getInstalledRelease: readNativeInstalledRelease,
      readPostpone: () => readAppUpdatePostpone(AsyncStorage),
      writePostpone: (entry) => writeAppUpdatePostpone(AsyncStorage, entry),
      getCopy: copy,
      isAppActive: () => AppState.currentState === 'active',
      delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      openUpdateUrl: (url) => {
        // Defense in depth: the session already validated, validate again.
        if (!channel || !allowlistedAndroidUpdateUrl(url, channel)) return;
        void Linking.openURL(url).catch(() => {});
      },
      presentNotice: ({ copy: text, onUpdate, onLater }) => {
        Alert.alert(
          text.title,
          text.message,
          [
            { text: text.later, style: 'cancel', onPress: onLater },
            { text: text.update, onPress: onUpdate },
          ],
          { cancelable: true, onDismiss: onLater },
        );
      },
      presentMandatory: ({ copy: text, onUpdate }) => {
        setMandatory({ copy: text, onUpdate });
      },
      dismissMandatory: () => setMandatory(null),
    });

    void session.consult('start');
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void session.consult('foreground');
    });

    return () => {
      sub.remove();
      session.dispose();
    };
  }, []);

  return { mandatory };
}

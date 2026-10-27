/**
 * Android optional Play update notice. Consults on cold start and foreground
 * with a fetch cooldown. Never blocks navigation, OAuth, or permissions.
 * Production policy stays server-side (`enabled` defaults false).
 */

import { useEffect } from 'react';
import { Alert, AppState, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { i18n } from '../i18n';
import { fetchAppUpdatePolicy, readNativeStoreVersion } from './appUpdate';
import { createAppUpdateNoticeSession } from './noticeSession.ts';
import {
  readAppUpdatePostpone,
  writeAppUpdatePostpone,
} from './postponeStore.ts';

function copy() {
  return {
    title: i18n.t('appUpdate.title'),
    message: i18n.t('appUpdate.message'),
    update: i18n.t('appUpdate.update'),
    later: i18n.t('appUpdate.later'),
  };
}

export function useAppUpdateNotice(): void {
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const session = createAppUpdateNoticeSession({
      platform: 'android',
      now: () => Date.now(),
      fetchPolicy: fetchAppUpdatePolicy,
      getInstalledVersion: readNativeStoreVersion,
      readPostpone: () => readAppUpdatePostpone(AsyncStorage),
      writePostpone: (entry) => writeAppUpdatePostpone(AsyncStorage, entry),
      getCopy: copy,
      isAppActive: () => AppState.currentState === 'active',
      delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      openStoreUrl: (url) => {
        void Linking.openURL(url).catch(() => {});
      },
      presentNotice: ({ copy: text, onUpdate, onLater }) => {
        Alert.alert(text.title, text.message, [
          { text: text.later, style: 'cancel', onPress: onLater },
          { text: text.update, onPress: onUpdate },
        ], {
          cancelable: true,
          onDismiss: onLater,
        });
      },
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
}

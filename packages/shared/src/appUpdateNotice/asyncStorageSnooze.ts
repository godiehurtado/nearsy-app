import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  APP_UPDATE_NOTICE_SNOOZE_STORAGE_KEY,
  parseSnoozeRecord,
  type AppUpdateNoticeSnoozeRecord,
  type AppUpdateNoticeSnoozeStore,
} from './snooze';

export function createAsyncStorageSnoozeStore(): AppUpdateNoticeSnoozeStore {
  return {
    async read() {
      const raw = await AsyncStorage.getItem(APP_UPDATE_NOTICE_SNOOZE_STORAGE_KEY);
      if (!raw) return null;
      try {
        return parseSnoozeRecord(JSON.parse(raw));
      } catch {
        return null;
      }
    },
    async write(record: AppUpdateNoticeSnoozeRecord) {
      await AsyncStorage.setItem(
        APP_UPDATE_NOTICE_SNOOZE_STORAGE_KEY,
        JSON.stringify(record),
      );
    },
  };
}

//packages/shared/src/services/db.ts
import { Platform } from 'react-native';

const impl =
  Platform.OS === 'android' ? require('./db.android') : require('./db.ios');

export const dbGetUser = impl.dbGetUser;
export const dbSetUserMerge = impl.dbSetUserMerge;
export const dbOnUserSnapshot = impl.dbOnUserSnapshot;
export const dbQueryVisibleUsers = impl.dbQueryVisibleUsers;
export const dbGetContactHashes = impl.dbGetContactHashes;

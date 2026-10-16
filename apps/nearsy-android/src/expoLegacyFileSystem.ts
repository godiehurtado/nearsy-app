/**
 * Metro-safe re-export of expo-file-system legacy API for social photo copy.
 * Lives in the Android app so resolution is not broken by the @nearsy/shared
 * workspace junction. metro.config.js maps `nearsy-expo-fs-legacy` here and
 * `expo-file-system/legacy` → node_modules/.../legacy.ts.
 */
export {
  cacheDirectory,
  downloadAsync,
  getInfoAsync,
  deleteAsync,
} from 'expo-file-system/legacy';

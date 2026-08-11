/**
 * Resolves the Firebase environment surfaced by Expo config (no secrets).
 */
import {
  resolveNearsyFirebaseEnvLabel,
  resolveNearsyDevClientFlag,
  type NearsyFirebaseEnvLabel,
  type NearsyFirebaseEnvExtras,
} from './appCheckPolicy';

export {
  resolveNearsyFirebaseEnvLabel,
  resolveNearsyDevClientFlag,
  type NearsyFirebaseEnvLabel,
  type NearsyFirebaseEnvExtras,
};

/**
 * True when Expo extras select Development Firebase (nearsy-dev).
 * Used to gate LinkedIn UI to Android Development only.
 */
export function isNearsyFirebaseDevelopment(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Constants =
      require('expo-constants').default ?? require('expo-constants');
    return (
      resolveNearsyFirebaseEnvLabel(Constants.expoConfig?.extra) ===
      'development'
    );
  } catch {
    return false;
  }
}

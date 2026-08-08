/**
 * Resolves the Firebase environment surfaced by Expo config (no secrets).
 * Re-exports policy helpers for callers that only need env labels.
 */
export {
  resolveNearsyFirebaseEnvLabel,
  resolveNearsyDevClientFlag,
  type NearsyFirebaseEnvLabel,
  type NearsyFirebaseEnvExtras,
} from './appCheckPolicy';

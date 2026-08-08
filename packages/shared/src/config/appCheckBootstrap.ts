/**
 * Non-Android stub — App Check bootstrap is Android Development scope for A3.4.1.
 */
export type {
  AppCheckInitStatus,
  AppCheckBootstrapDeps,
} from './appCheckPolicy';
export {
  getAppCheckInitStatus,
  __resetAppCheckBootstrapForTests,
} from './appCheckPolicy';

import type { AppCheckInitStatus } from './appCheckPolicy';

export async function ensureAppCheckInitialized(): Promise<AppCheckInitStatus> {
  return {
    status: 'skipped',
    decision: { action: 'skip', reason: 'firebase_env_not_development' },
  };
}

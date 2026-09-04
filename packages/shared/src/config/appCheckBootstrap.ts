/**
 * Non-Android stub — App Check bootstrap is Android-only for J01.
 */
export type {
  AppCheckInitStatus,
  AppCheckBootstrapDeps,
  AppCheckTokenFoundation,
} from './appCheckPolicy.ts';
export {
  getAppCheckInitStatus,
  __resetAppCheckBootstrapForTests,
} from './appCheckPolicy.ts';

import type {
  AppCheckInitStatus,
  AppCheckTokenFoundation,
} from './appCheckPolicy.ts';

export async function ensureAppCheckInitialized(): Promise<AppCheckInitStatus> {
  return {
    status: 'error',
    message: 'App Check bootstrap is Android-only.',
    decision: { action: 'reject', reason: 'provider_config_invalid' },
  };
}

export async function ensureAppCheckTokenFoundation(): Promise<AppCheckTokenFoundation> {
  return {
    status: 'not_ready',
    reason: 'App Check bootstrap is Android-only.',
  };
}

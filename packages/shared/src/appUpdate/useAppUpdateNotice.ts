import type { AppUpdateHostState } from './appUpdateHost.ts';

const NO_STATE: AppUpdateHostState = { mandatory: null };

/**
 * Non-Android: the Play update notice is not mounted.
 */
export function useAppUpdateNotice(): AppUpdateHostState {
  return NO_STATE;
}

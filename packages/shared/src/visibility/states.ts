/**
 * Pure Visibility state helpers (no reducers wired to UI yet).
 */

import type {
  ForegroundPermissionStatus,
  VisibilityClientState,
} from './types';

export function visibilityStateKind(
  state: VisibilityClientState,
): VisibilityClientState['kind'] {
  return state.kind;
}

export function isTerminalPermissionBlocked(
  state: VisibilityClientState,
): boolean {
  return (
    state.kind === 'permissionDenied' ||
    state.kind === 'permissionRestricted'
  );
}

export function isActivelyVisible(state: VisibilityClientState): boolean {
  return state.kind === 'active';
}

export function isTransientVisibilityOp(state: VisibilityClientState): boolean {
  return (
    state.kind === 'activating' ||
    state.kind === 'deactivating' ||
    state.kind === 'obtainingLocation' ||
    state.kind === 'loading'
  );
}

/** Map normalized permission to an initial client state (pure). */
export function stateFromForegroundPermission(
  status: ForegroundPermissionStatus,
): VisibilityClientState {
  switch (status) {
    case 'undetermined':
      return { kind: 'permissionNotDetermined' };
    case 'denied':
      return { kind: 'permissionDenied' };
    case 'restricted':
      return { kind: 'permissionRestricted' };
    case 'granted':
      return { kind: 'inactive' };
  }
}

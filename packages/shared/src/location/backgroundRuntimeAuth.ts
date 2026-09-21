/**
 * Local runtime authorization for background location task.
 * Set only after a successful profile+permission sync at start/reconcile.
 * Cleared on stop/logout/visibility-off/permission revoke/visibility-inactive.
 * Task callbacks must NOT re-fetch users/{uid} from Firestore.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export const NEARSY_BG_RUNTIME_AUTH = 'NEARSY_BG_RUNTIME_AUTH';

export type BackgroundRuntimeAuth = {
  uid: string;
  allowedAt: number;
  visibility: true;
  bgVisible: true;
};

export async function setBackgroundRuntimeAuth(
  auth: BackgroundRuntimeAuth,
  storage: Pick<typeof AsyncStorage, 'setItem'> = AsyncStorage,
): Promise<void> {
  await storage.setItem(NEARSY_BG_RUNTIME_AUTH, JSON.stringify(auth));
}

export async function clearBackgroundRuntimeAuth(
  storage: Pick<typeof AsyncStorage, 'removeItem'> = AsyncStorage,
): Promise<void> {
  await storage.removeItem(NEARSY_BG_RUNTIME_AUTH);
}

export async function readBackgroundRuntimeAuth(
  storage: Pick<typeof AsyncStorage, 'getItem'> = AsyncStorage,
): Promise<BackgroundRuntimeAuth | null> {
  try {
    const raw = await storage.getItem(NEARSY_BG_RUNTIME_AUTH);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BackgroundRuntimeAuth>;
    if (
      typeof parsed.uid !== 'string' ||
      !parsed.uid ||
      parsed.visibility !== true ||
      parsed.bgVisible !== true ||
      typeof parsed.allowedAt !== 'number'
    ) {
      return null;
    }
    return {
      uid: parsed.uid,
      allowedAt: parsed.allowedAt,
      visibility: true,
      bgVisible: true,
    };
  } catch {
    return null;
  }
}

/**
 * Steady-state callback gate: no Firestore profile read.
 */
export function decideCallbackPublication(input: {
  authUid: string | null;
  storedTaskUid: string | null;
  runtimeAuth: BackgroundRuntimeAuth | null;
  foregroundGranted: boolean;
  backgroundGranted: boolean;
}): 'publish' | 'stop' | 'skip' {
  if (!input.authUid || !input.storedTaskUid) return 'stop';
  if (input.authUid !== input.storedTaskUid) return 'stop';
  if (!input.runtimeAuth || input.runtimeAuth.uid !== input.authUid) {
    return 'stop';
  }
  if (!input.foregroundGranted || !input.backgroundGranted) return 'stop';
  return 'publish';
}

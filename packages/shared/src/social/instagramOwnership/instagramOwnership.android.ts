/**
 * Android Instagram reverse-DM ownership wiring (NEARSY-209).
 * Per-mode ownership — Personal and Professional connect independently.
 * Independent of login — does not mutate Firebase Auth session or link providers.
 * Requires Firebase Auth + App Check on every callable.
 * No Exchange / Confirm. Start only on explicit user action.
 */
import { firebaseAuth } from '../../config/firebaseConfig.android';
import {
  ensureAppCheckInitialized,
  getAppCheckInitStatus,
} from '../../config/appCheckBootstrap';
import {
  getIdentityFunctions,
  getIdentityFunctionsRegion,
} from '../../config/identityFunctions';
import type { ProfileMode } from '../../profile/profileModeFields.ts';
import {
  INSTAGRAM_OWNERSHIP_MOBILE_PLATFORM_ANDROID,
  type InstagramOwnershipGetResponse,
  type InstagramOwnershipPending,
  type InstagramOwnershipUnlinkResponse,
} from './instagramOwnershipContract.ts';
import {
  InstagramOwnershipError,
  assertInstagramOwnershipMode,
  instagramOwnershipGet,
  instagramOwnershipStart,
  instagramOwnershipUnlink,
  mapCallableError,
  type InstagramOwnershipFunctionsPort,
} from './instagramOwnershipCore.ts';

export {
  InstagramOwnershipError,
  instagramOwnershipErrorToI18nKey,
} from './instagramOwnershipCore.ts';
export {
  INSTAGRAM_OWNERSHIP_PLATFORM,
  INSTAGRAM_OWNERSHIP_POLL_INTERVAL_MS,
} from './instagramOwnershipContract.ts';
export type {
  InstagramOwnershipGetResponse,
  InstagramOwnershipPending,
  InstagramOwnershipVerified,
} from './instagramOwnershipContract.ts';

async function ensureAppCheckReady(): Promise<void> {
  const status = await ensureAppCheckInitialized();
  if (status.status === 'ready') return;
  if (status.status === 'error') {
    throw new InstagramOwnershipError(
      'APP_CHECK_NOT_READY',
      'App Check initialization failed.',
    );
  }
  const latest = getAppCheckInitStatus();
  if (latest.status !== 'ready') {
    throw new InstagramOwnershipError(
      'APP_CHECK_NOT_READY',
      'App Check is not ready.',
    );
  }
}

function createFunctionsPort(): InstagramOwnershipFunctionsPort {
  const functions = getIdentityFunctions();
  return {
    region: getIdentityFunctionsRegion(),
    async call(name, data) {
      const callable = functions.httpsCallable(name);
      try {
        const result = await callable(data ?? {});
        return result.data;
      } catch (err) {
        throw mapCallableError(err);
      }
    },
  };
}

function requireUid(): string {
  const uid = firebaseAuth.currentUser?.uid;
  if (!uid) {
    throw new InstagramOwnershipError(
      'unauthenticated',
      'Must be signed in.',
      'unauthenticated',
    );
  }
  return uid;
}

export async function startInstagramOwnership(
  mode: ProfileMode,
  options?: {
    functions?: InstagramOwnershipFunctionsPort;
  },
): Promise<InstagramOwnershipPending> {
  const scopedMode = assertInstagramOwnershipMode(mode);
  requireUid();
  await ensureAppCheckReady();
  const functions = options?.functions ?? createFunctionsPort();
  return instagramOwnershipStart(functions, {
    mode: scopedMode,
    platform: INSTAGRAM_OWNERSHIP_MOBILE_PLATFORM_ANDROID,
  });
}

export async function getInstagramOwnershipState(
  mode: ProfileMode,
  options?: {
    functions?: InstagramOwnershipFunctionsPort;
  },
): Promise<InstagramOwnershipGetResponse> {
  const scopedMode = assertInstagramOwnershipMode(mode);
  requireUid();
  await ensureAppCheckReady();
  const functions = options?.functions ?? createFunctionsPort();
  return instagramOwnershipGet(functions, scopedMode);
}

export async function unlinkInstagramOwnership(
  mode: ProfileMode,
  options?: {
    functions?: InstagramOwnershipFunctionsPort;
  },
): Promise<InstagramOwnershipUnlinkResponse> {
  const scopedMode = assertInstagramOwnershipMode(mode);
  requireUid();
  await ensureAppCheckReady();
  const functions = options?.functions ?? createFunctionsPort();
  return instagramOwnershipUnlink(functions, scopedMode);
}

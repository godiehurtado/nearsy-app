/**
 * Android composition root for Delete Account: reauthentication adapters,
 * the `deleteMyAccount` callable (us-central1, App Check) and the cleanup
 * that runs only after the backend confirms the deletion.
 */
import auth from '@react-native-firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp } from '@react-native-firebase/app';
import { getFunctions } from '@react-native-firebase/functions';
import { firebaseAuth } from '../config/firebaseConfig.android';
import {
  ensureAppCheckInitialized,
  getAppCheckInitStatus,
} from '../config/appCheckBootstrap';
import { isNearsyFacebookAuthConfigured } from '../config/facebookAuthConfig';
import { isNearsyLinkedInAuthAllowed } from '../config/nearsyFirebaseEnv';
import { clearPendingSocialProfilePrefill } from '../authentication/social';
import {
  logOutFacebookSession,
  reauthenticateWithFacebook,
} from '../services/facebookSession.android';
import {
  discardGoogleSignInSession,
  getGoogleWebClientId,
  requestGoogleIdToken,
} from '../services/googleAuth.android';
import { reauthWithPassword } from '../services/reauth.android';
import {
  closePublicationSession,
  drainInFlightPublications,
} from '../location/publicationSession';
import { stopBackgroundLocation } from '../location/startGatedBackgroundLocation';
import { resetLocationJourneySession } from '../location/locationJourneySession';
import { forgetLastConfirmedVisibility } from '../visibility/lastConfirmedVisibility';
import {
  DeleteAccountReauthError,
  createDeleteAccountFlow,
  reauthenticateWithLinkedInSameUid,
  resolveDeleteAccountOptions,
  runAccountDeletionCleanup,
  type DeleteAccountOptions,
  type DeleteAccountUserSnapshot,
  type LinkedInReauthBrowserResult,
} from './deleteAccountCore';

const REGION = 'us-central1' as const;
/** Backend timeout is 120 s; the client waits slightly longer. */
const CALLABLE_TIMEOUT_MS = 130_000;

function currentUserSnapshot(): DeleteAccountUserSnapshot {
  const user = firebaseAuth.currentUser;
  if (!user) return null;
  return {
    uid: user.uid,
    providerIds: (user.providerData ?? []).map((entry) => entry?.providerId),
  };
}

async function ensureAppCheckReady(): Promise<void> {
  const status = await ensureAppCheckInitialized();
  if (status.status === 'ready' || getAppCheckInitStatus().status === 'ready') {
    return;
  }
  throw {
    code: 'functions/failed-precondition',
    details: { reason: 'APP_CHECK_REQUIRED' },
  };
}

async function invokeCallable(
  name: string,
  payload: Record<string, never>,
): Promise<unknown> {
  const user = firebaseAuth.currentUser;
  if (!user) {
    throw {
      code: 'functions/unauthenticated',
      details: { reason: 'UNAUTHENTICATED' },
    };
  }
  await user.getIdToken(true);
  await ensureAppCheckReady();
  const callable = getFunctions(getApp(), REGION).httpsCallable(name, {
    timeout: CALLABLE_TIMEOUT_MS,
  });
  const result = await callable(payload);
  return result.data;
}

async function reauthenticateWithGoogle(): Promise<void> {
  const user = firebaseAuth.currentUser;
  if (!user) throw new DeleteAccountReauthError('FAILED', 'No session.');
  // Explicit account picker: never reuse a cached Google session.
  await discardGoogleSignInSession();
  try {
    let idToken: string;
    try {
      ({ idToken } = await requestGoogleIdToken());
    } catch (err) {
      const code = (err as { code?: unknown })?.code;
      if (code === 'SIGN_IN_CANCELLED') {
        throw new DeleteAccountReauthError('CANCELLED', 'Google was cancelled.');
      }
      if (code === 'SIGN_IN_IN_PROGRESS') {
        throw new DeleteAccountReauthError('IN_PROGRESS', 'Google is busy.');
      }
      throw new DeleteAccountReauthError('FAILED', 'Google failed.');
    }
    await user.reauthenticateWithCredential(
      auth.GoogleAuthProvider.credential(idToken),
    );
  } finally {
    await discardGoogleSignInSession();
  }
}

function reauthenticateWithLinkedIn(): Promise<void> {
  return reauthenticateWithLinkedInSameUid({
    getCurrentUid: () => firebaseAuth.currentUser?.uid ?? null,
    runBrowserFlow: () => {
      // Lazy: LinkedIn native modules load only when this method is used.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const linkedIn = require('../authentication/linkedin/linkedinAuth') as {
        runLinkedInAuthWithBrowser: () => Promise<LinkedInReauthBrowserResult>;
      };
      return linkedIn.runLinkedInAuthWithBrowser();
    },
    async signInWithCustomToken(customToken) {
      const credential = await firebaseAuth.signInWithCustomToken(customToken);
      return { uid: credential.user.uid };
    },
  });
}

async function cleanupAfterDeletion(uid: string): Promise<void> {
  resetLocationJourneySession();
  await runAccountDeletionCleanup(uid, {
    clearSocialPrefill: () => clearPendingSocialProfilePrefill(),
    closePublicationGate: () => closePublicationSession(),
    stopBackground: () => stopBackgroundLocation(),
    drainInFlightPublications: () => drainInFlightPublications(),
    signOutProviderSessions: async () => {
      logOutFacebookSession();
      await discardGoogleSignInSession();
    },
    signOut: async () => {
      await firebaseAuth.signOut();
    },
    clearLocalAccountState: (deletedUid) =>
      forgetLastConfirmedVisibility(deletedUid, AsyncStorage),
  });
}

export function getDeleteAccountOptions(): DeleteAccountOptions {
  return resolveDeleteAccountOptions(currentUserSnapshot(), {
    google: Boolean(getGoogleWebClientId()),
    facebook: isNearsyFacebookAuthConfigured(),
    linkedin: isNearsyLinkedInAuthAllowed(),
  });
}

export const deleteMyAccountWithReauth = createDeleteAccountFlow({
  getCurrentUser: currentUserSnapshot,
  reauthenticate: {
    password: ({ password }) => reauthWithPassword(password ?? ''),
    google: reauthenticateWithGoogle,
    facebook: () => reauthenticateWithFacebook(),
    linkedin: reauthenticateWithLinkedIn,
  },
  invokeCallable,
  cleanupAfterDeletion,
  logDev: (entry) => {
    if (__DEV__) console.log('[deleteAccount]', entry);
  },
});

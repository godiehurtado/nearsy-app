/**
 * LinkedIn A3 → Firebase JS session → profile route (I2).
 * Reuses existing ProfileCompletion / MainTabs entry — does not edit CRJ screens.
 */

import { signInWithCustomToken } from 'firebase/auth';
import { getUserProfile, isProfileComplete } from '../../services/firestoreService';
import { firebaseAuth } from '../../config/firebaseConfig';
import { createExpoLinkedInAuthBrowser } from './browserSession';
import { createExpoClientProofCrypto } from './clientProof';
import { getLinkedInA3CallableClient } from './iosLinkedInA3Foundation';
import {
  runLinkedInA3BrowserAuthFlow,
  type LinkedInA3FirebaseAuthPort,
  type LinkedInA3FlowResult,
} from './orchestrator';
import { LinkedInA3ClientError } from './sanitize';
import { resolveNearsyFirebaseEnvironment } from './environment/nearsyFirebaseEnvironment';
import { getSharedLinkedInA3DurableStore } from './runtimeDurableStore';
import { queueLinkedInCrjPrefillIfNeeded } from './profilePrefill';
import type { LinkedInAuthProfileHints } from './types';
import Constants from 'expo-constants';

export type LinkedInA3ProfileRoute = 'MainTabs' | 'CompleteProfile';

export type LinkedInA3SignInSuccess = {
  status: 'authenticated';
  session: { uid: string; email: string | null };
  profileRoute: LinkedInA3ProfileRoute;
  email: string | null;
};

export type LinkedInA3SignInOutcome =
  | LinkedInA3SignInSuccess
  | Extract<LinkedInA3FlowResult, { status: Exclude<LinkedInA3FlowResult['status'], 'authenticated'> }>;

function readFirebaseEnvRaw(): string | undefined {
  const extra = Constants.expoConfig?.extra as
    | { EXPO_PUBLIC_NEARSY_FIREBASE_ENV?: string }
    | undefined;
  return (
    extra?.EXPO_PUBLIC_NEARSY_FIREBASE_ENV ??
    process.env.EXPO_PUBLIC_NEARSY_FIREBASE_ENV
  );
}

export function isLinkedInA3SignInEnabledForRuntime(): boolean {
  try {
    const env = resolveNearsyFirebaseEnvironment(readFirebaseEnvRaw());
    return env.environment === 'development' && env.linkedInAuthEnabled;
  } catch {
    return false;
  }
}

export function createLinkedInA3FirebaseAuthPort(): LinkedInA3FirebaseAuthPort {
  return {
    getCurrentUid: () => firebaseAuth.currentUser?.uid ?? null,
    async signInWithCustomToken(customToken: string) {
      const cred = await signInWithCustomToken(firebaseAuth, customToken);
      const user = cred.user ?? firebaseAuth.currentUser;
      if (!user?.uid) {
        throw new LinkedInA3ClientError(
          'FIREBASE_SIGN_IN_FAILED',
          'Firebase user missing after custom token sign-in.',
        );
      }
      return {
        uid: user.uid,
        email: typeof user.email === 'string' ? user.email : null,
      };
    },
  };
}

/**
 * Shared post-auth finalizer for live LinkedIn and durable resume.
 * profileSetupCompleted is the only gate; pending prefill is queued before navigation.
 */
export async function finalizeLinkedInA3AuthenticatedSession(input: {
  uid: string;
  sessionEmail: string | null;
  profileHints?: LinkedInAuthProfileHints;
}): Promise<LinkedInA3SignInOutcome> {
  const uid = input.uid;
  if (!firebaseAuth.currentUser || firebaseAuth.currentUser.uid !== uid) {
    return {
      status: 'failed',
      error: new LinkedInA3ClientError(
        'FIREBASE_SIGN_IN_FAILED',
        'Firebase currentUser mismatch after LinkedIn sign-in.',
      ),
    };
  }

  try {
    await firebaseAuth.currentUser.reload();
  } catch {
    // Keep the post-signIn snapshot.
  }

  const authUser = firebaseAuth.currentUser;
  if (!authUser || authUser.uid !== uid) {
    return {
      status: 'failed',
      error: new LinkedInA3ClientError(
        'FIREBASE_SIGN_IN_FAILED',
        'Firebase currentUser mismatch after LinkedIn sign-in.',
      ),
    };
  }

  let complete = false;
  try {
    complete = await isProfileComplete(uid);
  } catch {
    complete = false;
  }

  const profileRoute: LinkedInA3ProfileRoute = complete
    ? 'MainTabs'
    : 'CompleteProfile';

  if (profileRoute === 'CompleteProfile') {
    const queued = queueLinkedInCrjPrefillIfNeeded({
      uid,
      profileComplete: false,
      givenName: input.profileHints?.givenName,
      familyName: input.profileHints?.familyName,
      displayName: input.profileHints?.displayName ?? authUser.displayName,
      photoUrl: input.profileHints?.photoUrl,
      photoURL: authUser.photoURL,
    });
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log('[linkedinA3.prefill]', {
        hasExchangeHints: Boolean(input.profileHints),
        hasGivenName: queued.hasGivenName,
        hasFamilyName: queued.hasFamilyName,
        hasDisplayName: queued.hasDisplayName,
        hasPhotoUrl: queued.hasPhotoUrl,
        queued: queued.queued,
      });
    }
  }

  let email = input.sessionEmail;
  try {
    const profile = await getUserProfile(uid);
    if (profile && typeof (profile as { email?: unknown }).email === 'string') {
      email = (profile as { email: string }).email;
    }
  } catch {
    // keep session email
  }

  return {
    status: 'authenticated',
    session: { uid, email },
    profileRoute,
    email,
  };
}

/**
 * Full happy-path LinkedIn A3 sign-in for Development iOS.
 */
export async function signInWithLinkedInA3(): Promise<LinkedInA3SignInOutcome> {
  if (!isLinkedInA3SignInEnabledForRuntime()) {
    return {
      status: 'failed',
      error: new LinkedInA3ClientError(
        'LINKEDIN_DISABLED',
        'LinkedIn authentication is disabled in this environment.',
      ),
    };
  }

  const WebBrowser = await import('expo-web-browser');
  const crypto = await createExpoClientProofCrypto();
  const browser = createExpoLinkedInAuthBrowser(WebBrowser);
  const auth = createLinkedInA3FirebaseAuthPort();

  const flow = await runLinkedInA3BrowserAuthFlow({
    platform: 'ios',
    crypto,
    browser,
    getClient: getLinkedInA3CallableClient,
    auth,
    durableStore: getSharedLinkedInA3DurableStore(),
  });

  if (flow.status !== 'authenticated') {
    return flow;
  }

  return finalizeLinkedInA3AuthenticatedSession({
    uid: flow.session.uid,
    sessionEmail: flow.session.email,
    profileHints: flow.profileHints,
  });
}

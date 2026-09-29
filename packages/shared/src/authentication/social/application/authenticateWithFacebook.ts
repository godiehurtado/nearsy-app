import type { SocialAuthenticationProviderAdapter } from './socialAuthenticationPort';
import type { SocialProviderRegistry } from './providerRegistry';
import type {
  FirebaseAuthenticationPort,
  FirebaseAuthenticationSession,
} from '../infrastructure/firebase/firebaseAuthenticationPort';
import {
  createSocialAuthError,
  messageKeyForCode,
  sanitizeSocialErrorForLog,
  SocialAuthError,
} from '../domain/socialAuthenticationError';
import type { SocialProfileData } from '../domain/socialProfileData';
import { normalizeSocialProfileData } from './normalizeSocialProfileData';
import {
  clearPendingSocialProfilePrefill,
  setPendingSocialProfilePrefill,
} from './socialProfilePrefillStore';

export type FacebookSignInProfileRoute = 'MainTabs' | 'CompleteProfile';

export interface FacebookSignInSuccess {
  session: FirebaseAuthenticationSession;
  profileRoute: FacebookSignInProfileRoute;
  /** Optional: Facebook may not share an email. */
  email?: string;
  socialProfile?: SocialProfileData;
}

export interface AuthenticateWithFacebookDependencies {
  registry: SocialProviderRegistry;
  firebaseAuth: FirebaseAuthenticationPort;
  getUserProfile: (uid: string) => Promise<unknown | null>;
  isProfileComplete: (uid: string) => Promise<boolean>;
}

/**
 * Only name, photo and email (when shared) may prefill CRJ from Facebook.
 */
function toFacebookPrefill(
  profile: SocialProfileData,
): SocialProfileData | undefined {
  const prefill: SocialProfileData = {
    provider: 'facebook',
    providerUserId: profile.providerUserId,
    displayName: profile.displayName,
    givenName: profile.givenName,
    familyName: profile.familyName,
    photoUrl: profile.photoUrl,
    email: profile.email,
  };
  const hasAny =
    prefill.displayName ||
    prefill.givenName ||
    prefill.familyName ||
    prefill.photoUrl ||
    prefill.email;
  return hasAny ? prefill : undefined;
}

function logDev(error: SocialAuthError): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log('[authenticateWithFacebook]', sanitizeSocialErrorForLog(error.social));
  }
}

/**
 * Facebook native login → Firebase credential → contractual profile route.
 * Reuses the shared social journey (existing complete → MainTabs; new or
 * incomplete → CompleteProfile / DOB → OTP → CRJ). Never links accounts or
 * marks profiles complete.
 */
export function createAuthenticateWithFacebook(
  deps: AuthenticateWithFacebookDependencies,
) {
  let inProgress = false;

  return async function authenticateWithFacebook(): Promise<FacebookSignInSuccess> {
    if (inProgress) {
      throw createSocialAuthError({
        code: 'IN_PROGRESS',
        provider: 'facebook',
        recoverable: true,
        messageKey: messageKeyForCode('IN_PROGRESS'),
        diagnosticCode: 'ORCHESTRATOR_IN_PROGRESS',
      });
    }

    inProgress = true;
    let provider: SocialAuthenticationProviderAdapter | undefined;
    let providerSucceeded = false;

    try {
      if (!deps.registry.isRegistered('facebook')) {
        throw createSocialAuthError({
          code: 'PROVIDER_UNAVAILABLE',
          provider: 'facebook',
          recoverable: false,
          messageKey: messageKeyForCode('PROVIDER_UNAVAILABLE'),
          diagnosticCode: 'FACEBOOK_NOT_REGISTERED',
        });
      }

      provider = deps.registry.get('facebook');

      await provider.configure();

      const providerResult = await provider.authenticate({
        provider: 'facebook',
        interactive: true,
      });
      providerSucceeded = true;

      const accessToken = providerResult.accessToken?.trim();
      const idToken = providerResult.idToken?.trim();
      if (!accessToken && !idToken) {
        throw createSocialAuthError({
          code: 'TOKEN_MISSING',
          provider: 'facebook',
          recoverable: false,
          messageKey: messageKeyForCode('TOKEN_MISSING'),
          diagnosticCode: 'FACEBOOK_TOKEN_MISSING',
        });
      }

      let session: FirebaseAuthenticationSession;
      try {
        session = await deps.firebaseAuth.signInWithSocialCredential({
          provider: 'facebook',
          ...(accessToken
            ? { accessToken }
            : { idToken, rawNonce: providerResult.rawNonce }),
        });
      } catch (firebaseErr) {
        if (provider.clearProviderSession) {
          try {
            await provider.clearProviderSession();
          } catch {
            // Best-effort cleanup only.
          }
        }
        throw firebaseErr;
      }

      let socialProfile: SocialProfileData | undefined;
      try {
        socialProfile = toFacebookPrefill(normalizeSocialProfileData(providerResult));
      } catch {
        socialProfile = undefined;
      }

      // Queue before Firestore reads: AppNavigator may mount CRJ as soon as
      // Auth hydrates (same race the Apple journey guards against).
      if (socialProfile) {
        setPendingSocialProfilePrefill(session.uid, socialProfile);
      }

      const email = session.email ?? socialProfile?.email;
      const profile = await deps.getUserProfile(session.uid);
      if (!profile) {
        return { session, profileRoute: 'CompleteProfile', email, socialProfile };
      }

      const complete = await deps.isProfileComplete(session.uid);
      if (complete) {
        clearPendingSocialProfilePrefill();
        return { session, profileRoute: 'MainTabs', email, socialProfile: undefined };
      }

      return { session, profileRoute: 'CompleteProfile', email, socialProfile };
    } catch (err) {
      if (err instanceof SocialAuthError) {
        logDev(err);
        throw err;
      }

      const mapped = createSocialAuthError({
        code: 'UNKNOWN',
        provider: 'facebook',
        recoverable: false,
        messageKey: messageKeyForCode('UNKNOWN'),
        diagnosticCode: 'ORCHESTRATOR_UNKNOWN',
      });
      logDev(mapped);

      if (providerSucceeded && provider?.clearProviderSession) {
        try {
          await provider.clearProviderSession();
        } catch {
          // Best-effort.
        }
      }

      throw mapped;
    } finally {
      inProgress = false;
    }
  };
}

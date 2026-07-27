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
  isEmptyPrefillValue,
  mapSocialNameToRealName,
} from './mergeCompleteProfilePrefill';
import { setPendingSocialProfilePrefill } from './socialProfilePrefillStore';

/** Historical route name kept for parity with Google orchestrator. */
export type AppleSignInProfileRoute = 'MainTabs' | 'CompleteProfile';

export interface AppleSignInSuccess {
  session: FirebaseAuthenticationSession;
  profileRoute: AppleSignInProfileRoute;
  email?: string;
  socialProfile?: SocialProfileData;
}

export interface AuthenticateWithAppleDependencies {
  registry: SocialProviderRegistry;
  firebaseAuth: FirebaseAuthenticationPort;
  getUserProfile: (uid: string) => Promise<unknown | null>;
  isProfileComplete: (uid: string) => Promise<boolean>;
  /**
   * Fill-empty-only durable capture of Apple realName after Firebase UID exists.
   * Must not set profileSetupCompleted or invent names.
   */
  persistEmptyRealName?: (uid: string, realName: string) => Promise<void>;
}

function readExistingRealName(profile: unknown | null): unknown {
  if (!profile || typeof profile !== 'object') return undefined;
  return (profile as { realName?: unknown }).realName;
}

/**
 * Persist Apple-mapped realName only when Firestore realName is empty.
 * Fail-soft: never throws to the caller.
 */
async function persistAppleRealNameIfEmpty(options: {
  uid: string;
  socialProfile: SocialProfileData | undefined;
  existingProfile: unknown | null;
  persistEmptyRealName?: (uid: string, realName: string) => Promise<void>;
}): Promise<void> {
  const { uid, socialProfile, existingProfile, persistEmptyRealName } = options;
  if (!persistEmptyRealName || !socialProfile) return;

  const mapped = mapSocialNameToRealName(socialProfile);
  if (!mapped) return;

  if (!isEmptyPrefillValue(readExistingRealName(existingProfile))) {
    return;
  }

  try {
    await persistEmptyRealName(uid, mapped);
  } catch {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log('[authenticateWithApple]', {
        diagnosticCode: 'EARLY_REALNAME_PERSIST_FAILED',
        provider: 'apple',
      });
    }
  }
}

/**
 * Apple native sign-in → Firebase credential → optional durable name capture →
 * profile route (+ pending prefill). Does not mark profiles complete or link accounts.
 */
export function createAuthenticateWithApple(
  deps: AuthenticateWithAppleDependencies,
) {
  let inProgress = false;

  return async function authenticateWithApple(): Promise<AppleSignInSuccess> {
    if (inProgress) {
      throw createSocialAuthError({
        code: 'IN_PROGRESS',
        provider: 'apple',
        recoverable: true,
        messageKey: messageKeyForCode('IN_PROGRESS'),
        diagnosticCode: 'ORCHESTRATOR_IN_PROGRESS',
      });
    }

    inProgress = true;
    let provider: SocialAuthenticationProviderAdapter | undefined;
    let providerSucceeded = false;

    try {
      if (!deps.registry.isRegistered('apple')) {
        throw createSocialAuthError({
          code: 'PROVIDER_UNAVAILABLE',
          provider: 'apple',
          recoverable: false,
          messageKey: messageKeyForCode('PROVIDER_UNAVAILABLE'),
          diagnosticCode: 'APPLE_NOT_REGISTERED',
        });
      }

      provider = deps.registry.get('apple');

      const available = await provider.isAvailable();
      if (!available) {
        throw createSocialAuthError({
          code: 'PROVIDER_UNAVAILABLE',
          provider: 'apple',
          recoverable: false,
          messageKey: messageKeyForCode('PROVIDER_UNAVAILABLE'),
          diagnosticCode: 'APPLE_UNAVAILABLE',
        });
      }

      await provider.configure();

      const providerResult = await provider.authenticate({
        provider: 'apple',
        interactive: true,
      });
      providerSucceeded = true;

      if (!providerResult.idToken?.trim()) {
        throw createSocialAuthError({
          code: 'TOKEN_MISSING',
          provider: 'apple',
          recoverable: false,
          messageKey: messageKeyForCode('TOKEN_MISSING'),
          diagnosticCode: 'IDENTITY_TOKEN_MISSING',
        });
      }

      if (!providerResult.rawNonce?.trim()) {
        throw createSocialAuthError({
          code: 'TOKEN_INVALID',
          provider: 'apple',
          recoverable: false,
          messageKey: messageKeyForCode('TOKEN_INVALID'),
          diagnosticCode: 'RAW_NONCE_MISSING',
        });
      }

      let session: FirebaseAuthenticationSession;
      try {
        session = await deps.firebaseAuth.signInWithSocialCredential({
          provider: 'apple',
          identityToken: providerResult.idToken,
          rawNonce: providerResult.rawNonce,
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
        socialProfile = normalizeSocialProfileData(providerResult);
        // Prefer Apple-delivered fields; fall back to Firebase session email when empty.
        if (!socialProfile.email?.trim() && session.email?.trim()) {
          socialProfile = {
            ...socialProfile,
            email: session.email.trim(),
          };
        }
      } catch {
        socialProfile = undefined;
      }

      const profile = await deps.getUserProfile(session.uid);

      // Durable first-authorization capture — after UID, before navigation.
      await persistAppleRealNameIfEmpty({
        uid: session.uid,
        socialProfile,
        existingProfile: profile,
        persistEmptyRealName: deps.persistEmptyRealName,
      });

      if (!profile) {
        if (socialProfile) {
          try {
            setPendingSocialProfilePrefill(session.uid, socialProfile);
          } catch {
            // Fail-soft: auth still succeeds without prefill.
          }
        }
        return {
          session,
          profileRoute: 'CompleteProfile',
          email: session.email ?? providerResult.email,
          socialProfile,
        };
      }

      const complete = await deps.isProfileComplete(session.uid);
      if (!complete && socialProfile) {
        try {
          setPendingSocialProfilePrefill(session.uid, socialProfile);
        } catch {
          // Fail-soft.
        }
      }

      return {
        session,
        profileRoute: complete ? 'MainTabs' : 'CompleteProfile',
        email: session.email ?? providerResult.email,
        socialProfile: complete ? undefined : socialProfile,
      };
    } catch (err) {
      if (err instanceof SocialAuthError) {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.log(
            '[authenticateWithApple]',
            sanitizeSocialErrorForLog(err.social),
          );
        }
        throw err;
      }

      const mapped = createSocialAuthError({
        code: 'UNKNOWN',
        provider: 'apple',
        recoverable: false,
        messageKey: messageKeyForCode('UNKNOWN'),
        diagnosticCode: 'ORCHESTRATOR_UNKNOWN',
      });

      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.log(
          '[authenticateWithApple]',
          sanitizeSocialErrorForLog(mapped.social),
        );
      }

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

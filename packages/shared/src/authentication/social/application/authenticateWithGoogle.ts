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

export type GoogleSignInProfileRoute = 'MainTabs' | 'CompleteProfile';

export interface GoogleSignInSuccess {
  session: FirebaseAuthenticationSession;
  profileRoute: GoogleSignInProfileRoute;
  /** Email for CompleteProfile params; prefers Firebase session email. */
  email?: string;
}

export interface AuthenticateWithGoogleDependencies {
  registry: SocialProviderRegistry;
  firebaseAuth: FirebaseAuthenticationPort;
  getUserProfile: (uid: string) => Promise<unknown | null>;
  isProfileComplete: (uid: string) => Promise<boolean>;
}

/**
 * TS-007 orchestrator: Google native sign-in → Firebase credential → profile route.
 * Does not write Firestore profiles or perform account linking (TS-008 / TS-009).
 */
export function createAuthenticateWithGoogle(
  deps: AuthenticateWithGoogleDependencies,
) {
  let inProgress = false;

  return async function authenticateWithGoogle(): Promise<GoogleSignInSuccess> {
    if (inProgress) {
      throw createSocialAuthError({
        code: 'IN_PROGRESS',
        provider: 'google',
        recoverable: true,
        messageKey: messageKeyForCode('IN_PROGRESS'),
        diagnosticCode: 'ORCHESTRATOR_IN_PROGRESS',
      });
    }

    inProgress = true;
    let provider: SocialAuthenticationProviderAdapter | undefined;
    let providerSucceeded = false;

    try {
      if (!deps.registry.isRegistered('google')) {
        throw createSocialAuthError({
          code: 'PROVIDER_UNAVAILABLE',
          provider: 'google',
          recoverable: false,
          messageKey: messageKeyForCode('PROVIDER_UNAVAILABLE'),
          diagnosticCode: 'GOOGLE_NOT_REGISTERED',
        });
      }

      provider = deps.registry.get('google');

      const available = await provider.isAvailable();
      if (!available) {
        throw createSocialAuthError({
          code: 'PROVIDER_UNAVAILABLE',
          provider: 'google',
          recoverable: false,
          messageKey: messageKeyForCode('PROVIDER_UNAVAILABLE'),
          diagnosticCode: 'GOOGLE_UNAVAILABLE',
        });
      }

      await provider.configure();

      const providerResult = await provider.authenticate({
        provider: 'google',
        interactive: true,
      });
      providerSucceeded = true;

      if (!providerResult.idToken?.trim()) {
        throw createSocialAuthError({
          code: 'TOKEN_MISSING',
          provider: 'google',
          recoverable: false,
          messageKey: messageKeyForCode('TOKEN_MISSING'),
          diagnosticCode: 'ID_TOKEN_MISSING',
        });
      }

      let session: FirebaseAuthenticationSession;
      try {
        session = await deps.firebaseAuth.signInWithSocialCredential({
          provider: 'google',
          idToken: providerResult.idToken,
          accessToken: providerResult.accessToken,
        });
      } catch (firebaseErr) {
        // Native Google session can remain after Firebase failure; clear it so
        // the next attempt starts clean and avoids a stuck provider session.
        if (provider.clearProviderSession) {
          try {
            await provider.clearProviderSession();
          } catch {
            // Best-effort cleanup only.
          }
        }
        throw firebaseErr;
      }

      const profile = await deps.getUserProfile(session.uid);
      if (!profile) {
        return {
          session,
          profileRoute: 'CompleteProfile',
          email: session.email ?? providerResult.email,
        };
      }

      const complete = await deps.isProfileComplete(session.uid);
      return {
        session,
        profileRoute: complete ? 'MainTabs' : 'CompleteProfile',
        email: session.email ?? providerResult.email,
      };
    } catch (err) {
      if (err instanceof SocialAuthError) {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.log(
            '[authenticateWithGoogle]',
            sanitizeSocialErrorForLog(err.social),
          );
        }
        throw err;
      }

      const mapped = createSocialAuthError({
        code: 'UNKNOWN',
        provider: 'google',
        recoverable: false,
        messageKey: messageKeyForCode('UNKNOWN'),
        diagnosticCode: 'ORCHESTRATOR_UNKNOWN',
      });

      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.log(
          '[authenticateWithGoogle]',
          sanitizeSocialErrorForLog(mapped.social),
        );
      }

      // If provider signed in but an unexpected failure occurred before Firebase
      // cleanup, still attempt to clear the native session.
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

/**
 * Default LinkedIn deletion-reauth runtime. Loaded lazily so Node unit tests
 * never pull Expo / RN modules.
 */
import { firebaseAuth } from '../../config/firebaseConfig';
import {
  createLinkedInA3FirebaseAuthPort,
  isLinkedInA3SignInEnabledForRuntime,
} from '../../authentication/linkedinA3/authenticateWithLinkedIn';
import { createExpoLinkedInAuthBrowser } from '../../authentication/linkedinA3/browserSession';
import { createExpoClientProofCrypto } from '../../authentication/linkedinA3/clientProof';
import { getLinkedInA3CallableClient } from '../../authentication/linkedinA3/iosLinkedInA3Foundation';
import { runLinkedInA3BrowserAuthFlow } from '../../authentication/linkedinA3/orchestrator';
import { AccountDeletionReauthError } from './accountDeletionReauthError';
import { refreshLinkedInSessionForDeletion } from './linkedInDeletionReauth';

export function isLinkedInDeletionReauthAvailable(): boolean {
  return isLinkedInA3SignInEnabledForRuntime();
}

export async function refreshLinkedInSessionForDeletionDefault(expectedUid: string): Promise<void> {
  if (!isLinkedInA3SignInEnabledForRuntime()) {
    throw new AccountDeletionReauthError(
      'LINKEDIN_SESSION_REQUIRED',
      'settings.deleteAccount.linkedInSignInAgain',
    );
  }
  const port = createLinkedInA3FirebaseAuthPort();
  await refreshLinkedInSessionForDeletion(expectedUid, {
    getCurrentUid: () => firebaseAuth.currentUser?.uid ?? null,
    signInWithCustomToken: (customToken) => port.signInWithCustomToken(customToken),
    runFlow: async (auth) => {
      const WebBrowser = await import('expo-web-browser');
      const crypto = await createExpoClientProofCrypto();
      // No durable store: a killed reauth must never resume into a sign-in.
      return runLinkedInA3BrowserAuthFlow({
        platform: 'ios',
        crypto,
        browser: createExpoLinkedInAuthBrowser(WebBrowser),
        getClient: getLinkedInA3CallableClient,
        auth,
      });
    },
  });
}

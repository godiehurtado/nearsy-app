/**
 * LinkedIn A3 browser auth orchestrator (I2).
 * Start → controlled auth session → parse return → Exchange → signInWithCustomToken.
 * Verifier stays in memory for the active attempt only (no SecureStore in I2).
 */

import { LINKEDIN_APP_RETURN_URL } from './environment/nearsyFirebaseEnvironment';
import type { LinkedInA3CallableClient } from './functions/linkedInA3CallableClient';
import {
  createClientProofPair,
  type ClientProofCrypto,
} from './clientProof';
import type { LinkedInAuthBrowser } from './browserSession';
import { parseLinkedInMobileReturnUrl } from './returnUrl';
import { LinkedInA3ClientError } from './sanitize';

export type LinkedInA3FlowStatus =
  | 'authenticated'
  | 'cancelled'
  | 'dismissed'
  | 'provider_error'
  | 'failed'
  | 'session_already_active';

export type LinkedInA3AuthSession = {
  uid: string;
  email: string | null;
};

export type LinkedInA3FlowResult =
  | {
      status: 'authenticated';
      session: LinkedInA3AuthSession;
    }
  | {
      status: Exclude<LinkedInA3FlowStatus, 'authenticated'>;
      error?: LinkedInA3ClientError;
      providerErrorCode?: string;
    };

export type LinkedInA3FirebaseAuthPort = {
  getCurrentUid: () => string | null;
  signInWithCustomToken: (
    customToken: string,
  ) => Promise<LinkedInA3AuthSession>;
};

export type LinkedInA3OrchestratorDeps = {
  platform: 'ios';
  crypto: ClientProofCrypto;
  browser: LinkedInAuthBrowser;
  getClient: () => Promise<LinkedInA3CallableClient>;
  auth: LinkedInA3FirebaseAuthPort;
  /** Optional: reject if another Firebase user appears mid-flow. */
  captureUidAtStart?: boolean;
};

type ActiveAttempt = {
  transactionId: string;
  clientProofVerifier: string;
  exchanged: boolean;
  signedIn: boolean;
};

let inFlight: Promise<LinkedInA3FlowResult> | null = null;
let active: ActiveAttempt | null = null;

export function clearLinkedInA3OrchestratorStateForTests(): void {
  inFlight = null;
  active = null;
}

export function getLinkedInA3OrchestratorBusy(): boolean {
  return inFlight != null;
}

function clearActive(): void {
  active = null;
}

export async function runLinkedInA3BrowserAuthFlow(
  deps: LinkedInA3OrchestratorDeps,
): Promise<LinkedInA3FlowResult> {
  if (inFlight) {
    return {
      status: 'session_already_active',
      error: new LinkedInA3ClientError(
        'OPERATION_IN_PROGRESS',
        'LinkedIn authentication is already in progress.',
      ),
    };
  }

  inFlight = (async () => {
    let startUid: string | null = null;
    try {
      if (deps.captureUidAtStart !== false) {
        startUid = deps.auth.getCurrentUid();
      }

      const pair = await createClientProofPair(deps.crypto);
      const client = await deps.getClient();

      let startResult;
      try {
        startResult = await client.start({
          platform: deps.platform,
          clientProofChallenge: pair.clientProofChallenge,
          clientProofMethod: pair.clientProofMethod,
        });
      } catch (err) {
        clearActive();
        if (err instanceof LinkedInA3ClientError) {
          return { status: 'failed', error: err };
        }
        return {
          status: 'failed',
          error: new LinkedInA3ClientError(
            'CALLABLE_FAILED',
            'LinkedIn auth start failed.',
          ),
        };
      }

      active = {
        transactionId: startResult.transactionId,
        clientProofVerifier: pair.clientProofVerifier,
        exchanged: false,
        signedIn: false,
      };
      // Drop challenge from scope; verifier only in active.
      void pair.clientProofChallenge;

      const browserOutcome = await deps.browser.openAuthSession(
        startResult.authorizationUrl,
        LINKEDIN_APP_RETURN_URL,
      );

      if (browserOutcome.type === 'cancel') {
        clearActive();
        return { status: 'cancelled' };
      }
      if (browserOutcome.type === 'dismiss') {
        clearActive();
        return { status: 'dismissed' };
      }
      if (
        browserOutcome.type === 'unavailable' ||
        browserOutcome.type === 'failed'
      ) {
        clearActive();
        return {
          status: 'failed',
          error: new LinkedInA3ClientError(
            'BROWSER_FAILED',
            'Unable to complete LinkedIn browser authentication.',
          ),
        };
      }

      const parsed = parseLinkedInMobileReturnUrl(browserOutcome.url);
      if (parsed.kind === 'provider_error') {
        clearActive();
        return {
          status: 'provider_error',
          providerErrorCode: parsed.errorCode,
          error: new LinkedInA3ClientError(
            'PROVIDER_CALLBACK_ERROR',
            'LinkedIn authentication was rejected.',
            parsed.errorCode,
          ),
        };
      }
      if (parsed.kind !== 'success') {
        clearActive();
        return {
          status: 'failed',
          error: new LinkedInA3ClientError(
            'CALLBACK_INVALID',
            'Invalid LinkedIn return URL.',
          ),
        };
      }

      if (
        !active ||
        parsed.transactionId !== active.transactionId
      ) {
        clearActive();
        return {
          status: 'failed',
          error: new LinkedInA3ClientError(
            'CALLBACK_MISMATCH',
            'LinkedIn return did not match the active transaction.',
          ),
        };
      }

      if (active.exchanged || active.signedIn) {
        clearActive();
        return {
          status: 'failed',
          error: new LinkedInA3ClientError(
            'OPERATION_IN_PROGRESS',
            'LinkedIn authentication result was already consumed.',
          ),
        };
      }

      const verifier = active.clientProofVerifier;
      const transactionId = active.transactionId;
      active.exchanged = true;

      let exchangeResult;
      try {
        exchangeResult = await client.exchange({
          transactionId,
          clientProofVerifier: verifier,
        });
      } catch (err) {
        clearActive();
        if (err instanceof LinkedInA3ClientError) {
          return { status: 'failed', error: err };
        }
        return {
          status: 'failed',
          error: new LinkedInA3ClientError(
            'CALLABLE_FAILED',
            'LinkedIn auth exchange failed.',
          ),
        };
      }

      // Clear verifier before sign-in; never retain after Exchange.
      if (active) {
        active.clientProofVerifier = '';
      }

      if (
        !exchangeResult.customToken ||
        typeof exchangeResult.customToken !== 'string'
      ) {
        clearActive();
        return {
          status: 'failed',
          error: new LinkedInA3ClientError(
            'CUSTOM_TOKEN_MISSING',
            'LinkedIn exchange did not return a session token.',
          ),
        };
      }

      if (active.signedIn) {
        clearActive();
        return {
          status: 'failed',
          error: new LinkedInA3ClientError(
            'OPERATION_IN_PROGRESS',
            'LinkedIn sign-in was already attempted.',
          ),
        };
      }
      active.signedIn = true;

      const token = exchangeResult.customToken;
      // Drop local reference to token after call.
      let session: LinkedInA3AuthSession;
      try {
        session = await deps.auth.signInWithCustomToken(token);
      } catch (err) {
        clearActive();
        return {
          status: 'failed',
          error: new LinkedInA3ClientError(
            'FIREBASE_SIGN_IN_FAILED',
            'Firebase sign-in failed after LinkedIn exchange.',
            err instanceof Error ? err.name : undefined,
          ),
        };
      }

      if (!session.uid) {
        clearActive();
        return {
          status: 'failed',
          error: new LinkedInA3ClientError(
            'FIREBASE_SIGN_IN_FAILED',
            'Firebase session was empty after LinkedIn sign-in.',
          ),
        };
      }

      if (startUid && startUid !== session.uid) {
        // Another session was present; still accept new LinkedIn uid if start was empty.
      }
      if (startUid && deps.auth.getCurrentUid() !== session.uid) {
        clearActive();
        return {
          status: 'failed',
          error: new LinkedInA3ClientError(
            'SESSION_CHANGED',
            'Firebase session changed during LinkedIn authentication.',
          ),
        };
      }

      clearActive();
      return { status: 'authenticated', session };
    } catch (err) {
      clearActive();
      if (err instanceof LinkedInA3ClientError) {
        return { status: 'failed', error: err };
      }
      return {
        status: 'failed',
        error: new LinkedInA3ClientError(
          'UNKNOWN',
          'LinkedIn authentication failed.',
        ),
      };
    } finally {
      clearActive();
    }
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

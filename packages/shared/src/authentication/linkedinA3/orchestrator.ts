/**
 * LinkedIn A3 browser auth orchestrator (I2 / I5).
 * Start → controlled auth session → parse return → Exchange → signInWithCustomToken.
 * Optional durable store holds one active transaction for kill/relaunch recovery.
 */

import { LINKEDIN_APP_RETURN_URL } from './environment/nearsyFirebaseEnvironment';
import type { LinkedInA3CallableClient } from './functions/linkedInA3CallableClient';
import {
  createClientProofPair,
  type ClientProofCrypto,
} from './clientProof';
import type { LinkedInAuthBrowser } from './browserSession';
import {
  linkedInA3DurablePersistence,
  type LinkedInA3DurableStore,
} from './durableTransactionStore';
import { isLinkedInTransactionExpired } from './expiresAt';
import { parseLinkedInMobileReturnUrl } from './returnUrl';
import type { LinkedInAuthProfileHints } from './types';
import {
  LinkedInA3ClientError,
  linkedInA3RetrySafe,
} from './sanitize';

export type LinkedInA3FlowStatus =
  | 'authenticated'
  | 'cancelled'
  | 'dismissed'
  | 'provider_error'
  | 'expired'
  | 'failed'
  | 'session_already_active';

export type LinkedInA3AuthSession = {
  uid: string;
  email: string | null;
};

type LinkedInA3TerminalMeta = {
  exchangeConsumed?: boolean;
  retrySafe?: boolean;
};

export type LinkedInA3FlowResult =
  | ({
      status: 'authenticated';
      session: LinkedInA3AuthSession;
      profileHints?: LinkedInAuthProfileHints;
    } & LinkedInA3TerminalMeta)
  | ({
      status: Exclude<LinkedInA3FlowStatus, 'authenticated'>;
      error?: LinkedInA3ClientError;
      providerErrorCode?: string;
    } & LinkedInA3TerminalMeta);

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
  durableStore?: LinkedInA3DurableStore;
  now?: () => number;
};

type ActiveAttempt = {
  transactionId: string;
  clientProofVerifier: string;
  expiresAt: number;
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

function terminal(
  partial: LinkedInA3FlowResult,
  exchangeConsumed = false,
): LinkedInA3FlowResult {
  return {
    ...partial,
    exchangeConsumed,
    retrySafe: linkedInA3RetrySafe({
      exchangeConsumed,
      status: partial.status,
    }),
  };
}

export async function runLinkedInA3BrowserAuthFlow(
  deps: LinkedInA3OrchestratorDeps,
): Promise<LinkedInA3FlowResult> {
  if (inFlight) {
    return terminal({
      status: 'session_already_active',
      error: new LinkedInA3ClientError(
        'OPERATION_IN_PROGRESS',
        'LinkedIn authentication is already in progress.',
      ),
    });
  }

  const now = deps.now ?? Date.now;
  const store = deps.durableStore;

  inFlight = (async () => {
    let startUid: string | null = null;
    let exchangeConsumed = false;
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
        if (err instanceof LinkedInA3ClientError) {
          const status = err.code === 'TX_EXPIRED' ? 'expired' : 'failed';
          return terminal({ status, error: err });
        }
        return terminal({
          status: 'failed',
          error: new LinkedInA3ClientError(
            'CALLABLE_FAILED',
            'LinkedIn auth start failed.',
          ),
        });
      }

      if (isLinkedInTransactionExpired(startResult.expiresAt, now())) {
        return terminal({
          status: 'expired',
          error: new LinkedInA3ClientError(
            'TX_EXPIRED',
            'LinkedIn authentication expired.',
          ),
        });
      }

      active = {
        transactionId: startResult.transactionId,
        clientProofVerifier: pair.clientProofVerifier,
        expiresAt: startResult.expiresAt,
        exchanged: false,
        signedIn: false,
      };
      void pair.clientProofChallenge;

      await linkedInA3DurablePersistence.persistSafely(store, {
        transactionId: startResult.transactionId,
        clientProofVerifier: pair.clientProofVerifier,
        expiresAt: startResult.expiresAt,
        startedAt: now(),
      });

      const browserOutcome = await deps.browser.openAuthSession(
        startResult.authorizationUrl,
        LINKEDIN_APP_RETURN_URL,
      );

      if (browserOutcome.type === 'cancel') {
        return terminal({ status: 'cancelled' });
      }
      if (browserOutcome.type === 'dismiss') {
        return terminal({ status: 'dismissed' });
      }
      if (
        browserOutcome.type === 'unavailable' ||
        browserOutcome.type === 'failed'
      ) {
        return terminal({
          status: 'failed',
          error: new LinkedInA3ClientError(
            'BROWSER_FAILED',
            'Unable to complete LinkedIn browser authentication.',
          ),
        });
      }

      if (active && isLinkedInTransactionExpired(active.expiresAt, now())) {
        return terminal({
          status: 'expired',
          error: new LinkedInA3ClientError(
            'TX_EXPIRED',
            'LinkedIn authentication expired.',
          ),
        });
      }

      const parsed = parseLinkedInMobileReturnUrl(browserOutcome.url);
      if (parsed.kind === 'provider_error') {
        if (parsed.errorCode === 'TX_EXPIRED') {
          return terminal({
            status: 'expired',
            providerErrorCode: parsed.errorCode,
            error: new LinkedInA3ClientError(
              'TX_EXPIRED',
              'LinkedIn authentication expired.',
              parsed.errorCode,
            ),
          });
        }
        return terminal({
          status: 'provider_error',
          providerErrorCode: parsed.errorCode,
          error: new LinkedInA3ClientError(
            'PROVIDER_CALLBACK_ERROR',
            'LinkedIn authentication was rejected.',
            parsed.errorCode,
          ),
        });
      }
      if (parsed.kind !== 'success') {
        return terminal({
          status: 'failed',
          error: new LinkedInA3ClientError(
            'CALLBACK_INVALID',
            'Invalid LinkedIn return URL.',
          ),
        });
      }

      if (!active || parsed.transactionId !== active.transactionId) {
        return terminal({
          status: 'failed',
          error: new LinkedInA3ClientError(
            'CALLBACK_MISMATCH',
            'LinkedIn return did not match the active transaction.',
          ),
        });
      }

      if (active.exchanged || active.signedIn) {
        return terminal({
          status: 'failed',
          error: new LinkedInA3ClientError(
            'OPERATION_IN_PROGRESS',
            'LinkedIn authentication result was already consumed.',
          ),
        });
      }

      const verifier = active.clientProofVerifier;
      const transactionId = active.transactionId;
      active.exchanged = true;
      exchangeConsumed = true;

      let exchangeResult;
      try {
        exchangeResult = await client.exchange({
          transactionId,
          clientProofVerifier: verifier,
        });
      } catch (err) {
        if (err instanceof LinkedInA3ClientError) {
          const status = err.code === 'TX_EXPIRED' ? 'expired' : 'failed';
          return terminal({ status, error: err }, true);
        }
        return terminal(
          {
            status: 'failed',
            error: new LinkedInA3ClientError(
              'CALLABLE_FAILED',
              'LinkedIn auth exchange failed.',
            ),
          },
          true,
        );
      }

      if (active) {
        active.clientProofVerifier = '';
      }

      if (
        !exchangeResult.customToken ||
        typeof exchangeResult.customToken !== 'string'
      ) {
        return terminal(
          {
            status: 'failed',
            error: new LinkedInA3ClientError(
              'CUSTOM_TOKEN_MISSING',
              'LinkedIn exchange did not return a session token.',
            ),
          },
          true,
        );
      }

      if (active.signedIn) {
        return terminal(
          {
            status: 'failed',
            error: new LinkedInA3ClientError(
              'OPERATION_IN_PROGRESS',
              'LinkedIn sign-in was already attempted.',
            ),
          },
          true,
        );
      }
      active.signedIn = true;

      const token = exchangeResult.customToken;
      let session: LinkedInA3AuthSession;
      try {
        session = await deps.auth.signInWithCustomToken(token);
      } catch (err) {
        return terminal(
          {
            status: 'failed',
            error: new LinkedInA3ClientError(
              'FIREBASE_SIGN_IN_FAILED',
              'Firebase sign-in failed after LinkedIn exchange.',
              err instanceof Error ? err.name : undefined,
            ),
          },
          true,
        );
      }

      if (!session.uid) {
        return terminal(
          {
            status: 'failed',
            error: new LinkedInA3ClientError(
              'FIREBASE_SIGN_IN_FAILED',
              'Firebase session was empty after LinkedIn sign-in.',
            ),
          },
          true,
        );
      }

      if (startUid && startUid !== session.uid) {
        // Another session was present; still accept new LinkedIn uid if start was empty.
      }
      if (startUid && deps.auth.getCurrentUid() !== session.uid) {
        return terminal(
          {
            status: 'failed',
            error: new LinkedInA3ClientError(
              'SESSION_CHANGED',
              'Firebase session changed during LinkedIn authentication.',
            ),
          },
          true,
        );
      }

      return terminal({
        status: 'authenticated',
        session,
        profileHints: exchangeResult.profileHints,
      });
    } catch (err) {
      if (err instanceof LinkedInA3ClientError) {
        return terminal(
          {
            status: err.code === 'TX_EXPIRED' ? 'expired' : 'failed',
            error: err,
          },
          exchangeConsumed,
        );
      }
      return terminal(
        {
          status: 'failed',
          error: new LinkedInA3ClientError(
            'UNKNOWN',
            'LinkedIn authentication failed.',
          ),
        },
        exchangeConsumed,
      );
    } finally {
      clearActive();
      await linkedInA3DurablePersistence.clearSafely(store);
    }
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

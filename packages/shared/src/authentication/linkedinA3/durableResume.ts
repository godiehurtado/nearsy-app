/**
 * Restore a LinkedIn A3 Exchange after process death using a return URL
 * (typically Linking.getInitialURL). Does not open a browser or call Start.
 *
 * App root wiring lives in packages/shared/src/App.tsx via attachLinkedInA3AppRootResume.
 */

import { isLinkedInTransactionExpired } from './expiresAt';
import type { LinkedInA3CallableClient } from './functions/linkedInA3CallableClient';
import {
  linkedInA3DurablePersistence,
  type LinkedInA3DurableStore,
} from './durableTransactionStore';
import {
  type LinkedInA3AuthSession,
  type LinkedInA3FirebaseAuthPort,
  type LinkedInA3FlowResult,
  getLinkedInA3OrchestratorBusy,
} from './orchestrator';
import { parseLinkedInMobileReturnUrl } from './returnUrl';
import {
  LinkedInA3ClientError,
  linkedInA3RetrySafe,
} from './sanitize';

export type LinkedInA3ResumeSkipReason =
  | 'no_initial_url'
  | 'unrelated'
  | 'no_persisted_transaction'
  | 'orchestrator_busy';

export type LinkedInA3ResumeResult =
  | { status: 'skipped'; reason: LinkedInA3ResumeSkipReason }
  | LinkedInA3FlowResult;

export type LinkedInA3ResumeDeps = {
  durableStore: LinkedInA3DurableStore;
  getClient: () => Promise<LinkedInA3CallableClient>;
  auth: LinkedInA3FirebaseAuthPort;
  now?: () => number;
  isOrchestratorBusy?: () => boolean;
};

let resumeInFlight = false;

export function clearLinkedInA3ResumeStateForTests(): void {
  resumeInFlight = false;
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

/**
 * Complete Exchange + Firebase sign-in from a persisted transaction + return URL.
 */
export async function resumeLinkedInA3FromReturnUrl(
  url: string,
  deps: LinkedInA3ResumeDeps,
): Promise<LinkedInA3ResumeResult> {
  if (resumeInFlight || (deps.isOrchestratorBusy ?? getLinkedInA3OrchestratorBusy)()) {
    return { status: 'skipped', reason: 'orchestrator_busy' };
  }

  const parsed = parseLinkedInMobileReturnUrl(url);
  if (parsed.kind === 'unrelated') {
    return { status: 'skipped', reason: 'unrelated' };
  }

  resumeInFlight = true;
  let exchangeConsumed = false;
  try {
    const persisted = await deps.durableStore.load();
    const now = deps.now ?? Date.now;

    if (!persisted) {
      return { status: 'skipped', reason: 'no_persisted_transaction' };
    }

    if (isLinkedInTransactionExpired(persisted.expiresAt, now())) {
      await linkedInA3DurablePersistence.clearSafely(deps.durableStore);
      return terminal({
        status: 'expired',
        error: new LinkedInA3ClientError(
          'TX_EXPIRED',
          'LinkedIn authentication expired.',
        ),
      });
    }

    if (parsed.kind === 'invalid') {
      await linkedInA3DurablePersistence.clearSafely(deps.durableStore);
      return terminal({
        status: 'failed',
        error: new LinkedInA3ClientError(
          'CALLBACK_INVALID',
          'Invalid LinkedIn return URL.',
        ),
      });
    }

    if (parsed.kind === 'provider_error') {
      await linkedInA3DurablePersistence.clearSafely(deps.durableStore);
      if (parsed.errorCode === 'TX_EXPIRED') {
        return terminal({
          status: 'expired',
          error: new LinkedInA3ClientError(
            'TX_EXPIRED',
            'LinkedIn authentication expired.',
            parsed.errorCode,
          ),
          providerErrorCode: parsed.errorCode,
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

    if (parsed.transactionId !== persisted.transactionId) {
      await linkedInA3DurablePersistence.clearSafely(deps.durableStore);
      return terminal({
        status: 'failed',
        error: new LinkedInA3ClientError(
          'CALLBACK_MISMATCH',
          'LinkedIn return did not match the persisted transaction.',
        ),
      });
    }

    const client = await deps.getClient();
    exchangeConsumed = true;
    let exchangeResult;
    try {
      exchangeResult = await client.exchange({
        transactionId: persisted.transactionId,
        clientProofVerifier: persisted.clientProofVerifier,
      });
    } catch (err) {
      await linkedInA3DurablePersistence.clearSafely(deps.durableStore);
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

    if (
      !exchangeResult.customToken ||
      typeof exchangeResult.customToken !== 'string'
    ) {
      await linkedInA3DurablePersistence.clearSafely(deps.durableStore);
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

    let session: LinkedInA3AuthSession;
    try {
      session = await deps.auth.signInWithCustomToken(exchangeResult.customToken);
    } catch (err) {
      await linkedInA3DurablePersistence.clearSafely(deps.durableStore);
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

    await linkedInA3DurablePersistence.clearSafely(deps.durableStore);
    return terminal({
      status: 'authenticated',
      session,
      profileHints: exchangeResult.profileHints,
    });
  } catch (err) {
    await linkedInA3DurablePersistence.clearSafely(deps.durableStore);
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
    resumeInFlight = false;
  }
}

/**
 * Launch-path helper. Used by attachLinkedInA3AppRootResume for cold start.
 */
export async function resumeLinkedInA3FromLaunchUrl(
  getInitialUrl: () => Promise<string | null>,
  deps: LinkedInA3ResumeDeps,
): Promise<LinkedInA3ResumeResult> {
  const url = await getInitialUrl();
  if (!url) {
    return { status: 'skipped', reason: 'no_initial_url' };
  }
  return resumeLinkedInA3FromReturnUrl(url, deps);
}

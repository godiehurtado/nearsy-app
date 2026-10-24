/**
 * X ownership connect flow (Own Profile pilot).
 * Does not change Firebase Auth session or link sign-in methods.
 * Never logs verifier, codes, state, or authorization URLs.
 */

import {
  createClientProofPair,
  type ClientProofCrypto,
} from '../../authentication/linkedinA3/clientProof';
import type { ProfileMode } from '../../profile/profileModeFields';
import type { XOwnershipAuthBrowser } from './browserSession';
import type { XOwnershipCallableClient } from './client';
import { logXOwnershipDev } from './devLog';
import { XOwnershipClientError, mapXOwnershipThrowable } from './errors';
import {
  resolveXOwnershipClientPlatform,
  X_OWNERSHIP_RETURN_URL,
} from './names';
import { parseXOwnershipReturnUrl } from './returnUrl';
import type { XOwnershipVerified } from './wireTypes';

export type XOwnershipConnectOutcome =
  | { kind: 'verified'; verified: XOwnershipVerified }
  | { kind: 'cancelled' }
  | { kind: 'error'; error: XOwnershipClientError };

export type XOwnershipControllerDeps = {
  client: XOwnershipCallableClient;
  browser: XOwnershipAuthBrowser;
  crypto: ClientProofCrypto;
  getUid: () => string | null;
  nowMs?: () => number;
};

type ActiveProof = {
  uid: string;
  transactionId: string;
  expectedMode: ProfileMode;
  clientProofVerifier: string;
  expiresAt: number;
};

function errorOutcome(
  err: unknown,
  stage: Parameters<typeof mapXOwnershipThrowable>[1],
): XOwnershipConnectOutcome {
  const error = mapXOwnershipThrowable(err, stage);
  logXOwnershipDev('stage_error', {
    stage: error.stage ?? stage ?? 'unknown',
    mappedCode: error.code,
    wireCode: error.wireCode ?? '',
    retryable: error.retryable,
  });
  return { kind: 'error', error };
}

export function createXOwnershipController(deps: XOwnershipControllerDeps) {
  let active: ActiveProof | null = null;

  function nowMs(): number {
    return deps.nowMs ? deps.nowMs() : Date.now();
  }

  function assertSameSession(expectedUid: string): void {
    const uid = deps.getUid();
    if (!uid || uid !== expectedUid) {
      throw new XOwnershipClientError(
        'SESSION_CHANGED',
        'Signed-in user changed during X ownership.',
        { stage: 'session' },
      );
    }
  }

  function clearActive(): void {
    if (active) {
      active.clientProofVerifier = '';
    }
    active = null;
  }

  return {
    clearActive,

    async connect(mode: ProfileMode): Promise<XOwnershipConnectOutcome> {
      clearActive();
      const uid = deps.getUid();
      if (!uid) {
        return errorOutcome(
          new XOwnershipClientError('UNAUTHENTICATED', 'Sign-in required.', {
            stage: 'session',
          }),
          'session',
        );
      }

      let pair: Awaited<ReturnType<typeof createClientProofPair>>;
      try {
        pair = await createClientProofPair(deps.crypto);
      } catch {
        return errorOutcome(
          new XOwnershipClientError(
            'CLIENT_PROOF_INVALID',
            'Could not create client proof.',
            { stage: 's256' },
          ),
          's256',
        );
      }

      const platform = resolveXOwnershipClientPlatform();

      let start;
      try {
        start = await deps.client.start({
          mode,
          platform,
          clientProofChallenge: pair.clientProofChallenge,
        });
      } catch (err) {
        pair.clientProofVerifier = '';
        return errorOutcome(err, 'start');
      }

      if (start.mode !== mode) {
        pair.clientProofVerifier = '';
        return errorOutcome(
          new XOwnershipClientError(
            'INVALID_RESPONSE',
            'X ownership Start mode mismatch.',
            { stage: 'start' },
          ),
          'start',
        );
      }

      void pair.clientProofChallenge;
      active = {
        uid,
        transactionId: start.transactionId,
        expectedMode: mode,
        clientProofVerifier: pair.clientProofVerifier,
        expiresAt: start.expiresAt,
      };

      const browserOutcome = await deps.browser.openAuthSession(
        start.authorizationUrl,
        X_OWNERSHIP_RETURN_URL,
      );

      if (browserOutcome.type === 'cancel') {
        clearActive();
        return { kind: 'cancelled' };
      }
      if (browserOutcome.type === 'dismiss') {
        clearActive();
        return errorOutcome(
          new XOwnershipClientError(
            'DISMISSED',
            'X ownership browser dismissed.',
            { stage: 'browser' },
          ),
          'browser',
        );
      }
      if (browserOutcome.type !== 'success') {
        clearActive();
        return errorOutcome(
          new XOwnershipClientError(
            'NETWORK',
            'X ownership browser failed.',
            { retryable: true, stage: 'browser' },
          ),
          'browser',
        );
      }

      try {
        assertSameSession(uid);
      } catch (err) {
        clearActive();
        return errorOutcome(err, 'session');
      }

      const parsed = parseXOwnershipReturnUrl(browserOutcome.url);
      if (parsed.kind !== 'success') {
        logXOwnershipDev('stage', {
          stage: 'return',
          status: 'end',
          returnKind: parsed.kind,
          returnReason:
            parsed.kind === 'invalid'
              ? parsed.reason
              : parsed.kind === 'provider_error'
                ? parsed.errorCode
                : '',
          hasTransactionId:
            parsed.kind === 'provider_error' && !!parsed.transactionId,
          hasMode: parsed.kind === 'provider_error' && !!parsed.mode,
        });
      }
      if (parsed.kind === 'provider_error') {
        clearActive();
        return errorOutcome(
          {
            code: parsed.errorCode,
            message: parsed.errorCode,
          },
          'return',
        );
      }
      if (parsed.kind !== 'success') {
        clearActive();
        return errorOutcome(
          new XOwnershipClientError(
            'TX_INVALID',
            'Invalid X ownership return.',
            { stage: 'return' },
          ),
          'return',
        );
      }
      if (parsed.transactionId !== start.transactionId) {
        clearActive();
        return errorOutcome(
          new XOwnershipClientError(
            'TX_INVALID',
            'X ownership transaction mismatch.',
            { stage: 'return' },
          ),
          'return',
        );
      }
      if (parsed.mode && parsed.mode !== mode) {
        logXOwnershipDev('stage', {
          stage: 'return',
          status: 'informational_mode_mismatch',
          startedMode: mode,
          echoMode: parsed.mode,
        });
      }
      if (nowMs() >= start.expiresAt) {
        clearActive();
        return errorOutcome(
          new XOwnershipClientError(
            'TX_EXPIRED',
            'X ownership transaction expired.',
            { retryable: true, stage: 'return' },
          ),
          'return',
        );
      }

      const verifier = active.clientProofVerifier;
      try {
        const exchange = await deps.client.exchange({
          transactionId: parsed.transactionId,
          clientProofVerifier: verifier,
        });
        if (exchange.mode !== mode) {
          clearActive();
          return errorOutcome(
            new XOwnershipClientError(
              'INVALID_RESPONSE',
              'X ownership verified mode mismatch.',
              { stage: 'exchange' },
            ),
            'exchange',
          );
        }
        clearActive();
        return { kind: 'verified', verified: exchange };
      } catch (err) {
        clearActive();
        return errorOutcome(err, 'exchange');
      }
    },
  };
}

export type XOwnershipController = ReturnType<typeof createXOwnershipController>;

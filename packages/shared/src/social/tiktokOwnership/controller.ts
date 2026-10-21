/**
 * TikTok ownership connect flow (Own Profile pilot).
 * Does not change Firebase Auth session or link sign-in methods.
 * Never logs verifier, codes, state, or authorization URLs.
 */

import {
  createClientProofPair,
  type ClientProofCrypto,
} from '../../authentication/linkedinA3/clientProof';
import type { ProfileMode } from '../../profile/profileModeFields';
import type { TiktokOwnershipAuthBrowser } from './browserSession';
import type { TiktokOwnershipCallableClient } from './client';
import { logTiktokOwnershipDev } from './devLog';
import {
  TiktokOwnershipClientError,
  mapTiktokOwnershipThrowable,
} from './errors';
import {
  resolveTiktokOwnershipClientPlatform,
  TIKTOK_OWNERSHIP_RETURN_URL,
} from './names';
import { parseTiktokOwnershipReturnUrl } from './returnUrl';
import type { TiktokOwnershipVerified } from './wireTypes';

export type TiktokOwnershipConnectOutcome =
  | { kind: 'verified'; verified: TiktokOwnershipVerified }
  | { kind: 'cancelled' }
  | { kind: 'error'; error: TiktokOwnershipClientError };

export type TiktokOwnershipControllerDeps = {
  client: TiktokOwnershipCallableClient;
  browser: TiktokOwnershipAuthBrowser;
  crypto: ClientProofCrypto;
  getUid: () => string | null;
};

type ActiveProof = {
  uid: string;
  transactionId: string;
  expectedMode: ProfileMode;
  clientProofVerifier: string;
};

function errorOutcome(
  err: unknown,
  stage: Parameters<typeof mapTiktokOwnershipThrowable>[1],
): TiktokOwnershipConnectOutcome {
  const error = mapTiktokOwnershipThrowable(err, stage);
  logTiktokOwnershipDev('stage_error', {
    stage: error.stage ?? stage ?? 'unknown',
    code: error.code,
    wireCode: error.wireCode ?? '',
    retryable: error.retryable,
  });
  return { kind: 'error', error };
}

export function createTiktokOwnershipController(
  deps: TiktokOwnershipControllerDeps,
) {
  let active: ActiveProof | null = null;

  function assertSameSession(expectedUid: string): void {
    const uid = deps.getUid();
    if (!uid || uid !== expectedUid) {
      throw new TiktokOwnershipClientError(
        'SESSION_CHANGED',
        'Signed-in user changed during TikTok ownership.',
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

    async connect(mode: ProfileMode): Promise<TiktokOwnershipConnectOutcome> {
      clearActive();
      const uid = deps.getUid();
      if (!uid) {
        return errorOutcome(
          new TiktokOwnershipClientError(
            'UNAUTHENTICATED',
            'Sign-in required.',
            { stage: 'session' },
          ),
          'session',
        );
      }

      let pair: Awaited<ReturnType<typeof createClientProofPair>>;
      try {
        pair = await createClientProofPair(deps.crypto);
      } catch {
        return errorOutcome(
          new TiktokOwnershipClientError(
            'CLIENT_PROOF_INVALID',
            'Could not create client proof.',
            { stage: 's256' },
          ),
          's256',
        );
      }

      const platform = resolveTiktokOwnershipClientPlatform();

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
          new TiktokOwnershipClientError(
            'INVALID_RESPONSE',
            'TikTok ownership Start mode mismatch.',
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
      };

      const browserOutcome = await deps.browser.openAuthSession(
        start.authorizationUrl,
        TIKTOK_OWNERSHIP_RETURN_URL,
      );

      if (browserOutcome.type === 'cancel') {
        clearActive();
        return { kind: 'cancelled' };
      }
      if (browserOutcome.type === 'dismiss') {
        clearActive();
        return errorOutcome(
          new TiktokOwnershipClientError(
            'DISMISSED',
            'TikTok ownership browser dismissed.',
            { stage: 'browser' },
          ),
          'browser',
        );
      }
      if (browserOutcome.type !== 'success') {
        clearActive();
        return errorOutcome(
          new TiktokOwnershipClientError(
            'NETWORK',
            'TikTok ownership browser failed.',
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

      const parsed = parseTiktokOwnershipReturnUrl(browserOutcome.url);
      if (parsed.kind !== 'success') {
        logTiktokOwnershipDev('stage', {
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
          new TiktokOwnershipClientError(
            'TX_INVALID',
            'Invalid TikTok ownership return.',
            { stage: 'return' },
          ),
          'return',
        );
      }
      if (parsed.transactionId !== start.transactionId) {
        clearActive();
        return errorOutcome(
          new TiktokOwnershipClientError(
            'TX_INVALID',
            'TikTok ownership transaction mismatch.',
            { stage: 'return' },
          ),
          'return',
        );
      }
      if (parsed.mode !== mode) {
        clearActive();
        return errorOutcome(
          new TiktokOwnershipClientError(
            'TX_INVALID',
            'TikTok ownership mode mismatch.',
            { stage: 'return' },
          ),
          'return',
        );
      }

      try {
        const exchange = await deps.client.exchange({
          transactionId: parsed.transactionId,
          clientProofVerifier: active.clientProofVerifier,
        });
        active.clientProofVerifier = '';

        if (exchange.mode !== mode) {
          clearActive();
          return errorOutcome(
            new TiktokOwnershipClientError(
              'INVALID_RESPONSE',
              'TikTok ownership verified mode mismatch.',
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

export type TiktokOwnershipController = ReturnType<
  typeof createTiktokOwnershipController
>;

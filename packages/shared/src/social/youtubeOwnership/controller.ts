/**
 * YouTube ownership connect flow (Own Profile pilot).
 * Does not change Firebase Auth session or link sign-in methods.
 * Never logs verifier, codes, or authorization URLs.
 */



import {
  createClientProofPair,
  type ClientProofCrypto,
} from '../../authentication/linkedinA3/clientProof';
import type { ProfileMode } from '../../profile/profileModeFields';
import type { YoutubeOwnershipAuthBrowser } from './browserSession';
import type { YoutubeOwnershipCallableClient } from './client';
import { logYoutubeOwnershipDev } from './devLog';
import {
  YoutubeOwnershipClientError,
  mapYoutubeOwnershipThrowable,
} from './errors';
import {
  resolveYoutubeOwnershipClientPlatform,
  YOUTUBE_OWNERSHIP_RETURN_URL,
} from './names';
import { parseYoutubeOwnershipReturnUrl } from './returnUrl';
import type {
  YoutubeOwnershipChannelCandidate,
  YoutubeOwnershipVerified,
} from './wireTypes';



export type YoutubeOwnershipConnectOutcome =
  | { kind: 'verified'; verified: YoutubeOwnershipVerified }
  | {
      kind: 'select_channel';
      transactionId: string;
      channels: YoutubeOwnershipChannelCandidate[];
      /** Resume SelectChannel with the same in-memory verifier context. */
      select: (channelId: string) => Promise<YoutubeOwnershipVerified>;
    }
  | { kind: 'cancelled' }
  | { kind: 'error'; error: YoutubeOwnershipClientError };



export type YoutubeOwnershipControllerDeps = {
  client: YoutubeOwnershipCallableClient;
  browser: YoutubeOwnershipAuthBrowser;
  crypto: ClientProofCrypto;
  /** Current Firebase UID when the flow starts; must match after browser return. */
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
  stage: Parameters<typeof mapYoutubeOwnershipThrowable>[1],
): YoutubeOwnershipConnectOutcome {
  const error = mapYoutubeOwnershipThrowable(err, stage);
  logYoutubeOwnershipDev('stage_error', {
    stage: error.stage ?? stage ?? 'unknown',
    code: error.code,
    wireCode: error.wireCode ?? '',
    retryable: error.retryable,
  });
  return { kind: 'error', error };
}



export function createYoutubeOwnershipController(
  deps: YoutubeOwnershipControllerDeps,
) {
  let active: ActiveProof | null = null;



  function assertSameSession(expectedUid: string): void {
    const uid = deps.getUid();
    if (!uid || uid !== expectedUid) {
      throw new YoutubeOwnershipClientError(
        'SESSION_CHANGED',
        'Signed-in user changed during YouTube ownership.',
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



  async function selectChannel(
    transactionId: string,
    channelId: string,
    expectedUid: string,
  ): Promise<YoutubeOwnershipVerified> {
    assertSameSession(expectedUid);
    if (!active || active.transactionId !== transactionId) {
      throw new YoutubeOwnershipClientError(
        'TX_INVALID',
        'YouTube ownership transaction is not active.',
        { stage: 'select' },
      );
    }
    try {
      logYoutubeOwnershipDev('stage', { stage: 'select', status: 'begin' });
      const verified = await deps.client.selectChannel({
        transactionId,
        channelId,
      });
      clearActive();
      logYoutubeOwnershipDev('stage', { stage: 'select', status: 'ok' });
      return verified;
    } catch (err) {
      clearActive();
      throw mapYoutubeOwnershipThrowable(err, 'select');
    }
  }



  return {
    clearActive,



    async connect(mode: ProfileMode): Promise<YoutubeOwnershipConnectOutcome> {
      clearActive();
      const uid = deps.getUid();
      if (!uid) {
        return errorOutcome(
          new YoutubeOwnershipClientError(
            'UNAUTHENTICATED',
            'Sign-in required.',
            { stage: 'session' },
          ),
          'session',
        );
      }



      let pair: Awaited<ReturnType<typeof createClientProofPair>>;
      try {
        logYoutubeOwnershipDev('stage', { stage: 's256', status: 'begin' });
        pair = await createClientProofPair(deps.crypto);
        logYoutubeOwnershipDev('stage', { stage: 's256', status: 'ok' });
      } catch {
        return errorOutcome(
          new YoutubeOwnershipClientError(
            'CLIENT_PROOF_INVALID',
            'Could not create client proof.',
            { stage: 's256' },
          ),
          's256',
        );
      }



      const platform = resolveYoutubeOwnershipClientPlatform();



      let start;
      try {
        logYoutubeOwnershipDev('stage', { stage: 'start', status: 'begin' });
        start = await deps.client.start({
          mode,
          platform,
          clientProofChallenge: pair.clientProofChallenge,
        });
        logYoutubeOwnershipDev('stage', {
          stage: 'start',
          status: 'ok',
          hasTransactionId: Boolean(start.transactionId),
        });
      } catch (err) {
        pair.clientProofVerifier = '';
        return errorOutcome(err, 'start');
      }



      if (start.mode !== mode) {
        pair.clientProofVerifier = '';
        return errorOutcome(
          new YoutubeOwnershipClientError(
            'INVALID_RESPONSE',
            'YouTube ownership Start mode mismatch.',
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



      logYoutubeOwnershipDev('stage', { stage: 'browser', status: 'begin' });
      const browserOutcome = await deps.browser.openAuthSession(
        start.authorizationUrl,
        YOUTUBE_OWNERSHIP_RETURN_URL,
      );
      logYoutubeOwnershipDev('stage', {
        stage: 'browser',
        status: browserOutcome.type === 'success' ? 'ok' : 'end',
        browserType: browserOutcome.type,
      });



      if (browserOutcome.type === 'cancel') {
        clearActive();
        return { kind: 'cancelled' };
      }
      if (browserOutcome.type === 'dismiss') {
        clearActive();
        return errorOutcome(
          new YoutubeOwnershipClientError(
            'DISMISSED',
            'YouTube ownership browser dismissed.',
            { stage: 'browser' },
          ),
          'browser',
        );
      }
      if (browserOutcome.type !== 'success') {
        clearActive();
        return errorOutcome(
          new YoutubeOwnershipClientError(
            'NETWORK',
            'YouTube ownership browser failed.',
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



      const parsed = parseYoutubeOwnershipReturnUrl(browserOutcome.url);
      logYoutubeOwnershipDev('stage', {
        stage: 'return',
        status: parsed.kind === 'success' ? 'ok' : 'end',
        returnKind: parsed.kind,
        returnReason:
          parsed.kind === 'invalid'
            ? parsed.reason
            : parsed.kind === 'provider_error'
              ? parsed.errorCode
              : '',
      });
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
          new YoutubeOwnershipClientError(
            'TX_INVALID',
            'Invalid YouTube ownership return.',
            { stage: 'return' },
          ),
          'return',
        );
      }
      if (parsed.transactionId !== start.transactionId) {
        clearActive();
        return errorOutcome(
          new YoutubeOwnershipClientError(
            'TX_INVALID',
            'YouTube ownership transaction mismatch.',
            { stage: 'return' },
          ),
          'return',
        );
      }
      if (parsed.mode !== mode) {
        clearActive();
        return errorOutcome(
          new YoutubeOwnershipClientError(
            'TX_INVALID',
            'YouTube ownership mode mismatch.',
            { stage: 'return' },
          ),
          'return',
        );
      }



      try {
        logYoutubeOwnershipDev('stage', { stage: 'exchange', status: 'begin' });
        const exchange = await deps.client.exchange({
          transactionId: parsed.transactionId,
          clientProofVerifier: active.clientProofVerifier,
        });
        active.clientProofVerifier = '';



        if (exchange.result === 'verified') {
          if (exchange.mode !== mode) {
            clearActive();
            return errorOutcome(
              new YoutubeOwnershipClientError(
                'INVALID_RESPONSE',
                'YouTube ownership verified mode mismatch.',
                { stage: 'exchange' },
              ),
              'exchange',
            );
          }
          clearActive();
          logYoutubeOwnershipDev('stage', {
            stage: 'exchange',
            status: 'ok',
            result: 'verified',
          });
          return { kind: 'verified', verified: exchange };
        }

        if (
          exchange.mode !== mode ||
          exchange.transactionId !== parsed.transactionId
        ) {
          clearActive();
          return errorOutcome(
            new YoutubeOwnershipClientError(
              'INVALID_RESPONSE',
              'YouTube ownership select_channel mode/tx mismatch.',
              { stage: 'exchange' },
            ),
            'exchange',
          );
        }

        const transactionId = parsed.transactionId;
        logYoutubeOwnershipDev('stage', {
          stage: 'exchange',
          status: 'ok',
          result: 'select_channel',
          channelCount: exchange.channels.length,
        });
        return {
          kind: 'select_channel',
          transactionId,
          channels: exchange.channels,
          select: (channelId: string) =>
            selectChannel(transactionId, channelId, uid),
        };
      } catch (err) {
        clearActive();
        return errorOutcome(err, 'exchange');
      }
    },
  };
}



export type YoutubeOwnershipController = ReturnType<
  typeof createYoutubeOwnershipController
>;


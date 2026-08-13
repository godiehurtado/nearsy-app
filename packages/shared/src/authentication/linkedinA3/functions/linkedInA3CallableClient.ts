/**
 * Neutral LinkedIn A3 callable client (RNFB Functions).
 * I1 enables Start smoke only; Exchange is typed but gated the same way.
 */

import { assertEnvironmentConsistency } from '../environment/assertEnvironmentConsistency';
import type { NearsyFirebaseEnvironmentConfig } from '../environment/nearsyFirebaseEnvironment';
import {
  LinkedInA3ClientError,
  toSanitizedCallableError,
} from '../sanitize';
import {
  assertLinkedInAuthExchangeInput,
  assertLinkedInAuthStartInput,
  assertLinkedInAuthStartResult,
  type LinkedInAuthExchangeInput,
  type LinkedInAuthExchangeResult,
  type LinkedInAuthStartInput,
  type LinkedInAuthStartResult,
} from '../types';
import type { AppCheckBootstrap } from '../appCheck/appCheckBootstrap';

export type CallableInvoker = (
  name: 'linkedinAuthStart' | 'linkedinAuthExchange',
  data: Record<string, unknown>,
) => Promise<unknown>;

export type LinkedInA3CallableClientDeps = {
  environment: NearsyFirebaseEnvironmentConfig;
  appCheck: AppCheckBootstrap;
  getNativeProjectId: () => string;
  getJsProjectId: () => string;
  invoke: CallableInvoker;
};

export function createLinkedInA3CallableClient(
  deps: LinkedInA3CallableClientDeps,
) {
  function assertReadyAndEnvironment(): void {
    if (!deps.environment.linkedInAuthEnabled) {
      throw new LinkedInA3ClientError(
        'LINKEDIN_DISABLED',
        'LinkedIn authentication is disabled in this environment.',
      );
    }

    const consistency = assertEnvironmentConsistency({
      environment: deps.environment.environment,
      expectedProjectId: deps.environment.firebaseProjectId,
      nativeProjectId: deps.getNativeProjectId(),
      jsProjectId: deps.getJsProjectId(),
      functionsRegion: deps.environment.functionsRegion,
      appCheckProvider: deps.environment.appCheckProvider,
    });

    if (!consistency.ok) {
      throw new LinkedInA3ClientError('ENV_INVALID', consistency.message);
    }

    deps.appCheck.ensureReady();
  }

  return {
    async start(
      input: LinkedInAuthStartInput,
    ): Promise<LinkedInAuthStartResult> {
      assertReadyAndEnvironment();
      try {
        assertLinkedInAuthStartInput(input);
      } catch {
        throw new LinkedInA3ClientError(
          'INVALID_ARGUMENT',
          'Invalid LinkedIn auth start input.',
        );
      }

      try {
        const data = await deps.invoke('linkedinAuthStart', {
          platform: input.platform,
          clientProofChallenge: input.clientProofChallenge,
          clientProofMethod: input.clientProofMethod,
        });
        try {
          return assertLinkedInAuthStartResult(data);
        } catch {
          throw new LinkedInA3ClientError(
            'INVALID_RESPONSE',
            'Invalid LinkedIn auth start response.',
          );
        }
      } catch (err) {
        if (err instanceof LinkedInA3ClientError) throw err;
        throw toSanitizedCallableError(err);
      }
    },

    /**
     * Typed for later phases. I1 must not invoke this in smoke.
     */
    async exchange(
      input: LinkedInAuthExchangeInput,
    ): Promise<LinkedInAuthExchangeResult> {
      assertReadyAndEnvironment();
      try {
        assertLinkedInAuthExchangeInput(input);
      } catch {
        throw new LinkedInA3ClientError(
          'INVALID_ARGUMENT',
          'Invalid LinkedIn auth exchange input.',
        );
      }

      try {
        const data = await deps.invoke('linkedinAuthExchange', {
          transactionId: input.transactionId,
          clientProofVerifier: input.clientProofVerifier,
        });
        if (!data || typeof data !== 'object') {
          throw new LinkedInA3ClientError(
            'INVALID_RESPONSE',
            'Invalid LinkedIn auth exchange response.',
          );
        }
        const customToken = (data as { customToken?: unknown }).customToken;
        if (typeof customToken !== 'string' || customToken.length < 8) {
          throw new LinkedInA3ClientError(
            'INVALID_RESPONSE',
            'Invalid LinkedIn auth exchange response.',
          );
        }
        return { customToken };
      } catch (err) {
        if (err instanceof LinkedInA3ClientError) throw err;
        throw toSanitizedCallableError(err);
      }
    },
  };
}

export type LinkedInA3CallableClient = ReturnType<
  typeof createLinkedInA3CallableClient
>;

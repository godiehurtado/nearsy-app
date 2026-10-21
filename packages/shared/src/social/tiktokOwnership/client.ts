import { CLIENT_PROOF_METHOD_S256 } from '../../authentication/linkedinA3/clientProof';
import { logTiktokOwnershipDev } from './devLog';
import {
  mapTiktokOwnershipThrowable,
  TiktokOwnershipClientError,
} from './errors';
import {
  TIKTOK_OWNERSHIP_CALLABLE_NAMES,
  type TiktokOwnershipClientPlatform,
  type TiktokOwnershipMode,
} from './names';
import {
  assertTiktokOwnershipExchangeRequest,
  assertTiktokOwnershipExchangeResponse,
  assertTiktokOwnershipGetRequest,
  assertTiktokOwnershipGetResponse,
  assertTiktokOwnershipStartRequest,
  assertTiktokOwnershipStartResponse,
  assertTiktokOwnershipUnlinkRequest,
  assertTiktokOwnershipUnlinked,
} from './parse';
import type {
  TiktokOwnershipExchangeRequest,
  TiktokOwnershipExchangeResponse,
  TiktokOwnershipGetResponse,
  TiktokOwnershipStartResponse,
  TiktokOwnershipUnlinked,
} from './wireTypes';

export type TiktokOwnershipInvoker = (
  name: string,
  data: Record<string, unknown>,
) => Promise<unknown>;

export type TiktokOwnershipStartInput = {
  mode: TiktokOwnershipMode;
  platform: TiktokOwnershipClientPlatform;
  clientProofChallenge: string;
};

export type TiktokOwnershipCallableClient = {
  start: (input: TiktokOwnershipStartInput) => Promise<TiktokOwnershipStartResponse>;
  exchange: (
    input: TiktokOwnershipExchangeRequest,
  ) => Promise<TiktokOwnershipExchangeResponse>;
  get: (mode: TiktokOwnershipMode) => Promise<TiktokOwnershipGetResponse>;
  unlink: (mode: TiktokOwnershipMode) => Promise<TiktokOwnershipUnlinked>;
};

export function createTiktokOwnershipCallableClient(
  invoke: TiktokOwnershipInvoker,
): TiktokOwnershipCallableClient {
  return {
    async start(input) {
      try {
        const request = assertTiktokOwnershipStartRequest({
          mode: input.mode,
          platform: input.platform,
          clientProofChallenge: input.clientProofChallenge,
          clientProofMethod: CLIENT_PROOF_METHOD_S256,
        });
        const data = await invoke(TIKTOK_OWNERSHIP_CALLABLE_NAMES.start, {
          mode: request.mode,
          platform: request.platform,
          clientProofChallenge: request.clientProofChallenge,
          clientProofMethod: request.clientProofMethod,
        });
        try {
          return assertTiktokOwnershipStartResponse(data);
        } catch (parseErr) {
          const keys =
            data && typeof data === 'object' && !Array.isArray(data)
              ? Object.keys(data as object).sort().join(',')
              : '';
          const expiresAtType =
            data && typeof data === 'object' && !Array.isArray(data)
              ? typeof (data as { expiresAt?: unknown }).expiresAt
              : 'missing';
          logTiktokOwnershipDev('start_response_parse_error', {
            stage: 'start',
            parseReason:
              parseErr instanceof Error ? parseErr.message : 'UNKNOWN',
            keys,
            expiresAtType,
            hasAuthorizationUrl:
              data &&
              typeof data === 'object' &&
              typeof (data as { authorizationUrl?: unknown }).authorizationUrl ===
                'string',
            hasTransactionId:
              data &&
              typeof data === 'object' &&
              typeof (data as { transactionId?: unknown }).transactionId ===
                'string',
          });
          throw parseErr;
        }
      } catch (err) {
        if (err instanceof TiktokOwnershipClientError) throw err;
        throw mapTiktokOwnershipThrowable(err, 'start');
      }
    },

    async exchange(input) {
      try {
        const request = assertTiktokOwnershipExchangeRequest(input);
        const data = await invoke(TIKTOK_OWNERSHIP_CALLABLE_NAMES.exchange, {
          transactionId: request.transactionId,
          clientProofVerifier: request.clientProofVerifier,
        });
        return assertTiktokOwnershipExchangeResponse(data);
      } catch (err) {
        if (err instanceof TiktokOwnershipClientError) throw err;
        throw mapTiktokOwnershipThrowable(err, 'exchange');
      }
    },

    async get(mode) {
      try {
        const request = assertTiktokOwnershipGetRequest({ mode });
        const data = await invoke(TIKTOK_OWNERSHIP_CALLABLE_NAMES.get, {
          mode: request.mode,
        });
        return assertTiktokOwnershipGetResponse(data);
      } catch (err) {
        if (err instanceof TiktokOwnershipClientError) throw err;
        throw mapTiktokOwnershipThrowable(err, 'foundation');
      }
    },

    async unlink(mode) {
      try {
        const request = assertTiktokOwnershipUnlinkRequest({ mode });
        const data = await invoke(TIKTOK_OWNERSHIP_CALLABLE_NAMES.unlink, {
          mode: request.mode,
        });
        return assertTiktokOwnershipUnlinked(data);
      } catch (err) {
        if (err instanceof TiktokOwnershipClientError) throw err;
        throw mapTiktokOwnershipThrowable(err, 'foundation');
      }
    },
  };
}

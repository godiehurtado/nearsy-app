import { CLIENT_PROOF_METHOD_S256 } from '../../authentication/linkedinA3/clientProof';
import { logXOwnershipDev } from './devLog';
import { mapXOwnershipThrowable, XOwnershipClientError } from './errors';
import {
  X_OWNERSHIP_CALLABLE_NAMES,
  type XOwnershipClientPlatform,
  type XOwnershipMode,
} from './names';
import {
  assertXOwnershipExchangeRequest,
  assertXOwnershipExchangeResponse,
  assertXOwnershipGetRequest,
  assertXOwnershipGetResponse,
  assertXOwnershipStartRequest,
  assertXOwnershipStartResponse,
  assertXOwnershipUnlinkRequest,
  assertXOwnershipUnlinked,
} from './parse';
import type {
  XOwnershipExchangeRequest,
  XOwnershipExchangeResponse,
  XOwnershipGetResponse,
  XOwnershipStartResponse,
  XOwnershipUnlinked,
} from './wireTypes';

export type XOwnershipInvoker = (
  name: string,
  data: Record<string, unknown>,
) => Promise<unknown>;

export type XOwnershipStartInput = {
  mode: XOwnershipMode;
  platform: XOwnershipClientPlatform;
  clientProofChallenge: string;
};

export type XOwnershipCallableClient = {
  start: (input: XOwnershipStartInput) => Promise<XOwnershipStartResponse>;
  exchange: (input: XOwnershipExchangeRequest) => Promise<XOwnershipExchangeResponse>;
  get: (mode: XOwnershipMode) => Promise<XOwnershipGetResponse>;
  unlink: (mode: XOwnershipMode) => Promise<XOwnershipUnlinked>;
};

export function createXOwnershipCallableClient(
  invoke: XOwnershipInvoker,
): XOwnershipCallableClient {
  return {
    async start(input) {
      try {
        const request = assertXOwnershipStartRequest({
          mode: input.mode,
          platform: input.platform,
          clientProofChallenge: input.clientProofChallenge,
          clientProofMethod: CLIENT_PROOF_METHOD_S256,
        });
        const data = await invoke(X_OWNERSHIP_CALLABLE_NAMES.start, {
          mode: request.mode,
          platform: request.platform,
          clientProofChallenge: request.clientProofChallenge,
          clientProofMethod: request.clientProofMethod,
        });
        try {
          return assertXOwnershipStartResponse(data);
        } catch (parseErr) {
          const keys =
            data && typeof data === 'object' && !Array.isArray(data)
              ? Object.keys(data as object).sort().join(',')
              : '';
          const expiresAtType =
            data && typeof data === 'object' && !Array.isArray(data)
              ? typeof (data as { expiresAt?: unknown }).expiresAt
              : 'missing';
          logXOwnershipDev('start_response_parse_error', {
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
        if (err instanceof XOwnershipClientError) throw err;
        throw mapXOwnershipThrowable(err, 'start');
      }
    },

    async exchange(input) {
      try {
        const request = assertXOwnershipExchangeRequest(input);
        const data = await invoke(X_OWNERSHIP_CALLABLE_NAMES.exchange, {
          transactionId: request.transactionId,
          clientProofVerifier: request.clientProofVerifier,
        });
        return assertXOwnershipExchangeResponse(data);
      } catch (err) {
        if (err instanceof XOwnershipClientError) throw err;
        throw mapXOwnershipThrowable(err, 'exchange');
      }
    },

    async get(mode) {
      try {
        const request = assertXOwnershipGetRequest({ mode });
        const data = await invoke(X_OWNERSHIP_CALLABLE_NAMES.get, {
          mode: request.mode,
        });
        return assertXOwnershipGetResponse(data);
      } catch (err) {
        if (err instanceof XOwnershipClientError) throw err;
        throw mapXOwnershipThrowable(err, 'foundation');
      }
    },

    async unlink(mode) {
      try {
        const request = assertXOwnershipUnlinkRequest({ mode });
        const data = await invoke(X_OWNERSHIP_CALLABLE_NAMES.unlink, {
          mode: request.mode,
        });
        return assertXOwnershipUnlinked(data);
      } catch (err) {
        if (err instanceof XOwnershipClientError) throw err;
        throw mapXOwnershipThrowable(err, 'foundation');
      }
    },
  };
}

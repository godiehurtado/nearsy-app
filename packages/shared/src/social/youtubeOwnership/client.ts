import { CLIENT_PROOF_METHOD_S256 } from '../../authentication/linkedinA3/clientProof';
import { logYoutubeOwnershipDev } from './devLog';
import {
  mapYoutubeOwnershipThrowable,
  YoutubeOwnershipClientError,
} from './errors';
import {
  YOUTUBE_OWNERSHIP_CALLABLE_NAMES,
  type YoutubeOwnershipClientPlatform,
  type YoutubeOwnershipMode,
} from './names';
import {
  assertClientProofVerifier,
  assertYoutubeOwnershipExchangeRequest,
  assertYoutubeOwnershipExchangeResponse,
  assertYoutubeOwnershipGetRequest,
  assertYoutubeOwnershipGetResponse,
  assertYoutubeOwnershipSelectChannelRequest,
  assertYoutubeOwnershipStartRequest,
  assertYoutubeOwnershipStartResponse,
  assertYoutubeOwnershipUnlinkRequest,
  assertYoutubeOwnershipUnlinked,
  assertYoutubeOwnershipVerified,
} from './parse';
import type {
  YoutubeOwnershipExchangeRequest,
  YoutubeOwnershipExchangeResponse,
  YoutubeOwnershipGetResponse,
  YoutubeOwnershipSelectChannelRequest,
  YoutubeOwnershipStartResponse,
  YoutubeOwnershipUnlinked,
  YoutubeOwnershipVerified,
} from './wireTypes';



export type YoutubeOwnershipInvoker = (
  name: string,
  data: Record<string, unknown>,
) => Promise<unknown>;



export type YoutubeOwnershipStartInput = {
  mode: YoutubeOwnershipMode;
  platform: YoutubeOwnershipClientPlatform;
  clientProofChallenge: string;
};



export type YoutubeOwnershipCallableClient = {
  start: (input: YoutubeOwnershipStartInput) => Promise<YoutubeOwnershipStartResponse>;
  exchange: (
    input: YoutubeOwnershipExchangeRequest,
  ) => Promise<YoutubeOwnershipExchangeResponse>;
  selectChannel: (
    input: YoutubeOwnershipSelectChannelRequest,
  ) => Promise<YoutubeOwnershipVerified>;
  get: (mode: YoutubeOwnershipMode) => Promise<YoutubeOwnershipGetResponse>;
  unlink: (mode: YoutubeOwnershipMode) => Promise<YoutubeOwnershipUnlinked>;
};



export function createYoutubeOwnershipCallableClient(
  invoke: YoutubeOwnershipInvoker,
): YoutubeOwnershipCallableClient {
  return {
    async start(input) {
      try {
        const request = assertYoutubeOwnershipStartRequest({
          mode: input.mode,
          platform: input.platform,
          clientProofChallenge: input.clientProofChallenge,
          clientProofMethod: CLIENT_PROOF_METHOD_S256,
        });
        const data = await invoke(YOUTUBE_OWNERSHIP_CALLABLE_NAMES.start, {
          mode: request.mode,
          platform: request.platform,
          clientProofChallenge: request.clientProofChallenge,
          clientProofMethod: request.clientProofMethod,
        });
        try {
          return assertYoutubeOwnershipStartResponse(data);
        } catch (parseErr) {
          const keys =
            data && typeof data === 'object' && !Array.isArray(data)
              ? Object.keys(data as object).sort().join(',')
              : '';
          const expiresAtType =
            data && typeof data === 'object' && !Array.isArray(data)
              ? typeof (data as { expiresAt?: unknown }).expiresAt
              : 'missing';
          logYoutubeOwnershipDev('start_response_parse_error', {
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
        if (err instanceof YoutubeOwnershipClientError) throw err;
        throw mapYoutubeOwnershipThrowable(err, 'start');
      }
    },



    async exchange(input) {
      try {
        const request = assertYoutubeOwnershipExchangeRequest(input);
        const data = await invoke(YOUTUBE_OWNERSHIP_CALLABLE_NAMES.exchange, {
          transactionId: request.transactionId,
          clientProofVerifier: request.clientProofVerifier,
        });
        return assertYoutubeOwnershipExchangeResponse(data);
      } catch (err) {
        if (err instanceof YoutubeOwnershipClientError) throw err;
        throw mapYoutubeOwnershipThrowable(err);
      }
    },



    async selectChannel(input) {
      try {
        const request = assertYoutubeOwnershipSelectChannelRequest(input);
        const data = await invoke(
          YOUTUBE_OWNERSHIP_CALLABLE_NAMES.selectChannel,
          {
            transactionId: request.transactionId,
            channelId: request.channelId,
          },
        );
        return assertYoutubeOwnershipVerified(data);
      } catch (err) {
        if (err instanceof YoutubeOwnershipClientError) throw err;
        throw mapYoutubeOwnershipThrowable(err);
      }
    },



    async get(mode) {
      try {
        const request = assertYoutubeOwnershipGetRequest({ mode });
        const data = await invoke(YOUTUBE_OWNERSHIP_CALLABLE_NAMES.get, {
          mode: request.mode,
        });
        return assertYoutubeOwnershipGetResponse(data);
      } catch (err) {
        if (err instanceof YoutubeOwnershipClientError) throw err;
        throw mapYoutubeOwnershipThrowable(err, 'foundation');
      }
    },

    async unlink(mode) {
      try {
        const request = assertYoutubeOwnershipUnlinkRequest({ mode });
        const data = await invoke(YOUTUBE_OWNERSHIP_CALLABLE_NAMES.unlink, {
          mode: request.mode,
        });
        return assertYoutubeOwnershipUnlinked(data);
      } catch (err) {
        if (err instanceof YoutubeOwnershipClientError) throw err;
        throw mapYoutubeOwnershipThrowable(err, 'foundation');
      }
    },
  };
}


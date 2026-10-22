import { logInstagramOwnershipDev } from './devLog';
import {
  mapInstagramOwnershipThrowable,
  InstagramOwnershipClientError,
} from './errors';
import {
  INSTAGRAM_OWNERSHIP_CALLABLE_NAMES,
  type InstagramOwnershipClientPlatform,
  type InstagramOwnershipMode,
} from './names';
import {
  assertInstagramInboxAuthorizeStartRequest,
  assertInstagramInboxAuthorizeStartResponse,
  assertInstagramOwnershipGetRequest,
  assertInstagramOwnershipGetResponse,
  assertInstagramOwnershipStartRequest,
  assertInstagramOwnershipStartResponse,
  assertInstagramOwnershipUnlinkRequest,
  assertInstagramOwnershipUnlinked,
} from './parse';
import type {
  InstagramInboxAuthorizeStartResponse,
  InstagramOwnershipGetResponse,
  InstagramOwnershipStartResponse,
  InstagramOwnershipUnlinked,
} from './wireTypes';

export type InstagramOwnershipInvoker = (
  name: string,
  data: Record<string, unknown>,
) => Promise<unknown>;

export type InstagramOwnershipStartInput = {
  mode: InstagramOwnershipMode;
  platform: InstagramOwnershipClientPlatform;
};

export type InstagramOwnershipCallableClient = {
  start: (
    input: InstagramOwnershipStartInput,
  ) => Promise<InstagramOwnershipStartResponse>;
  get: (mode: InstagramOwnershipMode) => Promise<InstagramOwnershipGetResponse>;
  unlink: (mode: InstagramOwnershipMode) => Promise<InstagramOwnershipUnlinked>;
  startInboxAuthorize: () => Promise<InstagramInboxAuthorizeStartResponse>;
};

export function createInstagramOwnershipCallableClient(
  invoke: InstagramOwnershipInvoker,
): InstagramOwnershipCallableClient {
  return {
    async start(input) {
      try {
        const request = assertInstagramOwnershipStartRequest({
          mode: input.mode,
          platform: input.platform,
        });
        const data = await invoke(INSTAGRAM_OWNERSHIP_CALLABLE_NAMES.start, {
          mode: request.mode,
          platform: request.platform,
        });
        try {
          return assertInstagramOwnershipStartResponse(data);
        } catch (parseErr) {
          const keys =
            data && typeof data === 'object' && !Array.isArray(data)
              ? Object.keys(data as object).sort().join(',')
              : '';
          logInstagramOwnershipDev('start_response_parse_error', {
            stage: 'start',
            parseReason:
              parseErr instanceof Error ? parseErr.message : 'UNKNOWN',
            keys,
            hasCode:
              data &&
              typeof data === 'object' &&
              typeof (data as { code?: unknown }).code === 'string',
            hasChallengeId:
              data &&
              typeof data === 'object' &&
              typeof (data as { challengeId?: unknown }).challengeId ===
                'string',
          });
          throw parseErr;
        }
      } catch (err) {
        if (err instanceof InstagramOwnershipClientError) throw err;
        throw mapInstagramOwnershipThrowable(err, 'start');
      }
    },

    async get(mode) {
      try {
        const request = assertInstagramOwnershipGetRequest({ mode });
        const data = await invoke(INSTAGRAM_OWNERSHIP_CALLABLE_NAMES.get, {
          mode: request.mode,
        });
        return assertInstagramOwnershipGetResponse(data);
      } catch (err) {
        if (err instanceof InstagramOwnershipClientError) throw err;
        throw mapInstagramOwnershipThrowable(err, 'get');
      }
    },

    async unlink(mode) {
      try {
        const request = assertInstagramOwnershipUnlinkRequest({ mode });
        const data = await invoke(INSTAGRAM_OWNERSHIP_CALLABLE_NAMES.unlink, {
          mode: request.mode,
        });
        return assertInstagramOwnershipUnlinked(data);
      } catch (err) {
        if (err instanceof InstagramOwnershipClientError) throw err;
        throw mapInstagramOwnershipThrowable(err, 'unlink');
      }
    },

    async startInboxAuthorize() {
      try {
        const request = assertInstagramInboxAuthorizeStartRequest({});
        const data = await invoke(
          INSTAGRAM_OWNERSHIP_CALLABLE_NAMES.inboxAuthorizeStart,
          request,
        );
        try {
          return assertInstagramInboxAuthorizeStartResponse(data);
        } catch (parseErr) {
          logInstagramOwnershipDev('inbox_authorize_parse_error', {
            stage: 'inboxAuthorize',
            parseReason:
              parseErr instanceof Error ? parseErr.message : 'UNKNOWN',
          });
          throw parseErr;
        }
      } catch (err) {
        if (err instanceof InstagramOwnershipClientError) throw err;
        throw mapInstagramOwnershipThrowable(err, 'inboxAuthorize');
      }
    },
  };
}

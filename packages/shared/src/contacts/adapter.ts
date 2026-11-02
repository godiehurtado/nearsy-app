import { CONTACTS_HMAC_CALLABLE_NAMES } from './domain';
import {
  ContactsHmacClientError,
  parseContactsHmacFailReason,
} from './errors';
import {
  assertSyncRequestShape,
  parseContactsWireResult,
} from './parse';
import type { ContactsHmacClient } from './port';
import type {
  DisableContactsSyncRequest,
  EnableContactsSyncRequest,
  RefreshVerifiedActorKeysRequest,
  RemoveContactSourceRequest,
  SyncContactHashesRequest,
} from './wireTypes';

export type ContactsHmacInvoke = (
  name: string,
  data: Record<string, unknown>,
) => Promise<unknown>;

function mapInvokeError(err: unknown): never {
  if (err instanceof ContactsHmacClientError) throw err;
  const reason = parseContactsHmacFailReason(err) ?? 'contacts-invalid-response';
  throw new ContactsHmacClientError(
    reason,
    'Contacts Identity callable failed.',
    reason === 'contacts-rate-limited' || reason === 'contacts-hmac-unavailable',
  );
}

export function createContactsHmacCallableClient(input: {
  invoke: ContactsHmacInvoke;
}): ContactsHmacClient {
  const invoke = async (
    name: string,
    data: Record<string, unknown>,
  ) => {
    try {
      return parseContactsWireResult(await input.invoke(name, data));
    } catch (err) {
      mapInvokeError(err);
    }
  };

  return {
    enableContactsSync(request: EnableContactsSyncRequest) {
      return invoke(CONTACTS_HMAC_CALLABLE_NAMES.enableContactsSync, request);
    },
    syncContactHashes(request: SyncContactHashesRequest) {
      assertSyncRequestShape(request);
      return invoke(
        CONTACTS_HMAC_CALLABLE_NAMES.syncContactHashes,
        request as unknown as Record<string, unknown>,
      );
    },
    disableContactsSync(request: DisableContactsSyncRequest) {
      return invoke(
        CONTACTS_HMAC_CALLABLE_NAMES.disableContactsSync,
        request as unknown as Record<string, unknown>,
      );
    },
    removeContactSource(request: RemoveContactSourceRequest) {
      return invoke(
        CONTACTS_HMAC_CALLABLE_NAMES.removeContactSource,
        request as unknown as Record<string, unknown>,
      );
    },
    refreshVerifiedActorKeys(request: RefreshVerifiedActorKeysRequest) {
      return invoke(
        CONTACTS_HMAC_CALLABLE_NAMES.refreshVerifiedActorKeys,
        request,
      );
    },
  };
}

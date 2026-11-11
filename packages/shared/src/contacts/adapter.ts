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
  const wrapped = new ContactsHmacClientError(
    reason,
    'Contacts Identity callable failed.',
    reason === 'contacts-rate-limited' || reason === 'contacts-hmac-unavailable',
  );
  // Kept for the diagnostic kind only; callers use the reason above.
  (wrapped as ContactsHmacClientError & { cause?: unknown }).cause = err;
  throw wrapped;
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
      // Never send `{}`: at epoch > 0 Identity rejects it with no write.
      if (!Number.isInteger(request.contactsEpoch) || request.contactsEpoch < 0) {
        return Promise.reject(
          new ContactsHmacClientError(
            'contacts-epoch-required',
            'Enable requires the live contactsEpoch.',
          ),
        );
      }
      return invoke(
        CONTACTS_HMAC_CALLABLE_NAMES.enableContactsSync,
        request as unknown as Record<string, unknown>,
      );
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

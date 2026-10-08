/**
 * Non-Android stub — the Android Delete Account flow lives in
 * deleteAccount.android.ts. The type-only import keeps signatures in parity.
 */
import type * as DeleteAccountAndroid from './deleteAccount.android';
import { deleteAccountMessageKey } from './deleteAccountCore';

type DeleteAccountApi = typeof DeleteAccountAndroid;

const unavailable = async () =>
  ({
    status: 'failed',
    kind: 'method_unavailable',
    messageKey: deleteAccountMessageKey('method_unavailable'),
  }) as const;

export const getDeleteAccountOptions: DeleteAccountApi['getDeleteAccountOptions'] =
  () => ({ methods: [], recentSessionOnly: false });

export const deleteMyAccountWithReauth: DeleteAccountApi['deleteMyAccountWithReauth'] =
  Object.assign(unavailable, {
    resolvePending: unavailable,
    leavePending: async () => undefined,
  });

export const resolvePendingAccountDeletion: DeleteAccountApi['resolvePendingAccountDeletion'] =
  unavailable;

export const leavePendingAccountDeletion: DeleteAccountApi['leavePendingAccountDeletion'] =
  async () => undefined;

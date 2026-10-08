/**
 * Non-Android stub — the Android Delete Account flow lives in
 * deleteAccount.android.ts. The type-only import keeps signatures in parity.
 */
import type * as DeleteAccountAndroid from './deleteAccount.android';
import { deleteAccountMessageKey } from './deleteAccountCore';

type DeleteAccountApi = typeof DeleteAccountAndroid;

export const getDeleteAccountOptions: DeleteAccountApi['getDeleteAccountOptions'] =
  () => ({ methods: [], recentSessionOnly: false });

export const deleteMyAccountWithReauth: DeleteAccountApi['deleteMyAccountWithReauth'] =
  async () => ({
    status: 'failed',
    kind: 'method_unavailable',
    messageKey: deleteAccountMessageKey('method_unavailable'),
  });

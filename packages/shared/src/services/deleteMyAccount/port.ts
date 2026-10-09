import type { DeleteMyAccountSuccess } from './contract';

export type DeleteMyAccountPort = {
  /**
   * Invoke `deleteMyAccount` once for `expectedUid`. Rejects with
   * `DeleteMyAccountError` and never retries on its own.
   */
  deleteMyAccount: (input: { expectedUid: string }) => Promise<DeleteMyAccountSuccess>;
};

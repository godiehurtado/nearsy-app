export type AccountDeletionReauthErrorCode =
  | 'CANCELLED'
  | 'IDENTITY_MISMATCH'
  | 'UNAVAILABLE'
  | 'REAUTH_FAILED'
  | 'WRONG_PASSWORD'
  | 'NETWORK'
  | 'IN_PROGRESS'
  | 'NOT_AUTHENTICATED';

export class AccountDeletionReauthError extends Error {
  readonly code: AccountDeletionReauthErrorCode;
  readonly messageKey: string;

  constructor(code: AccountDeletionReauthErrorCode, messageKey: string, message?: string) {
    super(message ?? messageKey);
    this.name = 'AccountDeletionReauthError';
    this.code = code;
    this.messageKey = messageKey;
  }
}

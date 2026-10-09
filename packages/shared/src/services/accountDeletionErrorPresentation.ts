/**
 * Safe user-facing mapping for account deletion failures.
 * Uses only `DeleteMyAccountError.kind` / reauth `messageKey`; Firebase and
 * backend messages are never surfaced.
 */
import { AccountDeletionReauthError } from './deletionReauth/accountDeletionReauthError';
import type { DeletionReauthMethod } from './deletionReauth/deletionReauthMethod';
import { LINKEDIN_DELETION_SIGN_IN_AGAIN_KEY } from './deletionReauth/linkedInDeletionPolicy';
import {
  isDeleteMyAccountError,
  type DeleteMyAccountFailureKind,
} from './deleteMyAccount/contract';

const MESSAGE_KEY_BY_KIND: Record<DeleteMyAccountFailureKind, string> = {
  RECENT_LOGIN_REQUIRED: 'settings.deleteAccount.sessionNotRecent',
  APP_CHECK: 'settings.deleteAccount.appCheckFailed',
  UNAUTHENTICATED: 'settings.deleteAccount.signedOut',
  IDENTITY_CHANGED: 'settings.deleteAccount.reauthMismatch',
  IN_PROGRESS: 'settings.deleteAccount.inProgress',
  DELETION_RETRYABLE: 'settings.deleteAccount.retryable',
  DELETION_FAILED: 'settings.deleteAccount.failed',
  NETWORK_UNCERTAIN: 'settings.deleteAccount.networkUncertain',
  UNKNOWN: 'settings.deleteAccount.error',
};

export function resolveDeleteMyAccountMessageKey(kind: DeleteMyAccountFailureKind): string {
  return MESSAGE_KEY_BY_KIND[kind] ?? 'settings.deleteAccount.error';
}

/**
 * A LinkedIn-only account cannot reauthenticate inline, so a stale session
 * gets the sign-in-again guidance instead of the generic reauth message.
 */
export function resolveDeletionFailureMessageKey(
  failure: { messageKey: string; reauthRequired: boolean },
  primaryMethod: DeletionReauthMethod,
): string {
  if (
    failure.reauthRequired &&
    primaryMethod.kind === 'unavailable' &&
    primaryMethod.reason === 'linkedin_sign_in_again'
  ) {
    return LINKEDIN_DELETION_SIGN_IN_AGAIN_KEY;
  }
  return failure.messageKey;
}

export function resolveAccountDeletionErrorMessageKey(err: unknown): string {
  if (isDeleteMyAccountError(err)) return resolveDeleteMyAccountMessageKey(err.kind);
  if (err instanceof AccountDeletionReauthError) return err.messageKey;
  return 'settings.deleteAccount.error';
}

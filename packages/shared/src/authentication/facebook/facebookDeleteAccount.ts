/**
 * Delete Account for Facebook-only accounts (ENH-AUTH-FB-01, Android).
 * Fresh Facebook credential → reauthenticateWithCredential → delete.
 * Deletion never runs unless reauthentication succeeded.
 */
import { FacebookAuthenticationError } from './facebookAuthCore.ts';

export type FacebookDeleteAccountOutcome =
  | { status: 'deleted' }
  | { status: 'in_progress' }
  | {
      status: 'reauth_cancelled' | 'reauth_mismatch' | 'reauth_failed';
      messageKey: string;
    };

export type FacebookDeleteAccountDeps = {
  reauthenticate: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  /** Drops the native Facebook session once the account is gone. */
  logOutProviderSession?: () => void | Promise<void>;
};

export async function runFacebookDeleteAccount(
  deps: FacebookDeleteAccountDeps,
): Promise<FacebookDeleteAccountOutcome> {
  try {
    await deps.reauthenticate();
  } catch (err) {
    const code =
      err instanceof FacebookAuthenticationError ? err.code : undefined;
    if (code === 'OPERATION_IN_PROGRESS') return { status: 'in_progress' };
    if (code === 'CANCELLED') {
      return {
        status: 'reauth_cancelled',
        messageKey: 'settings.deleteAccount.reauthCancelled',
      };
    }
    if (code === 'USER_MISMATCH') {
      return {
        status: 'reauth_mismatch',
        messageKey: 'settings.deleteAccount.reauthMismatch',
      };
    }
    return {
      status: 'reauth_failed',
      messageKey: 'settings.deleteAccount.reauthFailed',
    };
  }

  await deps.deleteAccount();

  try {
    await deps.logOutProviderSession?.();
  } catch {
    // Account already deleted; native session cleanup is best effort.
  }
  return { status: 'deleted' };
}

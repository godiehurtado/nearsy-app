/**
 * Fresh LinkedIn session for account deletion.
 *
 * LinkedIn has no Firebase AuthCredential, so `reauthenticateWithCredential`
 * is impossible. The A3 flow returns a custom token for the deterministic
 * LinkedIn UID; it is used only when that token's `uid` equals the signed-in
 * UID, so the Firebase session is never replaced by another account.
 */
import type {
  LinkedInA3FirebaseAuthPort,
  LinkedInA3FlowResult,
} from '../../authentication/linkedinA3/orchestrator';
import { AccountDeletionReauthError } from './accountDeletionReauthError';

/** Deterministic UID prefix minted by nearsy-identity-functions for LinkedIn. */
export const LINKEDIN_UID_PREFIX = 'li_';

export function isLinkedInDeterministicUid(uid: string | null | undefined): boolean {
  return typeof uid === 'string' && uid.startsWith(LINKEDIN_UID_PREFIX) && uid.length > 3;
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function decodeBase64Url(segment: string): string | null {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  if (!normalized || !/^[A-Za-z0-9+/]+$/.test(normalized)) return null;
  let buffer = 0;
  let bits = 0;
  let out = '';
  for (const ch of normalized) {
    buffer = (buffer << 6) | BASE64_ALPHABET.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((buffer >> bits) & 0xff);
      buffer &= (1 << bits) - 1;
    }
  }
  return out;
}

/**
 * `uid` claim of a Firebase custom token, read only to compare identities
 * before sign-in. Firebase still verifies the signature on sign-in.
 */
export function readCustomTokenUid(customToken: string): string | null {
  const parts = typeof customToken === 'string' ? customToken.split('.') : [];
  if (parts.length !== 3) return null;
  const json = decodeBase64Url(parts[1]);
  if (!json) return null;
  try {
    const payload = JSON.parse(json) as { uid?: unknown };
    return typeof payload.uid === 'string' && payload.uid ? payload.uid : null;
  } catch {
    return null;
  }
}

export type LinkedInDeletionReauthDeps = {
  /** Runs the A3 browser flow without durable resume. */
  runFlow: (auth: LinkedInA3FirebaseAuthPort) => Promise<LinkedInA3FlowResult>;
  getCurrentUid: () => string | null;
  signInWithCustomToken: (customToken: string) => Promise<{ uid: string; email: string | null }>;
};

const SIGN_IN_AGAIN_KEY = 'settings.deleteAccount.linkedInSignInAgain';

export async function refreshLinkedInSessionForDeletion(
  expectedUid: string,
  deps: LinkedInDeletionReauthDeps,
): Promise<void> {
  if (!isLinkedInDeterministicUid(expectedUid) || deps.getCurrentUid() !== expectedUid) {
    throw new AccountDeletionReauthError('LINKEDIN_SESSION_REQUIRED', SIGN_IN_AGAIN_KEY);
  }

  let mismatch = false;
  const guardedAuth: LinkedInA3FirebaseAuthPort = {
    getCurrentUid: deps.getCurrentUid,
    async signInWithCustomToken(customToken) {
      if (
        readCustomTokenUid(customToken) !== expectedUid ||
        deps.getCurrentUid() !== expectedUid
      ) {
        mismatch = true;
        throw new Error('linkedin deletion reauth uid mismatch');
      }
      return deps.signInWithCustomToken(customToken);
    },
  };

  let result: LinkedInA3FlowResult;
  try {
    result = await deps.runFlow(guardedAuth);
  } catch {
    throw new AccountDeletionReauthError('LINKEDIN_SESSION_REQUIRED', SIGN_IN_AGAIN_KEY);
  }

  if (mismatch) {
    throw new AccountDeletionReauthError(
      'IDENTITY_MISMATCH',
      'settings.deleteAccount.reauthMismatch',
    );
  }
  if (result.status === 'cancelled' || result.status === 'dismissed') {
    throw new AccountDeletionReauthError('CANCELLED', 'settings.deleteAccount.reauthCancelled');
  }
  if (result.status === 'session_already_active') {
    throw new AccountDeletionReauthError('IN_PROGRESS', 'settings.deleteAccount.inProgress');
  }
  if (result.status !== 'authenticated') {
    throw new AccountDeletionReauthError('LINKEDIN_SESSION_REQUIRED', SIGN_IN_AGAIN_KEY);
  }
  if (result.session.uid !== expectedUid || deps.getCurrentUid() !== expectedUid) {
    throw new AccountDeletionReauthError(
      'IDENTITY_MISMATCH',
      'settings.deleteAccount.reauthMismatch',
    );
  }
}

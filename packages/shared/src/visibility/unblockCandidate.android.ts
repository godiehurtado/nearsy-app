/**
 * Owner-scoped peer unblock for Settings Blocked People (Android / RNFirebase).
 * Path: users/{myUid}/blockedUsers/{candidateUid}
 */
import { firestoreDb } from '../config/firebaseConfig';

export type UnblockCandidateInput = {
  myUid: string;
  candidateUid: string;
};

export type UnblockCandidateResult =
  | { ok: true }
  | {
      ok: false;
      code: 'unauthenticated' | 'invalid' | 'self' | 'delete-failed';
      error?: unknown;
    };

export async function unblockCandidateUser(
  input: UnblockCandidateInput,
): Promise<UnblockCandidateResult> {
  const myUid = String(input.myUid || '').trim();
  const candidateUid = String(input.candidateUid || '').trim();
  if (!myUid) return { ok: false, code: 'unauthenticated' };
  if (!candidateUid) return { ok: false, code: 'invalid' };
  if (myUid === candidateUid) return { ok: false, code: 'self' };

  try {
    await firestoreDb
      .collection('users')
      .doc(myUid)
      .collection('blockedUsers')
      .doc(candidateUid)
      .delete();
    return { ok: true };
  } catch (error) {
    return { ok: false, code: 'delete-failed', error };
  }
}

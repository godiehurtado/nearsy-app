/**
 * Owner-scoped peer unblock for Settings Blocked People.
 * Path: users/{myUid}/blockedUsers/{candidateUid}
 */
import { deleteDoc, doc } from 'firebase/firestore';

import { firestoreDb } from '../config/firebaseConfig';

export type UnblockCandidateInput = {
  myUid: string;
  candidateUid: string;
};

export type UnblockCandidateResult =
  | { ok: true }
  | { ok: false; code: 'unauthenticated' | 'invalid' | 'self' | 'delete-failed'; error?: unknown };

export async function unblockCandidateUser(
  input: UnblockCandidateInput,
): Promise<UnblockCandidateResult> {
  const myUid = String(input.myUid || '').trim();
  const candidateUid = String(input.candidateUid || '').trim();
  if (!myUid) return { ok: false, code: 'unauthenticated' };
  if (!candidateUid) return { ok: false, code: 'invalid' };
  if (myUid === candidateUid) return { ok: false, code: 'self' };

  try {
    const ref = doc(firestoreDb, 'users', myUid, 'blockedUsers', candidateUid);
    await deleteDoc(ref);
    return { ok: true };
  } catch (error) {
    return { ok: false, code: 'delete-failed', error };
  }
}

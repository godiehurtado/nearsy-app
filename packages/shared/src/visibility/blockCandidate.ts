/**
 * Owner-scoped peer block write for Profile Exploration.
 * Path: users/{myUid}/blockedUsers/{candidateUid}
 * Shape must match Firestore Rules SoT validBlockDoc.
 */
import { doc, setDoc } from 'firebase/firestore';

import { firestoreDb } from '../config/firebaseConfig';
import {
  buildBlockUserDoc,
  type BlockUserDoc,
} from './profileExploration';

export type BlockCandidateInput = {
  myUid: string;
  candidateUid: string;
};

export type BlockCandidateResult =
  | { ok: true; doc: BlockUserDoc }
  | { ok: false; code: 'unauthenticated' | 'invalid' | 'self' | 'write-failed'; error?: unknown };

export async function blockCandidateUser(
  input: BlockCandidateInput,
): Promise<BlockCandidateResult> {
  const myUid = String(input.myUid || '').trim();
  const candidateUid = String(input.candidateUid || '').trim();
  if (!myUid) return { ok: false, code: 'unauthenticated' };
  if (!candidateUid) return { ok: false, code: 'invalid' };
  if (myUid === candidateUid) return { ok: false, code: 'self' };

  let payload: BlockUserDoc;
  try {
    payload = buildBlockUserDoc(candidateUid);
  } catch {
    return { ok: false, code: 'invalid' };
  }

  try {
    const ref = doc(firestoreDb, 'users', myUid, 'blockedUsers', candidateUid);
    await setDoc(ref, payload, { merge: true });
    return { ok: true, doc: payload };
  } catch (error) {
    return { ok: false, code: 'write-failed', error };
  }
}

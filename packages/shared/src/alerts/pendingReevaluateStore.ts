/**
 * Durable per-UID flag: Identity sync committed and Functions reevaluate is
 * still owed. Retry reevaluateProximityNotices only — never the address book.
 */

export const PENDING_REEVALUATE_PREFIX = 'nearsy.pendingReevaluate.v1:';

export type PendingReevaluateKv = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

export function pendingReevaluateKey(uid: string): string {
  return `${PENDING_REEVALUATE_PREFIX}${uid}`;
}

export async function markPendingReevaluate(
  store: PendingReevaluateKv,
  uid: string,
): Promise<void> {
  if (!uid) return;
  await store.setItem(pendingReevaluateKey(uid), '1');
}

export async function clearPendingReevaluate(
  store: PendingReevaluateKv,
  uid: string,
): Promise<void> {
  if (!uid) return;
  await store.removeItem(pendingReevaluateKey(uid));
}

export async function isPendingReevaluate(
  store: PendingReevaluateKv,
  uid: string,
): Promise<boolean> {
  if (!uid) return false;
  const raw = await store.getItem(pendingReevaluateKey(uid));
  return raw === '1';
}

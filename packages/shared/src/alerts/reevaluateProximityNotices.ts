/**
 * Default no-op. iOS calls Functions reevaluateProximityNotices
 * (Auth + App Check, caller uid only). Debounce matches the 10s lease.
 *
 * Pending is durable and uid-scoped: survives process death; an Identity
 * idempotent result must not clear a prior pending mark.
 */

import { getReevaluatePendingStore } from './reevaluatePendingStore';

const DEBOUNCE_MS = 10_000;

let timer: ReturnType<typeof setTimeout> | null = null;
let invokeImpl: ((uid: string) => Promise<void>) | null = null;
let resolveUidImpl: (() => string | null) | null = null;

export function registerReevaluateProximityNoticesInvoker(
  invoke: ((uid: string) => Promise<void>) | null,
  resolveUid?: (() => string | null) | null,
): void {
  invokeImpl = invoke;
  resolveUidImpl = resolveUid ?? null;
}

export function scheduleReevaluateProximityNotices(): void {
  if (!invokeImpl) return;
  const uid = resolveUidImpl?.() ?? null;
  if (!uid) return;
  // Started now so the mark is durable at once; a failed write is not thrown.
  try {
    void getReevaluatePendingStore().markPending(uid).catch(() => {});
  } catch {
    /* store unavailable: the scheduled flush still runs */
  }
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void flushForUid(uid);
  }, DEBOUNCE_MS);
}

async function flushForUid(uid: string): Promise<void> {
  if (!invokeImpl || !uid) return;
  try {
    await invokeImpl(uid);
    await getReevaluatePendingStore().clearIfUid(uid);
  } catch {
    /* Keep pending so a later resume / schedule can retry. */
  }
}

export async function reevaluateProximityNoticesNow(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const uid = resolveUidImpl?.() ?? null;
  if (!uid) return;
  await flushForUid(uid);
}

/** Resume a durable pending mark for the signed-in uid after cold start. */
export async function resumePendingReevaluateProximityNotices(): Promise<void> {
  if (!invokeImpl) return;
  const uid = resolveUidImpl?.() ?? null;
  if (!uid) return;
  if (!(await getReevaluatePendingStore().isPending(uid))) return;
  scheduleReevaluateProximityNotices();
}

/** Contract §9 marker for one UID, written before a mutating Identity call. */
export function createReevaluatePendingPort(uid: string) {
  return {
    isPending: () => getReevaluatePendingStore().isPending(uid),
    markPending: () => getReevaluatePendingStore().markPending(uid),
    clear: () => getReevaluatePendingStore().clearIfUid(uid),
  };
}

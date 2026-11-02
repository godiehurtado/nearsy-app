/**
 * Default no-op. iOS calls Functions reevaluateProximityNotices
 * (Auth + App Check, caller uid only). Debounce matches the 10s lease.
 */

const DEBOUNCE_MS = 10_000;

let timer: ReturnType<typeof setTimeout> | null = null;
let invokeImpl: (() => Promise<void>) | null = null;

export function registerReevaluateProximityNoticesInvoker(
  invoke: (() => Promise<void>) | null,
): void {
  invokeImpl = invoke;
}

export function scheduleReevaluateProximityNotices(): void {
  if (!invokeImpl) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void invokeImpl?.().catch(() => {});
  }, DEBOUNCE_MS);
}

export async function reevaluateProximityNoticesNow(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  await invokeImpl?.();
}

/**
 * After OTP check or Auth email verify, call Identity refreshVerifiedActorKeys.
 * Default is no-op until the iOS foundation registers an invoker.
 */

let invokeImpl: (() => Promise<void>) | null = null;

export function registerRefreshVerifiedActorKeysInvoker(
  invoke: (() => Promise<void>) | null,
): void {
  invokeImpl = invoke;
}

export async function refreshVerifiedActorKeysNow(): Promise<void> {
  await invokeImpl?.();
}

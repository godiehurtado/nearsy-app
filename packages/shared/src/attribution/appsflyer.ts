/**
 * Default no-op. Android resolves `appsflyer.android.ts`; no other platform of
 * this history starts AppsFlyer.
 */
import type { OneLinkDestination } from './oneLinkContract.ts';

export function startAppsFlyer(): void {}

/** The pending OneLink destination for this account, consumed once. */
export async function takeOneLinkDestination(_uid: string): Promise<OneLinkDestination | null> {
  return null;
}

/** Notified when a new destination is waiting. Returns an unsubscribe function. */
export function onOneLinkDestination(_listener: () => void): () => void {
  return () => {};
}

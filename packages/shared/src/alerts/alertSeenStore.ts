import type { AlertSeenRecord } from './alertAppearance.ts';

/** Non-Android: no Firestore alertSeen IO. */
export async function loadAlertSeenMap(
  _viewerUid: string,
): Promise<Record<string, AlertSeenRecord>> {
  return {};
}

export async function writeAlertSeen(
  _viewerUid: string,
  _peerUid: string,
  _record: AlertSeenRecord,
): Promise<void> {}

export function subscribeAlertSeenMap(
  _viewerUid: string,
  _onMap: (map: Record<string, AlertSeenRecord>) => void,
): () => void {
  return () => {};
}

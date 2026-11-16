/**
 * alert_opened from the inbox (QA 2.1.0, POSTHOG_SERVER_CONTRACT §alert_opened):
 * emitted on a tap on a row NOT seen before, once per appearance.
 *
 * - Reopening the same appearance emits nothing.
 * - A row already marked seen (by an earlier open, including the "seen" mark
 *   caused by a push tap) emits nothing.
 * - A new appearance of the same person is unseen again and emits again.
 * - Per signed-in uid; nothing crosses accounts.
 * - No identifier is sent: inbox_item_id is withdrawn (pair-derived from both
 *   UIDs, Product 2026-11-16). Push opens keep alert_id, unchanged.
 */

/** viewerUid → appearance keys already reported in this process. */
const reported = new Map<string, Set<string>>();

export function shouldReportInboxOpen(
  viewerUid: string | null | undefined,
  item: { uid?: string; appearanceKey?: string; unseen?: boolean },
): boolean {
  if (!viewerUid || !item.uid) return false;
  if (item.unseen !== true) return false;
  const key = item.appearanceKey ?? `peer:${item.uid}`;
  const keys = reported.get(viewerUid) ?? new Set<string>();
  if (keys.has(key)) return false;
  keys.add(key);
  reported.set(viewerUid, keys);
  return true;
}

/** Test helper. */
export function resetInboxOpenTrackingForTests(): void {
  reported.clear();
}

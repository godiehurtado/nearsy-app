/**
 * Local "already reported" ledger for one-time account events.
 *
 * The key is the account generation (uid + Firebase creation time), not the uid:
 * LinkedIn UIDs are derived from the provider subject, so deleting and recreating
 * an account returns the same UID. A recreated account has a new creation time
 * and may report its own signup and onboarding.
 *
 * Limits: local to the device. A reinstall or a second device can repeat a
 * milestone only if the user completes that step again there.
 */
import { toIsoCreationTime } from './client';
import type { StringStore } from './lifecycle';

const KEY_PREFIX = 'nearsy.analytics.ledger.v1:';

export function accountGenerationKey(
  uid: string,
  creationTime: string | null | undefined,
): string | null {
  const created = toIsoCreationTime(creationTime);
  return created ? `${uid}|${created}` : null;
}

export function createEventLedger(store: StringStore | null) {
  const memory = new Map<string, Set<string>>();
  const chains = new Map<string, Promise<unknown>>();

  async function loadInto(key: string): Promise<Set<string>> {
    const existing = memory.get(key);
    if (existing) return existing;
    const items = new Set<string>();
    if (store) {
      try {
        const raw = await store.getItem(KEY_PREFIX + key);
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed)) {
          parsed.forEach((item) => {
            if (typeof item === 'string') items.add(item);
          });
        }
      } catch {
        // Unreadable ledger: this process still dedupes in memory.
      }
    }
    memory.set(key, items);
    return items;
  }

  /**
   * True the first time an item is claimed for an account generation. Without a
   * valid creation time (`null`) dedupe is memory-only for that uid, so it never
   * becomes a permanent per-UID suppression.
   */
  function claim(
    uid: string,
    creationTime: string | null | undefined,
    item: string,
  ): Promise<boolean> {
    const generation = accountGenerationKey(uid, creationTime);
    const key = generation ?? `memory:${uid}`;
    const previous = chains.get(key) ?? Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(async () => {
        const items = await loadInto(generation ? key : `memory:${uid}`);
        if (items.has(item)) return false;
        items.add(item);
        if (store && generation) {
          try {
            await store.setItem(KEY_PREFIX + key, JSON.stringify([...items]));
          } catch {
            // In-memory dedupe still holds for this process.
          }
        }
        return true;
      });
    chains.set(key, next);
    return next;
  }

  return { claim };
}

export type EventLedger = ReturnType<typeof createEventLedger>;

/**
 * Home filter write ledger (per UID, per mode).
 *
 * Tracks the last server-confirmed searchPreferences per mode and the writes
 * still in flight. A failed write rolls the mode back to the latest confirmed
 * value — never to another write's unconfirmed optimistic value — unless a
 * newer write for the same mode is still pending (it carries the same edits).
 * Firestore applies one client's writes in order, so a success for an older
 * epoch never overrides a newer confirmed one.
 *
 * Pure TS: no Firebase / React imports.
 */

import type { ProfileMode } from '../profile/profileModeFields';
import type {
  VisibilitySearchPreferences,
  VisibilitySearchPreferencesByMode,
} from './types';

type Pending = {
  mode: ProfileMode;
  value: VisibilitySearchPreferences;
  /** Older write whose newer sibling failed: still in flight, not shown. */
  hidden: boolean;
};

export type SearchPreferencesWriteSettle = {
  /** What the UI should show now. */
  display: VisibilitySearchPreferencesByMode;
  /** True when the user's latest edit for this mode failed (alert once). */
  latestForModeFailed: boolean;
  /** No writes left in flight for any mode. */
  idle: boolean;
};

export type SearchPreferencesWriteLedger = {
  readonly uid: string;
  begin(mode: ProfileMode, value: VisibilitySearchPreferences): number;
  succeed(epoch: number): SearchPreferencesWriteSettle | null;
  fail(epoch: number): SearchPreferencesWriteSettle | null;
  /** Server snapshot accepted by the caller (no local edits pending). */
  hydrate(remote: VisibilitySearchPreferencesByMode): void;
  confirmed(): VisibilitySearchPreferencesByMode;
  display(): VisibilitySearchPreferencesByMode;
  hasPending(): boolean;
};

const MODES: ProfileMode[] = ['personal', 'professional'];

export function createSearchPreferencesWriteLedger(
  uid: string,
  initialConfirmed: VisibilitySearchPreferencesByMode,
  firstEpoch = 1,
): SearchPreferencesWriteLedger {
  let confirmed: VisibilitySearchPreferencesByMode = { ...initialConfirmed };
  const confirmedEpoch: Record<ProfileMode, number> = {
    personal: 0,
    professional: 0,
  };
  const latestBegun: Record<ProfileMode, number> = {
    personal: 0,
    professional: 0,
  };
  const pending = new Map<number, Pending>();
  let nextEpoch = firstEpoch;

  const latestPending = (mode: ProfileMode): Pending | null => {
    let best: { epoch: number; entry: Pending } | null = null;
    for (const [epoch, entry] of pending) {
      if (entry.mode !== mode || entry.hidden) continue;
      if (!best || epoch > best.epoch) best = { epoch, entry };
    }
    return best?.entry ?? null;
  };

  const display = (): VisibilitySearchPreferencesByMode => {
    const out = { ...confirmed };
    for (const mode of MODES) {
      const p = latestPending(mode);
      if (p) out[mode] = p.value;
    }
    return out;
  };

  const settle = (
    epoch: number,
    ok: boolean,
  ): SearchPreferencesWriteSettle | null => {
    const entry = pending.get(epoch);
    if (!entry) return null;
    pending.delete(epoch);
    if (!ok && latestBegun[entry.mode] === epoch) {
      // Show the confirmed value, not an older optimistic write still in
      // flight; if that one succeeds later it becomes confirmed and shows.
      for (const [e, other] of pending) {
        if (other.mode === entry.mode && e < epoch) other.hidden = true;
      }
    }
    if (ok && epoch > confirmedEpoch[entry.mode]) {
      confirmed = { ...confirmed, [entry.mode]: entry.value };
      confirmedEpoch[entry.mode] = epoch;
    }
    return {
      display: display(),
      latestForModeFailed: !ok && latestBegun[entry.mode] === epoch,
      idle: pending.size === 0,
    };
  };

  return {
    uid,
    begin(mode, value) {
      const epoch = nextEpoch++;
      pending.set(epoch, { mode, value, hidden: false });
      latestBegun[mode] = epoch;
      return epoch;
    },
    succeed: (epoch) => settle(epoch, true),
    fail: (epoch) => settle(epoch, false),
    hydrate(remote) {
      if (pending.size > 0) return;
      confirmed = { ...remote };
    },
    confirmed: () => ({ ...confirmed }),
    display,
    hasPending: () => pending.size > 0,
  };
}

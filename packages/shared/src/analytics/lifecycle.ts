/**
 * app_opened decisions. An open is a real arrival to foreground:
 * - `inactive` (permission dialogs, Notification Center, Face ID, system sheets)
 *   never counts, so active → inactive → active is not an open.
 * - A launch that stays in background (location task) is not an open until the
 *   user brings the app forward.
 * - is_first_open is not sent: no evidence available here shows a first open.
 * - A sign-in that leaves the app for a moment (provider app, browser) is the
 *   same visit, so a background that starts during it does not count on return.
 */
export type AppStateName = 'active' | 'background' | 'inactive' | 'unknown' | string;

export type AppOpenType = 'cold_start' | 'return_from_background';

/** An abandoned sign-in cannot hide a later real return for longer than this. */
export const EXTERNAL_AUTH_MAX_MS = 10 * 60 * 1000;

export function createForegroundTracker(now: () => number = Date.now) {
  let inForeground = false;
  let opens = 0;
  let externalFlows = 0;
  let flowBeganAtMs = 0;
  let leftDuringFlowAtMs: number | null = null;
  return {
    /** Returns the open type when this state change is a real app open. */
    onAppState(state: AppStateName): AppOpenType | null {
      if (state === 'background') {
        inForeground = false;
        // A sign-in that never settles cannot hide returns for the whole process.
        const inFlow =
          externalFlows > 0 && now() - flowBeganAtMs <= EXTERNAL_AUTH_MAX_MS;
        leftDuringFlowAtMs = inFlow ? now() : null;
        return null;
      }
      if (state !== 'active' || inForeground) return null;
      inForeground = true;
      const leftAt = leftDuringFlowAtMs;
      leftDuringFlowAtMs = null;
      if (leftAt !== null && now() - leftAt <= EXTERNAL_AUTH_MAX_MS) return null;
      opens += 1;
      return opens === 1 ? 'cold_start' : 'return_from_background';
    },
    beginExternalFlow(): void {
      externalFlows += 1;
      flowBeganAtMs = now();
    },
    endExternalFlow(): void {
      externalFlows = Math.max(0, externalFlows - 1);
    },
  };
}

export type StringStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

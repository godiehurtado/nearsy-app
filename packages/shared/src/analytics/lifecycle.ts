/**
 * app_opened decisions. `inactive` (system dialogs, Notification Center, Face
 * ID) never counts, so active → inactive → active is not an open. A launch that
 * stays in background (location task) is not an open until the user brings the
 * app forward.
 */
export type AppStateName = 'active' | 'background' | 'inactive' | 'unknown' | string;

export type AppOpenType = 'cold_start' | 'return_from_background';

export function createForegroundTracker() {
  let inForeground = false;
  let opens = 0;
  return {
    /** Returns the open type when this state change is a real app open. */
    onAppState(state: AppStateName): AppOpenType | null {
      if (state === 'background') {
        inForeground = false;
        return null;
      }
      if (state !== 'active' || inForeground) return null;
      inForeground = true;
      opens += 1;
      return opens === 1 ? 'cold_start' : 'return_from_background';
    },
  };
}

export const FIRST_OPEN_MARKER_KEY = 'nearsy.analytics.firstOpenRecorded.v1';

/**
 * True only with no evidence of earlier use on this install. Uninstalling clears
 * local storage, so a reinstall is a first open of that install again.
 */
export function resolveIsFirstOpen(input: {
  markerRecorded: boolean;
  legacyUseEvidence: boolean;
  hasSession: boolean;
}): boolean {
  return !input.markerRecorded && !input.legacyUseEvidence && !input.hasSession;
}

export type StringStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

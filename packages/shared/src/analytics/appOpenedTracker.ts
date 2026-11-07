/**
 * Decides when `app_opened` fires.
 *
 * On Android, React Native reports `background` on every host pause, which
 * includes permission dialogs and sign-in activities. A return therefore counts
 * as an open only after a minimum time away. The first open waits for the first
 * auth emission, so it is attributed to the right person.
 */
export const APP_OPENED_MIN_BACKGROUND_MS = 30_000;

export function createAppOpenedTracker(deps: {
  now: () => number;
  emit: () => void;
  minBackgroundMs?: number;
}) {
  const minBackgroundMs = deps.minBackgroundMs ?? APP_OPENED_MIN_BACKGROUND_MS;
  let authReady = false;
  let isActive = false;
  let firstEmitted = false;
  let backgroundSince: number | null = null;

  function emitFirstIfReady() {
    if (firstEmitted || !authReady || !isActive) return;
    firstEmitted = true;
    backgroundSince = null;
    deps.emit();
  }

  return {
    noteAuthReady() {
      authReady = true;
      emitFirstIfReady();
    },
    noteAppState(state: string | null | undefined) {
      if (state === 'active') {
        isActive = true;
        if (!firstEmitted) {
          emitFirstIfReady();
          return;
        }
        if (backgroundSince === null) return;
        const away = deps.now() - backgroundSince;
        backgroundSince = null;
        if (away >= minBackgroundMs) deps.emit();
        return;
      }
      if (state === 'background') {
        isActive = false;
        if (backgroundSince === null) backgroundSince = deps.now();
      }
      // `inactive` and unknown states are not a departure from the app.
    },
  };
}

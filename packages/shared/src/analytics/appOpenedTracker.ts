/**
 * Decides when `app_opened` fires. This is a product rule for opens, not the
 * SDK session definition: PostHog rotates its session id on its own clock.
 *
 * On Android, React Native reports `background` on every host pause, which
 * includes permission dialogs and sign-in activities. Two rules follow:
 *
 * - A return counts only after a minimum time away. This value is provisional
 *   and configurable.
 * - A departure caused by one of the app's own flows (sign-in, permission,
 *   picker, Settings) does not count, unless it lasts long enough that the user
 *   clearly left: `ownFlowMaxMs` keeps an abandoned flow from hiding a real open.
 *
 * The first open waits for the first auth emission, so it is attributed to the
 * right person.
 */
export const APP_OPENED_MIN_BACKGROUND_MS = 30_000;
export const OWN_FLOW_MAX_AWAY_MS = 10 * 60_000;
/** A launcher such as openSettings resolves just before the host pauses. */
export const OWN_FLOW_GRACE_MS = 2_000;

export function createAppOpenedTracker(deps: {
  now: () => number;
  emit: () => void;
  minBackgroundMs?: number;
  ownFlowMaxMs?: number;
}) {
  const minBackgroundMs = deps.minBackgroundMs ?? APP_OPENED_MIN_BACKGROUND_MS;
  const ownFlowMaxMs = deps.ownFlowMaxMs ?? OWN_FLOW_MAX_AWAY_MS;
  let authReady = false;
  let isActive = false;
  let firstEmitted = false;
  let backgroundSince: number | null = null;
  let leftForOwnFlow = false;
  let activeOwnFlows = 0;
  let ownFlowGraceUntil = 0;

  function emitFirstIfReady() {
    if (firstEmitted || !authReady || !isActive) return;
    firstEmitted = true;
    backgroundSince = null;
    leftForOwnFlow = false;
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
        const ownFlow = leftForOwnFlow;
        backgroundSince = null;
        leftForOwnFlow = false;
        if (away < minBackgroundMs) return;
        if (ownFlow && away <= ownFlowMaxMs) return;
        deps.emit();
        return;
      }
      if (state === 'background') {
        isActive = false;
        if (backgroundSince === null) {
          backgroundSince = deps.now();
          leftForOwnFlow =
            activeOwnFlows > 0 || backgroundSince <= ownFlowGraceUntil;
        }
      }
      // `inactive` and unknown states are not a departure from the app.
    },
    /** Marks one of the app's own external flows. Returns its end; safe to call twice. */
    beginOwnFlow(): () => void {
      activeOwnFlows += 1;
      let ended = false;
      return () => {
        if (ended) return;
        ended = true;
        activeOwnFlows -= 1;
        ownFlowGraceUntil = deps.now() + OWN_FLOW_GRACE_MS;
      };
    },
  };
}

/**
 * Shared FG → preparation → background-disclosure journey coordinator.
 * No artificial delays; preparation UI only when async work is perceptible.
 */

import {
  beginLocationJourney,
  endLocationJourney,
  isLocationJourneyInFlight,
  markBackgroundDisclosureOfferedThisSession,
  setLocationJourneyPreparing,
  shouldOfferBackgroundDisclosureAfterFgGrant,
  shouldRenderPreparationForElapsedMs,
  wasBackgroundDisclosureOfferedThisSession,
} from './locationJourneySession';
import {
  resolveBackgroundDisclosureVariant,
  type BackgroundDisclosureVariant,
} from './backgroundEducationStorage';

export type PreparationUiController = {
  /** Called only when preparation should be visible (perceptible async). */
  setVisible: (visible: boolean) => void;
  /** Abort showing/hiding if screen unmounted or logout. */
  isCancelled?: () => boolean;
};

/**
 * Run real async work after FG grant. Shows preparation UI only if work
 * lasts ≥ minVisibleMs (default 80). No artificial delay beyond that gate.
 */
export async function runWithPreparationUi<T>(
  ui: PreparationUiController,
  work: () => Promise<T>,
  minVisibleMs: number = 80,
): Promise<T> {
  const startedAt = Date.now();
  let shown = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  setLocationJourneyPreparing(true);

  const tryShow = () => {
    if (ui.isCancelled?.()) return;
    if (!shouldRenderPreparationForElapsedMs(Date.now() - startedAt, minVisibleMs)) {
      return;
    }
    shown = true;
    ui.setVisible(true);
  };

  timer = setTimeout(tryShow, minVisibleMs);

  try {
    return await work();
  } finally {
    if (timer) clearTimeout(timer);
    setLocationJourneyPreparing(false);
    if (shown && !ui.isCancelled?.()) {
      ui.setVisible(false);
    } else if (shown) {
      // Still clear UI flag on cancel/unmount callers that keep state.
      try {
        ui.setVisible(false);
      } catch {
        // ignore
      }
    }
  }
}

export type PostFgJourneyPlan =
  | { action: 'none'; reason: 'background-already-granted' | 'already-offered' | 'journey-locked' }
  | { action: 'show-disclosure'; variant: BackgroundDisclosureVariant };

/**
 * After a foreground grant, decide whether to show background disclosure.
 * Does not show preparation — caller wraps prep around resolve work as needed.
 */
export async function planBackgroundDisclosureAfterForeground(input: {
  backgroundGranted: boolean;
  /** When false, skip if session already offered (unless force). */
  forceOffer?: boolean;
}): Promise<PostFgJourneyPlan> {
  if (input.backgroundGranted) {
    return { action: 'none', reason: 'background-already-granted' };
  }
  if (
    !input.forceOffer &&
    !shouldOfferBackgroundDisclosureAfterFgGrant({
      backgroundAlreadyGranted: false,
      disclosureOfferedThisSession: wasBackgroundDisclosureOfferedThisSession(),
    })
  ) {
    return { action: 'none', reason: 'already-offered' };
  }
  if (isLocationJourneyInFlight() && !input.forceOffer) {
    // Another surface owns the journey; avoid duplicate modals.
    // Callers that already hold the lock should pass forceOffer or begin first.
  }
  const variant = await resolveBackgroundDisclosureVariant();
  return { action: 'show-disclosure', variant };
}

/**
 * Acquire session journey lock, run prep+plan, mark disclosure offered when shown.
 * Returns null when another journey is in flight (caller should no-op).
 */
export async function beginPostForegroundDisclosureJourney(input: {
  backgroundGranted: boolean;
  preparationUi: PreparationUiController;
  /**
   * Extra async validation between FG grant and disclosure.
   * May report that background became granted so disclosure is skipped.
   */
  prepareWork?: () => Promise<{ backgroundGranted?: boolean } | void>;
  forceOffer?: boolean;
}): Promise<PostFgJourneyPlan | null> {
  if (!beginLocationJourney()) {
    return null;
  }
  try {
    if (input.backgroundGranted) {
      return { action: 'none', reason: 'background-already-granted' };
    }
    if (!input.forceOffer && wasBackgroundDisclosureOfferedThisSession()) {
      return { action: 'none', reason: 'already-offered' };
    }

    const plan = await runWithPreparationUi(input.preparationUi, async () => {
      let backgroundGranted = input.backgroundGranted;
      if (input.prepareWork) {
        const result = await input.prepareWork();
        if (result && result.backgroundGranted === true) {
          backgroundGranted = true;
        }
      }
      return planBackgroundDisclosureAfterForeground({
        backgroundGranted,
        forceOffer: true,
      });
    });

    if (plan.action === 'show-disclosure') {
      markBackgroundDisclosureOfferedThisSession();
    }
    return plan;
  } finally {
    endLocationJourney();
  }
}

export function closePreparationOnTerminal(ui: PreparationUiController): void {
  setLocationJourneyPreparing(false);
  try {
    ui.setVisible(false);
  } catch {
    // ignore
  }
  endLocationJourney();
}

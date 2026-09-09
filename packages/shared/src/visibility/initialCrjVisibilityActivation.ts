/**
 * First-time post-CRJ visibility activation (onboarding only).
 * Not used for later profile-mode switches or explicit Off reconciliation.
 */

import type { VisibilityDiscoveryClient } from './callables';
import type { ActivateOutcome } from './orchestration';

export type InitialCrjVisibilityActivationResult =
  | { activated: true }
  | {
      activated: false;
      reason:
        | 'permission-denied'
        | 'unavailable'
        | 'invalid-accuracy'
        | 'callable'
        | 'skipped';
    };

export type AttemptInitialVisibilityAfterCrjCompletionDeps = {
  getClient: () => Promise<VisibilityDiscoveryClient>;
  /** Injectable for tests; defaults to activateVisibilityFlow. */
  activate?: (
    client: VisibilityDiscoveryClient,
  ) => Promise<ActivateOutcome>;
};

/**
 * Best-effort activateVisibility after legitimate CRJ completion.
 * Never throws — onboarding must complete even when activation fails.
 */
export async function attemptInitialVisibilityAfterCrjCompletion(
  deps: AttemptInitialVisibilityAfterCrjCompletionDeps,
): Promise<InitialCrjVisibilityActivationResult> {
  try {
    const client = await deps.getClient();
    let activate = deps.activate;
    if (!activate) {
      // Lazy require keeps Node unit tests free of expo-location / RN.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const orchestration = require('./orchestration') as {
        activateVisibilityFlow: (
          client: VisibilityDiscoveryClient,
        ) => Promise<ActivateOutcome>;
      };
      activate = orchestration.activateVisibilityFlow;
    }
    const outcome = await activate(client);
    if (outcome.ok === true) {
      return { activated: true };
    }
    return { activated: false, reason: outcome.kind };
  } catch {
    return { activated: false, reason: 'callable' };
  }
}

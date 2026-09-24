/**
 * BUG-VIS-01 — provisional Active while validating after CRJ / stale false→true.
 * Includes lifecycle-realistic coverage for Home mounted before arm.
 */
import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  labelBugVis01Presentation,
  resolveVisibilityPresentation,
  shouldKeepCrjProvisionalDespiteCachedOff,
  shouldRearmVisibilityHydration,
} from '../visibilityPresentation';
import {
  armCrjVisibilityActivationHandoff,
  clearCrjVisibilityActivationHandoff,
  consumeCrjVisibilityActivationHandoff,
  isCrjVisibilityActivationHandoffArmed,
  peekCrjVisibilityActivationHandoffForTests,
  resetCrjVisibilityActivationHandoffForTests,
  subscribeCrjVisibilityActivationHandoff,
  syncCrjVisibilityActivationHandoffForUid,
} from '../crjVisibilityActivationHandoff';

const sharedSrc = join(__dirname, '../..');
const UID = 'test-uid-bug-vis-01';

function readShared(rel: string): string {
  return readFileSync(join(sharedSrc, rel), 'utf8');
}

beforeEach(() => {
  resetCrjVisibilityActivationHandoffForTests();
});

describe('BUG-VIS-01 shouldRearmVisibilityHydration', () => {
  it('rearms when entering ON from false (stale snapshot)', () => {
    assert.equal(
      shouldRearmVisibilityHydration({
        persistedOn: true,
        previouslyPersistedOn: false,
        hydrationValidationDone: true,
        recoveryInFlight: false,
      }),
      true,
    );
  });

  it('rearms on first ON while hydration still open', () => {
    assert.equal(
      shouldRearmVisibilityHydration({
        persistedOn: true,
        previouslyPersistedOn: true,
        hydrationValidationDone: false,
        recoveryInFlight: false,
      }),
      true,
    );
  });

  it('does not re-lock stable ON after hydration done', () => {
    assert.equal(
      shouldRearmVisibilityHydration({
        persistedOn: true,
        previouslyPersistedOn: true,
        hydrationValidationDone: true,
        recoveryInFlight: false,
      }),
      false,
    );
  });

  it('skips rearm during recovery journey', () => {
    assert.equal(
      shouldRearmVisibilityHydration({
        persistedOn: true,
        previouslyPersistedOn: false,
        hydrationValidationDone: true,
        recoveryInFlight: true,
      }),
      false,
    );
  });

  it('never rearms when persisted OFF', () => {
    assert.equal(
      shouldRearmVisibilityHydration({
        persistedOn: false,
        previouslyPersistedOn: true,
        hydrationValidationDone: false,
        recoveryInFlight: false,
      }),
      false,
    );
  });
});

describe('BUG-VIS-01 CRJ handoff before remote true', () => {
  it('CRJ success + cached false → Active provisional, runtime off', () => {
    const ui = resolveVisibilityPresentation({
      profileLoaded: true,
      persistedVisibility: false,
      validationPending: true,
      validatedEffective: null,
      crjActivationProvisional: true,
    });
    assert.equal(ui.visualActive, true);
    assert.equal(ui.canStartRuntime, false);
    assert.equal(ui.allowToggle, false);
  });

  it('remote true still delayed → stays Active provisional, runtime off', () => {
    const ui = resolveVisibilityPresentation({
      profileLoaded: true,
      persistedVisibility: false,
      validationPending: true,
      validatedEffective: null,
      crjActivationProvisional: true,
    });
    assert.equal(ui.visualActive, true);
    assert.equal(ui.canStartRuntime, false);
  });

  it('true + FG validated → Active confirmed with runtime', () => {
    const ui = resolveVisibilityPresentation({
      profileLoaded: true,
      persistedVisibility: true,
      validationPending: false,
      validatedEffective: true,
      crjActivationProvisional: false,
    });
    assert.equal(ui.visualActive, true);
    assert.equal(ui.canStartRuntime, true);
  });

  it('FG denied / conclusive failure → Inactive even with prior provisional', () => {
    assert.equal(
      shouldKeepCrjProvisionalDespiteCachedOff({
        crjActivationProvisional: true,
        validatedEffective: false,
      }),
      false,
    );
    const ui = resolveVisibilityPresentation({
      profileLoaded: true,
      persistedVisibility: false,
      validationPending: false,
      validatedEffective: false,
      crjActivationProvisional: true,
    });
    assert.equal(ui.visualActive, false);
    assert.equal(ui.canStartRuntime, false);
  });

  it('existing account false without handoff → Inactive', () => {
    const ui = resolveVisibilityPresentation({
      profileLoaded: true,
      persistedVisibility: false,
      validationPending: false,
      validatedEffective: false,
      crjActivationProvisional: false,
    });
    assert.equal(ui.visualActive, false);
    assert.equal(ui.canStartRuntime, false);
  });
});

describe('BUG-VIS-01 session handoff (not consume-on-mount)', () => {
  it('peek survives Strict Mode / remount; clear is explicit', () => {
    armCrjVisibilityActivationHandoff(UID);
    assert.equal(isCrjVisibilityActivationHandoffArmed(UID), true);
    assert.equal(isCrjVisibilityActivationHandoffArmed(UID), true);
    assert.equal(consumeCrjVisibilityActivationHandoff(), true);
    assert.equal(peekCrjVisibilityActivationHandoffForTests(), true);
    clearCrjVisibilityActivationHandoff('validated');
    assert.equal(isCrjVisibilityActivationHandoffArmed(UID), false);
    assert.equal(peekCrjVisibilityActivationHandoffForTests(), false);
  });

  it('subscribe notifies late arm after Home already mounted', () => {
    let armed = false;
    const unsub = subscribeCrjVisibilityActivationHandoff(() => {
      armed = syncCrjVisibilityActivationHandoffForUid(UID);
    });
    assert.equal(isCrjVisibilityActivationHandoffArmed(UID), false);
    armCrjVisibilityActivationHandoff(UID);
    assert.equal(armed, true);
    unsub();
  });

  it('uid mismatch and logout clear provisional', () => {
    armCrjVisibilityActivationHandoff(UID);
    assert.equal(syncCrjVisibilityActivationHandoffForUid('other-uid'), false);
    assert.equal(peekCrjVisibilityActivationHandoffForTests(), false);
    armCrjVisibilityActivationHandoff(UID);
    assert.equal(syncCrjVisibilityActivationHandoffForUid(null), false);
    assert.equal(peekCrjVisibilityActivationHandoffForTests(), false);
  });
});

/**
 * Reproduces the physical Owner QA failure:
 * Home mounted + cached false processed before arm → late arm must reopen Active.
 */
describe('BUG-VIS-01 realistic lifecycle (Home mounted before arm)', () => {
  it('1–8: late arm after cached Inactive → Active provisional → confirm → clear', () => {
    // 1. Home already mounted before finishOnboarding / arm
    let provisional = isCrjVisibilityActivationHandoffArmed(UID);
    assert.equal(provisional, false);

    // 2. Cached profile.visibility=false already processed → conclusive Inactive
    let validatedEffective: boolean | null = false;
    let validationPending = false;
    let persisted: boolean | undefined = false;
    let ui = resolveVisibilityPresentation({
      profileLoaded: true,
      persistedVisibility: persisted,
      validationPending,
      validatedEffective,
      crjActivationProvisional: provisional,
    });
    assert.equal(ui.visualActive, false);
    assert.equal(ui.canStartRuntime, false);

    // 3–4. CRJ activateVisibility success → arm after initial mount
    let notified = false;
    const unsub = subscribeCrjVisibilityActivationHandoff(() => {
      notified = true;
      provisional = syncCrjVisibilityActivationHandoffForUid(UID);
    });
    armCrjVisibilityActivationHandoff(UID);
    assert.equal(notified, true);
    assert.equal(provisional, true);
    unsub();

    // 5–6. Home visible/focused: reopen hydration (as MainHomeScreen applyArmed does)
    validationPending = true;
    validatedEffective = null;
    ui = resolveVisibilityPresentation({
      profileLoaded: true,
      persistedVisibility: false,
      validationPending,
      validatedEffective,
      crjActivationProvisional: provisional,
    });
    assert.equal(ui.visualActive, true);
    assert.equal(ui.canStartRuntime, false);

    // 7. Repeated cached false must not drop provisional
    assert.equal(
      shouldKeepCrjProvisionalDespiteCachedOff({
        crjActivationProvisional: true,
        validatedEffective: null,
      }),
      true,
    );
    ui = resolveVisibilityPresentation({
      profileLoaded: true,
      persistedVisibility: false,
      validationPending: true,
      validatedEffective: null,
      crjActivationProvisional: true,
    });
    assert.equal(ui.visualActive, true);
    assert.equal(ui.canStartRuntime, false);

    // 8. Remote true + FG valid → confirmed Active; clear provisional
    clearCrjVisibilityActivationHandoff('validated');
    provisional = isCrjVisibilityActivationHandoffArmed(UID);
    assert.equal(provisional, false);
    ui = resolveVisibilityPresentation({
      profileLoaded: true,
      persistedVisibility: true,
      validationPending: false,
      validatedEffective: true,
      crjActivationProvisional: false,
    });
    assert.equal(ui.visualActive, true);
    assert.equal(ui.canStartRuntime, true);
  });

  it('9: FG denied / contractual failure clears provisional → Inactive', () => {
    armCrjVisibilityActivationHandoff(UID);
    clearCrjVisibilityActivationHandoff('denied');
    assert.equal(isCrjVisibilityActivationHandoffArmed(UID), false);
    const ui = resolveVisibilityPresentation({
      profileLoaded: true,
      persistedVisibility: false,
      validationPending: false,
      validatedEffective: false,
      crjActivationProvisional: false,
    });
    assert.equal(ui.visualActive, false);
  });

  it('10: logout / uid change clears provisional', () => {
    armCrjVisibilityActivationHandoff(UID);
    clearCrjVisibilityActivationHandoff('logout');
    assert.equal(isCrjVisibilityActivationHandoffArmed(UID), false);
    armCrjVisibilityActivationHandoff(UID);
    assert.equal(syncCrjVisibilityActivationHandoffForUid('uid-b'), false);
  });

  it('11: existing account false without CRJ event → Inactive', () => {
    assert.equal(peekCrjVisibilityActivationHandoffForTests(), false);
    const ui = resolveVisibilityPresentation({
      profileLoaded: true,
      persistedVisibility: false,
      validationPending: false,
      validatedEffective: false,
      crjActivationProvisional: false,
    });
    assert.equal(ui.visualActive, false);
  });

  it('12: Strict Mode remount does not accidentally consume before use', () => {
    armCrjVisibilityActivationHandoff(UID);
    // First mount peek
    assert.equal(isCrjVisibilityActivationHandoffArmed(UID), true);
    // Remount peek (Strict Mode)
    assert.equal(isCrjVisibilityActivationHandoffArmed(UID), true);
    assert.equal(peekCrjVisibilityActivationHandoffForTests(), true);
  });

  it('stale Inactive conclusion while handoff armed stays Active provisional', () => {
    // Mirrors finishValidation(false) guard when late arm races async hydration.
    armCrjVisibilityActivationHandoff(UID);
    assert.equal(isCrjVisibilityActivationHandoffArmed(UID), true);
    // Would-be stale conclusion must not clear presentation while armed.
    const ui = resolveVisibilityPresentation({
      profileLoaded: true,
      persistedVisibility: false,
      validationPending: true,
      validatedEffective: null,
      crjActivationProvisional: true,
    });
    assert.equal(ui.visualActive, true);
    assert.equal(ui.canStartRuntime, false);
    assert.equal(
      labelBugVis01Presentation({
        visualActive: ui.visualActive,
        canStartRuntime: ui.canStartRuntime,
        crjActivationProvisional: true,
      }),
      'active_provisional',
    );
    assert.equal(isCrjVisibilityActivationHandoffArmed(UID), true);
  });
});

describe('BUG-VIS-01 presentation matrix', () => {
  it('true pending → visual Active, runtime false', () => {
    const ui = resolveVisibilityPresentation({
      profileLoaded: true,
      persistedVisibility: true,
      validationPending: true,
      validatedEffective: null,
    });
    assert.equal(ui.visualActive, true);
    assert.equal(ui.canStartRuntime, false);
  });

  it('true validated → visual Active, runtime true', () => {
    const ui = resolveVisibilityPresentation({
      profileLoaded: true,
      persistedVisibility: true,
      validationPending: false,
      validatedEffective: true,
    });
    assert.equal(ui.visualActive, true);
    assert.equal(ui.canStartRuntime, true);
  });

  it('true with conclusive failure → Inactive', () => {
    const ui = resolveVisibilityPresentation({
      profileLoaded: true,
      persistedVisibility: true,
      validationPending: false,
      validatedEffective: false,
    });
    assert.equal(ui.visualActive, false);
    assert.equal(ui.canStartRuntime, false);
  });

  it('stable false → Inactive', () => {
    const ui = resolveVisibilityPresentation({
      profileLoaded: true,
      persistedVisibility: false,
      validationPending: false,
      validatedEffective: false,
    });
    assert.equal(ui.visualActive, false);
  });

  it('false→true rearm yields Active provisional (no Inactive paint)', () => {
    const afterRearm = resolveVisibilityPresentation({
      profileLoaded: true,
      persistedVisibility: true,
      validationPending: true,
      validatedEffective: null,
    });
    assert.equal(afterRearm.visualActive, true);
    assert.equal(afterRearm.canStartRuntime, false);
  });
});

describe('BUG-VIS-01 Home / CRJ wiring', () => {
  it('Home rearms on enter-ON and kicks focus validation', () => {
    const home = readShared('screens/MainHomeScreen.tsx');
    assert.match(home, /shouldRearmVisibilityHydration/);
    assert.match(home, /visibilityHydrationKick/);
    assert.match(home, /setVisibilityValidationPending\(true\)/);
    assert.match(home, /setValidatedEffectiveVisibility\(null\)/);
    assert.match(home, /\[loading, visibilityHydrationKick\]/);
  });

  it('Home recovery still skips preparation modal', () => {
    const home = readShared('screens/MainHomeScreen.tsx');
    const restore = home.slice(
      home.indexOf('runPostGrantRestore'),
      home.indexOf("decision.action === 'preserve-intent-then-deactivate'"),
    );
    assert.doesNotMatch(restore, /setLocationPreparing\(true\)/);
  });

  it('Nearby CTA gates on canStartRuntime, not provisional visual Active', () => {
    const home = readShared('screens/MainHomeScreen.tsx');
    assert.match(
      home,
      /canSearch = visibilityUi\.canStartRuntime === true/,
    );
    assert.doesNotMatch(home, /canSearch = pillActive === true/);
  });

  it('CRJ arms handoff with uid; Home peeks + subscribes (not consume-on-mount)', () => {
    const crj = readShared('screens/ProfileCompletionScreen.tsx');
    const home = readShared('screens/MainHomeScreen.tsx');
    assert.match(crj, /armCrjVisibilityActivationHandoff\(uid\)/);
    assert.match(crj, /activation_result/);
    assert.match(home, /isCrjVisibilityActivationHandoffArmed/);
    assert.match(home, /subscribeCrjVisibilityActivationHandoff/);
    assert.match(home, /syncCrjVisibilityActivationHandoffForUid/);
    assert.match(home, /clearCrjVisibilityActivationHandoff/);
    assert.match(home, /home_subscribed/);
    assert.match(home, /home_focused/);
    assert.match(home, /stale_inactive_blocked/);
    assert.match(home, /labelBugVis01Presentation/);
    assert.doesNotMatch(home, /consumeCrjVisibilityActivationHandoff\(\)/);
    assert.match(home, /crjActivationProvisional/);
    assert.match(
      home,
      /crjActivationProvisionalRef\.current && foregroundGranted/,
    );
  });
});

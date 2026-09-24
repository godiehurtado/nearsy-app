/**
 * BUG-VIS-01 — provisional Active before Home mounts (activation_pending first).
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
  clearCrjVisibilityActivationHandoff,
  confirmCrjVisibilityActivationHandoff,
  isCrjVisibilityActivationHandoffArmed,
  markCrjVisibilityActivationPending,
  peekCrjVisibilityActivationHandoffForTests,
  peekCrjVisibilityActivationHandoffPhaseForTests,
  resetCrjVisibilityActivationHandoffForTests,
  subscribeCrjVisibilityActivationHandoff,
  syncCrjVisibilityActivationHandoffForUid,
} from '../crjVisibilityActivationHandoff';

const sharedSrc = join(__dirname, '../..');
const UID = 'test-uid-bug-vis-01';

function readShared(rel: string): string {
  return readFileSync(join(sharedSrc, rel), 'utf8');
}

function present(input: {
  persistedVisibility: boolean | undefined;
  validationPending: boolean;
  validatedEffective: boolean | null;
  crjActivationProvisional: boolean;
}): string {
  const ui = resolveVisibilityPresentation({
    profileLoaded: true,
    ...input,
  });
  return labelBugVis01Presentation({
    visualActive: ui.visualActive,
    canStartRuntime: ui.canStartRuntime,
    crjActivationProvisional: input.crjActivationProvisional,
  });
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
});

describe('BUG-VIS-01 causal order (pending before Home)', () => {
  it('sequence: pending → Home cached false → Active provisional → confirmed (no Inactive)', () => {
    const presentations: string[] = [];

    // 1–2. CRJ about to finish → activation_pending BEFORE profileSetupCompleted
    markCrjVisibilityActivationPending(UID);
    assert.equal(peekCrjVisibilityActivationHandoffPhaseForTests(), 'pending');
    assert.equal(isCrjVisibilityActivationHandoffArmed(UID), true);

    // 3–5. AppNavigator mounts Home; first peek; cached visibility=false
    const provisional = isCrjVisibilityActivationHandoffArmed(UID);
    const first = present({
      persistedVisibility: false,
      validationPending: true,
      validatedEffective: null,
      crjActivationProvisional: provisional,
    });
    presentations.push(first);
    assert.equal(first, 'active_provisional');

    // 6–7. No intermediate Inactive; repeated cached false keeps provisional
    assert.equal(
      shouldKeepCrjProvisionalDespiteCachedOff({
        crjActivationProvisional: true,
        validatedEffective: null,
      }),
      true,
    );
    presentations.push(
      present({
        persistedVisibility: false,
        validationPending: true,
        validatedEffective: null,
        crjActivationProvisional: true,
      }),
    );

    // 8. activateVisibility success keeps Active
    confirmCrjVisibilityActivationHandoff(UID);
    assert.equal(peekCrjVisibilityActivationHandoffPhaseForTests(), 'succeeded');
    presentations.push(
      present({
        persistedVisibility: false,
        validationPending: true,
        validatedEffective: null,
        crjActivationProvisional: true,
      }),
    );

    // 9. remote true + FG → confirmed; clear provisional
    clearCrjVisibilityActivationHandoff('validated');
    presentations.push(
      present({
        persistedVisibility: true,
        validationPending: false,
        validatedEffective: true,
        crjActivationProvisional: false,
      }),
    );

    const unique = [...new Set(presentations)];
    assert.deepEqual(unique, ['active_provisional', 'active_confirmed']);
    assert.ok(!presentations.includes('inactive'));
    // Explicit forbidden sequences
    assert.notDeepEqual(presentations.slice(0, 2), [
      'inactive',
      'active_provisional',
    ]);
    assert.notDeepEqual(
      [presentations[0], presentations[presentations.length - 1]],
      ['inactive', 'active_confirmed'],
    );
  });

  it('10–11: activation failure / FG denied → Inactive and clears', () => {
    markCrjVisibilityActivationPending(UID);
    clearCrjVisibilityActivationHandoff('denied');
    assert.equal(isCrjVisibilityActivationHandoffArmed(UID), false);
    assert.equal(
      present({
        persistedVisibility: false,
        validationPending: false,
        validatedEffective: false,
        crjActivationProvisional: false,
      }),
      'inactive',
    );
  });

  it('12: Home already mounted then pending arrives via subscribe', () => {
    let armed = false;
    const unsub = subscribeCrjVisibilityActivationHandoff(() => {
      armed = syncCrjVisibilityActivationHandoffForUid(UID);
    });
    assert.equal(isCrjVisibilityActivationHandoffArmed(UID), false);
    markCrjVisibilityActivationPending(UID);
    assert.equal(armed, true);
    assert.equal(
      present({
        persistedVisibility: false,
        validationPending: true,
        validatedEffective: null,
        crjActivationProvisional: true,
      }),
      'active_provisional',
    );
    unsub();
  });

  it('13: logout / uid change clears', () => {
    markCrjVisibilityActivationPending(UID);
    clearCrjVisibilityActivationHandoff('logout');
    assert.equal(peekCrjVisibilityActivationHandoffForTests(), false);
    markCrjVisibilityActivationPending(UID);
    assert.equal(syncCrjVisibilityActivationHandoffForUid('other'), false);
  });

  it('14: existing account false without pending → Inactive', () => {
    assert.equal(peekCrjVisibilityActivationHandoffForTests(), false);
    assert.equal(
      present({
        persistedVisibility: false,
        validationPending: false,
        validatedEffective: false,
        crjActivationProvisional: false,
      }),
      'inactive',
    );
  });

  it('15: Strict Mode remount peeks pending without consuming', () => {
    markCrjVisibilityActivationPending(UID);
    assert.equal(isCrjVisibilityActivationHandoffArmed(UID), true);
    assert.equal(isCrjVisibilityActivationHandoffArmed(UID), true);
    assert.equal(peekCrjVisibilityActivationHandoffPhaseForTests(), 'pending');
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

  it('true validated → Active confirmed with runtime', () => {
    const ui = resolveVisibilityPresentation({
      profileLoaded: true,
      persistedVisibility: true,
      validationPending: false,
      validatedEffective: true,
    });
    assert.equal(ui.visualActive, true);
    assert.equal(ui.canStartRuntime, true);
  });

  it('stable false without handoff → Inactive', () => {
    const ui = resolveVisibilityPresentation({
      profileLoaded: true,
      persistedVisibility: false,
      validationPending: false,
      validatedEffective: false,
    });
    assert.equal(ui.visualActive, false);
  });
});

describe('BUG-VIS-01 Home / CRJ wiring', () => {
  it('CRJ marks pending before profileSetupCompleted; confirm after activate', () => {
    const crj = readShared('screens/ProfileCompletionScreen.tsx');
    const finish = crj.slice(crj.indexOf('async function finishOnboarding'));
    const pendingIdx = finish.indexOf('markCrjVisibilityActivationPending(uid)');
    const setupIdx = finish.indexOf('profileSetupCompleted: true');
    const activateIdx = finish.indexOf(
      'attemptInitialVisibilityAfterCrjCompletion',
    );
    const confirmIdx = finish.indexOf(
      'confirmCrjVisibilityActivationHandoff(uid)',
    );
    assert.ok(pendingIdx >= 0);
    assert.ok(setupIdx > pendingIdx);
    assert.ok(activateIdx > setupIdx);
    assert.ok(confirmIdx > activateIdx);
    assert.match(finish, /clearCrjVisibilityActivationHandoff\('denied'\)/);
  });

  it('Home peeks + subscribes; Nearby gates on canStartRuntime', () => {
    const home = readShared('screens/MainHomeScreen.tsx');
    assert.match(home, /isCrjVisibilityActivationHandoffArmed/);
    assert.match(home, /subscribeCrjVisibilityActivationHandoff/);
    assert.match(home, /activation_pending is marked BEFORE profileSetupCompleted/);
    assert.match(home, /stale_inactive_blocked/);
    assert.match(
      home,
      /canSearch = visibilityUi\.canStartRuntime === true/,
    );
    assert.doesNotMatch(home, /consumeCrjVisibilityActivationHandoff/);
  });

  it('Home rearms on enter-ON and kicks focus validation', () => {
    const home = readShared('screens/MainHomeScreen.tsx');
    assert.match(home, /shouldRearmVisibilityHydration/);
    assert.match(home, /\[loading, visibilityHydrationKick\]/);
  });
});

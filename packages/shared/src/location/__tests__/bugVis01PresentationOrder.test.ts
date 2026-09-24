/**
 * BUG-VIS-01 — CRJ → Home presentation sequence (pure).
 * Asserts Active provisional is first paint when activation_pending is armed
 * before profileSetupCompleted ejects the user into MainTabs.
 */
import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  evaluateVisibilityHydration,
  isHomeSearchEnabled,
  resolvePermissionValidationOnVisibilitySnapshot,
} from '../visibilityHydration.ts';
import {
  armCrjVisibilityActivationPending,
  clearCrjVisibilitySession,
  consumeCrjVisibilityProvisionalActive,
  getCrjVisibilitySessionPhase,
  isCrjVisibilityProvisional,
  markCrjVisibilityActivationSucceeded,
  resetCrjVisibilitySessionForTests,
  subscribeCrjVisibilitySession,
} from '../../visibility/crjVisibilityProvisional.ts';

const here = dirname(fileURLToPath(import.meta.url));

function readShared(rel: string): string {
  return readFileSync(join(here, '../../', rel), 'utf8');
}

type Pill = 'active_provisional' | 'active_confirmed' | 'inactive';

function pillFrom(input: Parameters<typeof evaluateVisibilityHydration>[0]): Pill {
  const h = evaluateVisibilityHydration(input);
  if (!h.displayActive) return 'inactive';
  if (h.runtimeEligible) return 'active_confirmed';
  return 'active_provisional';
}

function assertSequenceAllowed(seq: Pill[]): void {
  assert.notDeepEqual(
    seq.slice(0, 2),
    ['inactive', 'active_provisional'],
    'forbidden: Inactive before provisional Active',
  );
  assert.notDeepEqual(
    seq.slice(0, 2),
    ['inactive', 'active_confirmed'],
    'forbidden: Inactive before confirmed Active',
  );
}

describe('BUG-VIS-01 CRJ→Home presentation order', () => {
  beforeEach(() => {
    resetCrjVisibilitySessionForTests();
  });

  it('arms pending before profileSetupCompleted; first Home paint is Active provisional', () => {
    const seq: Pill[] = [];
    const uid = 'uid-new';

    // 1. Arm before completion write (finishOnboarding order).
    armCrjVisibilityActivationPending(uid);
    assert.equal(getCrjVisibilitySessionPhase(uid), 'activation_pending');

    // 2. profileSetupCompleted=true → gate mounts Home; cached false available.
    const homeInputCachedFalse = {
      profileLoaded: true,
      persistedVisibility: false as boolean | undefined,
      permissionValidationPending: true,
      permissionsValid: undefined as boolean | undefined,
      crjActivationProvisional: isCrjVisibilityProvisional(uid),
    };
    assert.equal(
      resolvePermissionValidationOnVisibilitySnapshot({
        previousVisibility: undefined,
        nextVisibility: false,
        crjActivationProvisional: true,
      }),
      null,
    );

    const first = pillFrom(homeInputCachedFalse);
    seq.push(first);
    assert.equal(first, 'active_provisional');
    assert.equal(
      isHomeSearchEnabled({
        displayActive: true,
        permissionsValid: undefined,
      }),
      false,
    );
    assertSequenceAllowed(seq);

    // 3. activate success keeps provisional.
    markCrjVisibilityActivationSucceeded(uid);
    assert.equal(getCrjVisibilitySessionPhase(uid), 'activation_succeeded');
    seq.push(
      pillFrom({
        ...homeInputCachedFalse,
        crjActivationProvisional: isCrjVisibilityProvisional(uid),
      }),
    );
    assert.equal(seq[1], 'active_provisional');
    assertSequenceAllowed(seq);

    // 4. remote true + FG valid → confirmed.
    seq.push(
      pillFrom({
        profileLoaded: true,
        persistedVisibility: true,
        permissionValidationPending: false,
        permissionsValid: true,
        crjActivationProvisional: isCrjVisibilityProvisional(uid),
      }),
    );
    assert.equal(seq[2], 'active_confirmed');
    assert.deepEqual(seq, [
      'active_provisional',
      'active_provisional',
      'active_confirmed',
    ]);
  });

  it('never emits Inactive before Active when pending armed', () => {
    armCrjVisibilityActivationPending('u1');
    const paints: Pill[] = [];
    for (const vis of [false, false, true] as const) {
      paints.push(
        pillFrom({
          profileLoaded: true,
          persistedVisibility: vis,
          permissionValidationPending: true,
          permissionsValid: undefined,
          crjActivationProvisional: true,
        }),
      );
    }
    assert.equal(paints.includes('inactive'), false);
    assert.equal(paints[0], 'active_provisional');
    assertSequenceAllowed(paints);
  });

  it('activation failure clears → Inactive', () => {
    armCrjVisibilityActivationPending('u-fail');
    clearCrjVisibilitySession('u-fail');
    assert.equal(isCrjVisibilityProvisional('u-fail'), false);
    const h = pillFrom({
      profileLoaded: true,
      persistedVisibility: false,
      permissionValidationPending: false,
      permissionsValid: false,
      crjActivationProvisional: false,
    });
    assert.equal(h, 'inactive');
  });

  it('FG denied under provisional → Inactive', () => {
    armCrjVisibilityActivationPending('u-deny');
    const h = pillFrom({
      profileLoaded: true,
      persistedVisibility: false,
      permissionValidationPending: false,
      permissionsValid: false,
      crjActivationProvisional: true,
    });
    assert.equal(h, 'inactive');
  });

  it('subscribe notifies pre-mounted Home when pending arms', () => {
    let notified = 0;
    const unsub = subscribeCrjVisibilitySession(() => {
      notified += 1;
    });
    armCrjVisibilityActivationPending('u-live');
    assert.ok(notified >= 1);
    assert.equal(isCrjVisibilityProvisional('u-live'), true);
    unsub();
  });

  it('Strict Mode remount peek does not drop pending', () => {
    armCrjVisibilityActivationPending('u-strict');
    assert.equal(consumeCrjVisibilityProvisionalActive('u-strict'), true);
    assert.equal(isCrjVisibilityProvisional('u-strict'), true);
    assert.equal(consumeCrjVisibilityProvisionalActive('u-strict'), true);
  });

  it('existing account / no pending + visibility false → Inactive', () => {
    clearCrjVisibilitySession();
    assert.equal(isCrjVisibilityProvisional('u-existing'), false);
    assert.equal(
      pillFrom({
        profileLoaded: true,
        persistedVisibility: false,
        permissionValidationPending: false,
        permissionsValid: false,
      }),
      'inactive',
    );
  });

  it('logout/uid clear drops session', () => {
    armCrjVisibilityActivationPending('u-a');
    clearCrjVisibilitySession();
    assert.equal(getCrjVisibilitySessionPhase('u-a'), 'none');
  });

  it('finishOnboarding arms before profileSetupCompleted write', () => {
    const src = readShared('screens/ProfileCompletionScreen.tsx');
    const arm = src.indexOf('armCrjVisibilityActivationPending');
    const completed = src.indexOf('profileSetupCompleted: true');
    assert.ok(arm > 0 && completed > arm);
    assert.match(src, /markCrjVisibilityActivationSucceeded/);
    assert.match(src, /clearCrjVisibilitySession/);
  });

  it('Home peeks/subscribes; does not consume-on-mount', () => {
    const home = readShared('screens/MainHomeScreen.tsx');
    assert.match(home, /isCrjVisibilityProvisional/);
    assert.match(home, /subscribeCrjVisibilitySession/);
    assert.match(home, /clearCrjVisibilitySession/);
    assert.doesNotMatch(
      home,
      /consumeCrjVisibilityProvisionalActive\(uid\)/,
    );
  });
});

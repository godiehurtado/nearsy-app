/**
 * Visibility presentation across logout / login / remount (PR #72 QA).
 *
 * Run:
 *   node --experimental-strip-types --test packages/shared/src/visibility/__tests__/visibilityAcrossSessions.test.ts
 */
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  forgetLastConfirmedVisibility,
  lastConfirmedVisibilityKey,
  loadLastConfirmedVisibility,
  peekLastConfirmedVisibility,
  recordConfirmedVisibility,
  resetLastConfirmedVisibilityForTests,
  shouldHoldCachedVisibilitySnapshot,
  shouldRecordSnapshotVisibility,
  type LastConfirmedVisibilityStorage,
} from '../lastConfirmedVisibility.ts';
import {
  evaluateVisibilityHydration,
  isHomeSearchEnabled,
  resolvePermissionValidationOnVisibilitySnapshot,
} from '../../location/visibilityHydration.ts';
import { runContractualAndroidLogout } from '../../location/contractualLogout.ts';

const UID_A = 'uid-account-a';
const UID_B = 'uid-account-b';

function memoryStorage(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));
  const storage: LastConfirmedVisibilityStorage = {
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value);
    },
    removeItem: async (key) => {
      data.delete(key);
    },
  };
  return { storage, data };
}

function readSource(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
}

/** Simulates a fresh process: memory gone, storage persists. */
function coldStart() {
  resetLastConfirmedVisibilityForTests();
}

async function logout(): Promise<string[]> {
  const steps: string[] = [];
  await runContractualAndroidLogout({
    clearSocialPrefill: () => steps.push('prefill'),
    closePublicationGate: () => steps.push('closeGate'),
    stopBackground: async () => {
      steps.push('stopRuntime');
    },
    drainInFlightPublications: async () => {
      steps.push('drain');
    },
    signOut: async () => {
      steps.push('signOut');
    },
  });
  return steps;
}

/** First Home render after login, before any snapshot. */
function firstPresentation(uid: string) {
  return evaluateVisibilityHydration({
    profileLoaded: false,
    persistedVisibility: undefined,
    permissionValidationPending: false,
    permissionsValid: undefined,
    lastConfirmedVisibility: peekLastConfirmedVisibility(uid),
  });
}

beforeEach(() => {
  resetLastConfirmedVisibilityForTests();
});

describe('logout never writes Visibility', () => {
  it('closes the gate, stops runtime, drains and signs out', async () => {
    assert.deepEqual(await logout(), [
      'prefill',
      'closeGate',
      'stopRuntime',
      'drain',
      'signOut',
    ]);
  });

  it('keeps the per-uid hint across logout (remote preference untouched)', async () => {
    const { storage, data } = memoryStorage();
    await recordConfirmedVisibility(UID_A, true, storage);
    await logout();
    assert.equal(peekLastConfirmedVisibility(UID_A), true);
    assert.equal(data.get(lastConfirmedVisibilityKey(UID_A)), '1');
  });
});

describe('1. Active → logout → login presents Active', () => {
  it('same process: first presentation is Active provisional', async () => {
    const { storage } = memoryStorage();
    await recordConfirmedVisibility(UID_A, true, storage);
    await logout();
    const first = firstPresentation(UID_A);
    assert.equal(first.phase, 'validating');
    assert.equal(first.displayActive, true);
    assert.equal(first.runtimeEligible, false);
  });

  it('cold start: storage hint restores Active provisional', async () => {
    const { storage } = memoryStorage();
    await recordConfirmedVisibility(UID_A, true, storage);
    await logout();
    coldStart();
    assert.equal(peekLastConfirmedVisibility(UID_A), undefined);
    assert.equal(await loadLastConfirmedVisibility(UID_A, storage), true);
    assert.equal(firstPresentation(UID_A).displayActive, true);
  });

  it('snapshot true + permissions → confirmed Active', () => {
    const r = evaluateVisibilityHydration({
      profileLoaded: true,
      persistedVisibility: true,
      permissionValidationPending: false,
      permissionsValid: true,
      lastConfirmedVisibility: true,
    });
    assert.equal(r.phase, 'active');
    assert.equal(r.runtimeEligible, true);
  });
});

describe('2. Explicit OFF → logout → login presents Inactive', () => {
  it('stored OFF never paints Active', async () => {
    const { storage } = memoryStorage();
    await recordConfirmedVisibility(UID_A, false, storage);
    await logout();
    coldStart();
    await loadLastConfirmedVisibility(UID_A, storage);
    const first = firstPresentation(UID_A);
    assert.equal(first.displayActive, false);
    const loaded = evaluateVisibilityHydration({
      profileLoaded: true,
      persistedVisibility: false,
      permissionValidationPending: false,
      lastConfirmedVisibility: false,
    });
    assert.equal(loaded.phase, 'inactive');
    assert.equal(loaded.shouldDeactivate, false);
  });
});

describe('3. Account isolation', () => {
  it('user B never inherits user A Active', async () => {
    const { storage } = memoryStorage();
    await recordConfirmedVisibility(UID_A, true, storage);
    await logout();
    assert.equal(peekLastConfirmedVisibility(UID_B), undefined);
    assert.equal(await loadLastConfirmedVisibility(UID_B, storage), undefined);
    assert.equal(firstPresentation(UID_B).displayActive, false);
    await recordConfirmedVisibility(UID_B, false, storage);
    assert.equal(firstPresentation(UID_B).displayActive, false);
    assert.equal(peekLastConfirmedVisibility(UID_A), true);
  });

  it('keys are namespaced per uid and values carry no PII', async () => {
    const { storage, data } = memoryStorage();
    await recordConfirmedVisibility(UID_A, true, storage);
    await recordConfirmedVisibility(UID_B, false, storage);
    assert.notEqual(
      lastConfirmedVisibilityKey(UID_A),
      lastConfirmedVisibilityKey(UID_B),
    );
    for (const value of data.values()) {
      assert.match(value, /^[01]$/);
    }
  });

  it('missing uid never reads or writes', async () => {
    const { storage, data } = memoryStorage();
    await recordConfirmedVisibility(null, true, storage);
    assert.equal(data.size, 0);
    assert.equal(peekLastConfirmedVisibility(undefined), undefined);
    assert.equal(await loadLastConfirmedVisibility('', storage), undefined);
  });

  it('account deletion forgets the hint', async () => {
    const { storage, data } = memoryStorage();
    await recordConfirmedVisibility(UID_A, true, storage);
    await forgetLastConfirmedVisibility(UID_A, storage);
    assert.equal(peekLastConfirmedVisibility(UID_A), undefined);
    assert.equal(data.size, 0);
  });

  it('corrupt or failing storage degrades to unknown', async () => {
    const { storage } = memoryStorage({
      [lastConfirmedVisibilityKey(UID_A)]: 'true',
    });
    assert.equal(await loadLastConfirmedVisibility(UID_A, storage), undefined);
    const failing: LastConfirmedVisibilityStorage = {
      getItem: async () => {
        throw new Error('io');
      },
      setItem: async () => {
        throw new Error('io');
      },
      removeItem: async () => {
        throw new Error('io');
      },
    };
    assert.equal(await loadLastConfirmedVisibility(UID_B, failing), undefined);
    await recordConfirmedVisibility(UID_B, true, failing);
    assert.equal(peekLastConfirmedVisibility(UID_B), true);
  });
});

describe('4. Slow snapshot', () => {
  it('stays Active provisional with runtime and search blocked', () => {
    const pending = evaluateVisibilityHydration({
      profileLoaded: false,
      persistedVisibility: undefined,
      permissionValidationPending: false,
      lastConfirmedVisibility: true,
    });
    assert.equal(pending.phase, 'validating');
    assert.equal(pending.displayActive, true);
    assert.equal(pending.runtimeEligible, false);
    assert.equal(pending.toggleDisabled, true);
    assert.equal(
      isHomeSearchEnabled({
        displayActive: pending.displayActive,
        permissionsValid: undefined,
      }),
      false,
    );
  });

  it('without a hint stays unknown (false is not "not hydrated")', () => {
    const pending = evaluateVisibilityHydration({
      profileLoaded: false,
      persistedVisibility: undefined,
      permissionValidationPending: false,
    });
    assert.equal(pending.phase, 'unknown');
    assert.equal(pending.shouldDeactivate, false);
  });
});

describe('5. Snapshot true / false', () => {
  it('records only server-confirmed booleans', () => {
    assert.equal(
      shouldRecordSnapshotVisibility({ fromCache: false, nextVisibility: true }),
      true,
    );
    assert.equal(
      shouldRecordSnapshotVisibility({ fromCache: false, nextVisibility: false }),
      true,
    );
    assert.equal(
      shouldRecordSnapshotVisibility({ fromCache: true, nextVisibility: true }),
      false,
    );
    assert.equal(
      shouldRecordSnapshotVisibility({
        fromCache: false,
        nextVisibility: undefined,
      }),
      false,
    );
  });

  it('cached not-Active snapshot is held while the hint is Active', () => {
    assert.equal(
      shouldHoldCachedVisibilitySnapshot({
        fromCache: true,
        nextVisibility: false,
        lastConfirmedVisibility: true,
      }),
      true,
    );
    const held = evaluateVisibilityHydration({
      profileLoaded: true,
      persistedVisibility: undefined,
      permissionValidationPending: false,
      permissionsValid: false,
      lastConfirmedVisibility: true,
    });
    assert.equal(held.displayActive, true);
    assert.equal(held.runtimeEligible, false);
  });

  it('server false is explicit → Inactive, and never held', () => {
    assert.equal(
      shouldHoldCachedVisibilitySnapshot({
        fromCache: false,
        nextVisibility: false,
        lastConfirmedVisibility: true,
      }),
      false,
    );
    const patch = resolvePermissionValidationOnVisibilitySnapshot({
      previousVisibility: undefined,
      nextVisibility: false,
    });
    const r = evaluateVisibilityHydration({
      profileLoaded: true,
      persistedVisibility: false,
      permissionValidationPending: patch!.permissionValidationPending,
      permissionsValid: patch!.permissionsValid,
      lastConfirmedVisibility: true,
    });
    assert.equal(r.phase, 'inactive');
    assert.equal(r.displayActive, false);
  });

  it('no hold without an Active hint or for a cached true', () => {
    assert.equal(
      shouldHoldCachedVisibilitySnapshot({
        fromCache: true,
        nextVisibility: false,
        lastConfirmedVisibility: false,
      }),
      false,
    );
    assert.equal(
      shouldHoldCachedVisibilitySnapshot({
        fromCache: true,
        nextVisibility: false,
        lastConfirmedVisibility: undefined,
      }),
      false,
    );
    assert.equal(
      shouldHoldCachedVisibilitySnapshot({
        fromCache: true,
        nextVisibility: true,
        lastConfirmedVisibility: true,
      }),
      false,
    );
  });

  it('a loaded value always wins over the hint', () => {
    const r = evaluateVisibilityHydration({
      profileLoaded: true,
      persistedVisibility: false,
      permissionValidationPending: false,
      lastConfirmedVisibility: true,
    });
    assert.equal(r.phase, 'inactive');
  });
});

describe('6. Permissions granted / denied', () => {
  it('granted → Active, denied → Inactive with deactivate', () => {
    const granted = evaluateVisibilityHydration({
      profileLoaded: true,
      persistedVisibility: true,
      permissionValidationPending: false,
      permissionsValid: true,
      lastConfirmedVisibility: true,
    });
    assert.equal(granted.phase, 'active');
    const denied = evaluateVisibilityHydration({
      profileLoaded: true,
      persistedVisibility: true,
      permissionValidationPending: false,
      permissionsValid: false,
      lastConfirmedVisibility: true,
    });
    assert.equal(denied.phase, 'inactive');
    assert.equal(denied.shouldDeactivate, true);
  });
});

describe('7. No runtime or search while provisional', () => {
  it('every provisional path keeps runtimeEligible=false and canSearch=false', () => {
    const cases = [
      { profileLoaded: false, persistedVisibility: undefined },
      { profileLoaded: true, persistedVisibility: undefined },
      { profileLoaded: true, persistedVisibility: true },
    ] as const;
    for (const c of cases) {
      const r = evaluateVisibilityHydration({
        ...c,
        permissionValidationPending: true,
        permissionsValid: undefined,
        lastConfirmedVisibility: true,
      });
      assert.equal(r.displayActive, true);
      assert.equal(r.runtimeEligible, false);
      assert.equal(
        isHomeSearchEnabled({
          displayActive: r.displayActive,
          permissionsValid: undefined,
        }),
        false,
      );
    }
  });
});

describe('8. CRJ provisional flow unchanged', () => {
  it('CRJ pending is provisional regardless of the hint', () => {
    for (const hint of [undefined, false, true]) {
      const r = evaluateVisibilityHydration({
        profileLoaded: true,
        persistedVisibility: false,
        permissionValidationPending: true,
        crjActivationProvisional: true,
        lastConfirmedVisibility: hint,
      });
      assert.equal(r.phase, 'validating');
      assert.equal(r.runtimeEligible, false);
    }
  });

  it('CRJ + denied permissions still lands Inactive', () => {
    const r = evaluateVisibilityHydration({
      profileLoaded: true,
      persistedVisibility: true,
      permissionValidationPending: false,
      permissionsValid: false,
      crjActivationProvisional: true,
      lastConfirmedVisibility: true,
    });
    assert.equal(r.phase, 'inactive');
  });
});

describe('9. One post-auth contract for every provider', () => {
  it('AppNavigator warms the hint by uid only, with no provider branch', () => {
    const nav = readSource('../../navigation/AppNavigator.tsx');
    assert.match(nav, /loadLastConfirmedVisibility\(uid, AsyncStorage\)/);
    const home = readSource('../../screens/MainHomeScreen.tsx');
    assert.doesNotMatch(home, /providerId|facebook|google|linkedin/i);
    assert.match(home, /lastConfirmedVisibility,\r?\n\s*runtimeConfirmed,/);
  });

  it('More logout is provider-agnostic and never deactivates', () => {
    const more = readSource('../../screens/MoreScreen.tsx');
    assert.match(more, /runContractualAndroidLogout\(/);
    assert.doesNotMatch(more, /deactivateVisibilityFlow/);
  });

  it('Home records explicit toggles and server snapshots only', () => {
    const home = readSource('../../screens/MainHomeScreen.tsx');
    assert.match(home, /recordConfirmedVisibility\(uid, true, AsyncStorage\)/);
    assert.match(home, /recordConfirmedVisibility\(uid, false, AsyncStorage\)/);
    assert.match(home, /shouldRecordSnapshotVisibility\(/);
    assert.match(home, /shouldHoldCachedVisibilitySnapshot\(/);
  });
});

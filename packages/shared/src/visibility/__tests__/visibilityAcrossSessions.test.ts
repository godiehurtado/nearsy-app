/**
 * Visibility presentation across logout/login and Home remounts.
 *
 * Contract: logout never writes visibility=false; an account left Active
 * presents Active (provisional) first, an account left OFF stays OFF, state is
 * isolated per UID and provisional presentation never enables runtime/search.
 */
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  labelBugVis01Presentation,
  resolveVisibilityPresentation,
  type VisibilityPresentationInput,
} from '../visibilityPresentation';
import {
  VISIBILITY_LAST_KNOWN_KEY_PREFIX,
  clearLastKnownVisibility,
  peekLastKnownVisibility,
  readLastKnownVisibility,
  recordConfirmedVisibility,
  resetLastKnownVisibilityForTests,
  resolveVisibilitySnapshotHydration,
  type VisibilityLastKnownStorage,
  type VisibilitySnapshotHydration,
} from '../visibilityLastKnown';
import {
  markCrjVisibilityActivationPending,
  isCrjVisibilityActivationHandoffArmed,
  resetCrjVisibilityActivationHandoffForTests,
  syncCrjVisibilityActivationHandoffForUid,
} from '../crjVisibilityActivationHandoff';
import { LOGOUT_CLEANUP_ORDER } from '../backgroundLocationRuntimeGates';

const sharedSrc = join(__dirname, '../..');
const UID_A = 'test-uid-across-sessions-a';
const UID_B = 'test-uid-across-sessions-b';

function readShared(rel: string): string {
  return readFileSync(join(sharedSrc, rel), 'utf8');
}

function createStorage(): VisibilityLastKnownStorage & {
  data: Map<string, string>;
} {
  const data = new Map<string, string>();
  return {
    data,
    async getItem(key) {
      return data.has(key) ? (data.get(key) as string) : null;
    },
    async setItem(key, value) {
      data.set(key, value);
    },
    async removeItem(key) {
      data.delete(key);
    },
  };
}

type Snapshot = {
  exists?: boolean;
  fromCache: boolean;
  visibility: boolean | undefined;
};

/**
 * Mirrors MainHomeScreen hydration: snapshot → hydration decision →
 * presentation inputs (validation stays pending until the server confirms).
 */
function presentSnapshot(input: {
  snapshot: Snapshot | null;
  lastKnown: boolean | null;
  persistedConfirmed: boolean;
  validationPending?: boolean;
  validatedEffective?: boolean | null;
  crjActivationProvisional?: boolean;
}): {
  label: string;
  canStartRuntime: boolean;
  hydration: VisibilitySnapshotHydration | null;
} {
  const crj = input.crjActivationProvisional === true;
  if (!input.snapshot) {
    const ui = resolveVisibilityPresentation({
      profileLoaded: false,
      persistedVisibility: undefined,
      validationPending: false,
      validatedEffective: null,
    });
    return {
      label: labelBugVis01Presentation({
        visualActive: ui.visualActive,
        canStartRuntime: ui.canStartRuntime,
        crjActivationProvisional: crj,
      }),
      canStartRuntime: ui.canStartRuntime,
      hydration: null,
    };
  }
  const hydration = resolveVisibilitySnapshotHydration({
    exists: input.snapshot.exists !== false,
    fromCache: input.snapshot.fromCache,
    persistedVisibility: input.snapshot.visibility,
    lastKnownVisibility: input.lastKnown,
  });
  const concludedInactive = hydration === 'inactive' && !crj;
  const ui = resolveVisibilityPresentation({
    profileLoaded: hydration !== 'await_confirmation' || crj,
    persistedVisibility: input.snapshot.visibility,
    validationPending: input.validationPending ?? !concludedInactive,
    validatedEffective:
      input.validatedEffective !== undefined
        ? input.validatedEffective
        : concludedInactive
          ? false
          : null,
    crjActivationProvisional: crj,
    lastKnownActiveProvisional: hydration === 'last_known_provisional',
    persistedConfirmed: input.persistedConfirmed,
  });
  return {
    label: labelBugVis01Presentation({
      visualActive: ui.visualActive,
      canStartRuntime: ui.canStartRuntime,
      crjActivationProvisional: crj,
    }),
    canStartRuntime: ui.canStartRuntime,
    hydration,
  };
}

function assertNoInactiveBeforeActive(sequence: string[]): void {
  const firstActive = sequence.findIndex((l) => l.startsWith('active'));
  if (firstActive < 0) return;
  assert.equal(
    sequence.slice(0, firstActive).includes('inactive'),
    false,
    `Inactive frame before Active: ${sequence.join(' → ')}`,
  );
}

beforeEach(() => {
  resetLastKnownVisibilityForTests();
  resetCrjVisibilityActivationHandoffForTests();
});

describe('Logout never writes Visibility', () => {
  it('MoreScreen logout stops runtime and signs out without deactivating', () => {
    const more = readShared('screens/MoreScreen.tsx');
    const logout = more.slice(
      more.indexOf('const handleLogout'),
      more.indexOf('const openCalendar'),
    );
    assert.match(logout, /stopBackgroundLocationRuntime/);
    assert.match(logout, /firebaseAuth\.signOut/);
    assert.doesNotMatch(
      logout,
      /deactivateVisibility|updateUserProfilePartial|visibility:\s*false/,
    );
    assert.doesNotMatch(more, /deactivateVisibilityFlow/);
    assert.deepEqual([...LOGOUT_CLEANUP_ORDER], [
      'stopBackgroundLocationRuntime',
      'firebaseAuth.signOut',
    ]);
  });

  it('logout keeps the per-UID last known state; account deletion clears it', () => {
    const more = readShared('screens/MoreScreen.tsx');
    const navigator = readShared('navigation/AppNavigator.tsx');
    assert.doesNotMatch(more, /clearLastKnownVisibility/);
    assert.doesNotMatch(navigator, /clearLastKnownVisibility/);
    const deletion = readShared('screens/DeleteAccountScreen.tsx');
    assert.match(
      deletion,
      /const deletingUid = firebaseAuth\.currentUser\?\.uid;\s*await deleteAccountAndData\(\);\s*await runSuccessfulDeletionExit\(deletingUid\);/,
    );
    assert.match(deletion, /clearLastKnownVisibility\(AsyncStorage, deletedUid\)/);
  });
});

describe('1. Active → logout → login', () => {
  it('server keeps ON: provisional on cached ON, confirmed after server + FG', async () => {
    const storage = createStorage();
    await recordConfirmedVisibility(storage, UID_A, true, 'server_snapshot');
    // Logout: nothing clears the record and nothing writes the profile.
    const lastKnown = await readLastKnownVisibility(storage, UID_A);
    assert.equal(lastKnown, true);

    const sequence = [
      presentSnapshot({ snapshot: null, lastKnown, persistedConfirmed: false }),
      presentSnapshot({
        snapshot: { fromCache: true, visibility: true },
        lastKnown,
        persistedConfirmed: false,
      }),
      presentSnapshot({
        snapshot: { fromCache: false, visibility: true },
        lastKnown,
        persistedConfirmed: true,
      }),
      presentSnapshot({
        snapshot: { fromCache: false, visibility: true },
        lastKnown,
        persistedConfirmed: true,
        validationPending: false,
        validatedEffective: true,
      }),
    ];
    assert.deepEqual(
      sequence.map((s) => s.label),
      ['neutral', 'active_provisional', 'active_provisional', 'active_confirmed'],
    );
    assert.deepEqual(
      sequence.map((s) => s.canStartRuntime),
      [false, false, false, true],
    );
  });

  it('stale cached OFF with last known ON stays Active provisional (no Inactive frame)', () => {
    const sequence = [
      presentSnapshot({
        snapshot: { fromCache: true, visibility: false },
        lastKnown: true,
        persistedConfirmed: false,
      }),
      presentSnapshot({
        snapshot: { fromCache: false, visibility: true },
        lastKnown: true,
        persistedConfirmed: true,
      }),
      presentSnapshot({
        snapshot: { fromCache: false, visibility: true },
        lastKnown: true,
        persistedConfirmed: true,
        validationPending: false,
        validatedEffective: true,
      }),
    ];
    assert.equal(sequence[0]!.hydration, 'last_known_provisional');
    assert.deepEqual(
      sequence.map((s) => s.label),
      ['active_provisional', 'active_provisional', 'active_confirmed'],
    );
    assertNoInactiveBeforeActive(sequence.map((s) => s.label));
  });

  it('cold start: persisted last known survives a process restart', async () => {
    const storage = createStorage();
    await recordConfirmedVisibility(storage, UID_A, true, 'explicit_action');
    resetLastKnownVisibilityForTests();
    assert.equal(peekLastKnownVisibility(UID_A), null);
    assert.equal(await readLastKnownVisibility(storage, UID_A), true);
    assert.equal(peekLastKnownVisibility(UID_A), true);
  });
});

describe('2. OFF → logout → login', () => {
  it('account left OFF never presents Active', async () => {
    const storage = createStorage();
    await recordConfirmedVisibility(storage, UID_A, false, 'explicit_action');
    const lastKnown = await readLastKnownVisibility(storage, UID_A);
    assert.equal(lastKnown, false);

    const sequence = [
      presentSnapshot({ snapshot: null, lastKnown, persistedConfirmed: false }),
      presentSnapshot({
        snapshot: { fromCache: true, visibility: false },
        lastKnown,
        persistedConfirmed: false,
      }),
      presentSnapshot({
        snapshot: { fromCache: false, visibility: false },
        lastKnown,
        persistedConfirmed: true,
      }),
    ];
    assert.deepEqual(
      sequence.map((s) => s.label),
      ['neutral', 'inactive', 'inactive'],
    );
    assert.ok(sequence.every((s) => !s.canStartRuntime));
  });
});

describe('3. UID change isolation', () => {
  it('user B never inherits user A presentation', async () => {
    const storage = createStorage();
    await recordConfirmedVisibility(storage, UID_A, true, 'server_snapshot');

    assert.equal(peekLastKnownVisibility(UID_B), null);
    assert.equal(await readLastKnownVisibility(storage, UID_B), null);

    const cachedOff = presentSnapshot({
      snapshot: { fromCache: true, visibility: false },
      lastKnown: await readLastKnownVisibility(storage, UID_B),
      persistedConfirmed: false,
    });
    assert.equal(cachedOff.hydration, 'await_confirmation');
    assert.equal(cachedOff.label, 'neutral');

    const serverOff = presentSnapshot({
      snapshot: { fromCache: false, visibility: false },
      lastKnown: null,
      persistedConfirmed: true,
    });
    assert.equal(serverOff.label, 'inactive');
    assert.equal(peekLastKnownVisibility(UID_A), true);
  });

  it('records are namespaced per UID and store only a boolean flag', async () => {
    const storage = createStorage();
    await recordConfirmedVisibility(storage, UID_A, true, 'server_snapshot');
    await recordConfirmedVisibility(storage, UID_B, false, 'server_snapshot');
    assert.deepEqual(
      [...storage.data.entries()].sort(),
      [
        [`${VISIBILITY_LAST_KNOWN_KEY_PREFIX}${UID_A}`, '1'],
        [`${VISIBILITY_LAST_KNOWN_KEY_PREFIX}${UID_B}`, '0'],
      ].sort(),
    );
    await clearLastKnownVisibility(storage, UID_A);
    assert.equal(peekLastKnownVisibility(UID_A), null);
    assert.equal(peekLastKnownVisibility(UID_B), false);
    assert.equal(storage.data.size, 1);
  });

  it('empty UID is ignored and CRJ handoff clears on UID mismatch', async () => {
    const storage = createStorage();
    await recordConfirmedVisibility(storage, '  ', true, 'server_snapshot');
    assert.equal(storage.data.size, 0);
    assert.equal(peekLastKnownVisibility(''), null);

    markCrjVisibilityActivationPending(UID_A);
    assert.equal(syncCrjVisibilityActivationHandoffForUid(UID_B), false);
    assert.equal(isCrjVisibilityActivationHandoffArmed(UID_A), false);
  });

  it('Home hydrates from the current UID and the main stack remounts per UID', () => {
    const home = readShared('screens/MainHomeScreen.tsx');
    const navigator = readShared('navigation/AppNavigator.tsx');
    assert.match(
      home,
      /peekLastKnownVisibility\(firebaseAuth\.currentUser\?\.uid\)/,
    );
    assert.match(home, /readLastKnownVisibility\(AsyncStorage, uid\)/);
    assert.match(navigator, /key=\{`auth-main-\$\{uid\}`\}/);
  });
});

describe('4. Slow snapshot', () => {
  it('neutral until the first snapshot; cache miss stays neutral, not Inactive', () => {
    assert.equal(
      presentSnapshot({ snapshot: null, lastKnown: true, persistedConfirmed: false })
        .label,
      'neutral',
    );
    const cacheMiss = presentSnapshot({
      snapshot: { exists: false, fromCache: true, visibility: undefined },
      lastKnown: null,
      persistedConfirmed: false,
    });
    assert.equal(cacheMiss.hydration, 'await_confirmation');
    assert.equal(cacheMiss.label, 'neutral');
  });

  it('Home subscribes with metadata changes and validates only after server confirmation', () => {
    const home = readShared('screens/MainHomeScreen.tsx');
    assert.match(home, /includeMetadataChanges: true/);
    assert.match(home, /if \(!persistedConfirmedRef\.current\) return;/);
    assert.match(
      home,
      /if \(firstConfirmation && !hydrationValidationDoneRef\.current\) \{[\s\S]{0,120}setVisibilityHydrationKick/,
    );
    assert.match(
      home,
      /profileLoaded: !loading && \(visibilityKnown \|\| crjActivationProvisional\)/,
    );
  });
});

describe('5. Snapshot true and false', () => {
  const table: Array<[Snapshot, boolean | null, VisibilitySnapshotHydration]> = [
    [{ fromCache: false, visibility: true }, null, 'active_pending'],
    [{ fromCache: true, visibility: true }, false, 'active_pending'],
    [{ fromCache: false, visibility: false }, true, 'inactive'],
    [{ fromCache: false, visibility: undefined }, true, 'inactive'],
    [{ fromCache: true, visibility: false }, true, 'last_known_provisional'],
    [{ fromCache: true, visibility: false }, false, 'inactive'],
    [{ fromCache: true, visibility: false }, null, 'await_confirmation'],
    [{ exists: false, fromCache: false, visibility: undefined }, true, 'inactive'],
  ];
  for (const [snapshot, lastKnown, expected] of table) {
    it(`fromCache=${snapshot.fromCache} visibility=${String(snapshot.visibility)} lastKnown=${String(lastKnown)} → ${expected}`, () => {
      assert.equal(
        resolveVisibilitySnapshotHydration({
          exists: snapshot.exists !== false,
          fromCache: snapshot.fromCache,
          persistedVisibility: snapshot.visibility,
          lastKnownVisibility: lastKnown,
        }),
        expected,
      );
    });
  }

  it('explicit server false concludes Inactive even after Active provisional', () => {
    const sequence = [
      presentSnapshot({
        snapshot: { fromCache: true, visibility: false },
        lastKnown: true,
        persistedConfirmed: false,
      }).label,
      presentSnapshot({
        snapshot: { fromCache: false, visibility: false },
        lastKnown: true,
        persistedConfirmed: true,
      }).label,
    ];
    assert.deepEqual(sequence, ['active_provisional', 'inactive']);
  });

  it('only server snapshots or explicit actions update the last known state', () => {
    const home = readShared('screens/MainHomeScreen.tsx');
    assert.match(
      home,
      /if \(data && !fromCache\) \{[\s\S]{0,260}recordConfirmedVisibility\([\s\S]{0,80}'server_snapshot'/,
    );
    const records = home.match(/recordConfirmedVisibility\(/g) ?? [];
    const explicit = home.match(/'explicit_action'/g) ?? [];
    const server = home.match(/'server_snapshot'/g) ?? [];
    assert.equal(records.length, explicit.length + server.length);
    assert.equal(server.length, 1);
  });
});

describe('6. Permissions granted / denied', () => {
  it('granted after server ON → Active confirmed; denied → Inactive', () => {
    const granted = presentSnapshot({
      snapshot: { fromCache: false, visibility: true },
      lastKnown: true,
      persistedConfirmed: true,
      validationPending: false,
      validatedEffective: true,
    });
    assert.equal(granted.label, 'active_confirmed');
    assert.equal(granted.canStartRuntime, true);

    const denied = presentSnapshot({
      snapshot: { fromCache: false, visibility: true },
      lastKnown: true,
      persistedConfirmed: true,
      validationPending: false,
      validatedEffective: false,
    });
    assert.equal(denied.label, 'inactive');
    assert.equal(denied.canStartRuntime, false);
  });

  it('conclusive FG failure ends last-known provisional', () => {
    const ui = resolveVisibilityPresentation({
      profileLoaded: true,
      persistedVisibility: false,
      validationPending: false,
      validatedEffective: false,
      lastKnownActiveProvisional: true,
      persistedConfirmed: false,
    });
    assert.equal(ui.visualActive, false);
    assert.equal(ui.canStartRuntime, false);
  });
});

describe('7. Provisional never enables runtime/search', () => {
  it('no combination with provisional or unconfirmed data starts runtime', () => {
    const bools = [true, false];
    const validated: Array<boolean | null> = [true, false, null];
    for (const persistedVisibility of [true, false, undefined]) {
      for (const validationPending of bools) {
        for (const validatedEffective of validated) {
          for (const crjActivationProvisional of bools) {
            for (const lastKnownActiveProvisional of bools) {
              for (const persistedConfirmed of bools) {
                const input: VisibilityPresentationInput = {
                  profileLoaded: true,
                  persistedVisibility,
                  validationPending,
                  validatedEffective,
                  crjActivationProvisional,
                  lastKnownActiveProvisional,
                  persistedConfirmed,
                };
                const ui = resolveVisibilityPresentation(input);
                const eligible =
                  persistedVisibility === true &&
                  persistedConfirmed &&
                  validatedEffective === true;
                if (!eligible) {
                  assert.equal(
                    ui.canStartRuntime,
                    false,
                    JSON.stringify(input),
                  );
                }
              }
            }
          }
        }
      }
    }
  });

  it('Home search and runtime stay gated by validated eligibility', () => {
    const home = readShared('screens/MainHomeScreen.tsx');
    assert.match(home, /const canSearch = visibilityUi\.canStartRuntime === true;/);
    const focusStart = home.search(
      /useFocusEffect\(\s*useCallback\(\(\) => \{\s*let cancelled/,
    );
    assert.ok(focusStart > 0, 'focus validation effect present');
    const focus = home.slice(focusStart);
    const guardIdx = focus.indexOf('if (!persistedConfirmedRef.current) return;');
    const syncIdx = focus.indexOf('syncBackgroundLocationRuntime');
    const reconcileIdx = focus.indexOf('reconcileVisibilityWithForegroundPermission');
    assert.ok(guardIdx > 0, 'focus guard present');
    assert.ok(syncIdx > guardIdx && reconcileIdx > guardIdx);
  });
});

describe('8. CRJ handoff still works', () => {
  it('CRJ pending + unknown/cached OFF snapshot → Active provisional, no runtime', () => {
    markCrjVisibilityActivationPending(UID_A);
    const crj = isCrjVisibilityActivationHandoffArmed(UID_A);
    assert.equal(crj, true);
    for (const lastKnown of [null, false]) {
      const result = presentSnapshot({
        snapshot: { fromCache: true, visibility: false },
        lastKnown,
        persistedConfirmed: false,
        crjActivationProvisional: crj,
      });
      assert.equal(result.label, 'active_provisional');
      assert.equal(result.canStartRuntime, false);
    }
    const confirmed = presentSnapshot({
      snapshot: { fromCache: false, visibility: true },
      lastKnown: null,
      persistedConfirmed: true,
      validationPending: false,
      validatedEffective: true,
      crjActivationProvisional: crj,
    });
    assert.equal(confirmed.label, 'active_confirmed');
  });

  it('Home keeps CRJ provisional ahead of Inactive for cached OFF', () => {
    const home = readShared('screens/MainHomeScreen.tsx');
    assert.match(
      home,
      /crjActivationProvisionalRef\.current \|\|\s*hydration === 'last_known_provisional' \|\|\s*hydration === 'await_confirmation'/,
    );
  });
});

describe('9. Every login method reaches the same Home contract', () => {
  it('Google, Apple, LinkedIn, Facebook and email route to MainTabs', () => {
    const routes = [
      'authentication/social/application/authenticateWithGoogle.ts',
      'authentication/social/application/authenticateWithApple.ts',
      'authentication/social/application/authenticateWithFacebook.ts',
      'authentication/linkedinA3/linkedinA3Navigation.ts',
      'phoneOtp/postAuthNavigation.ts',
    ];
    for (const rel of routes) {
      assert.match(readShared(rel), /MainTabs/, rel);
    }
    assert.match(
      readShared('screens/LoginScreen.tsx'),
      /applyPostAuthNavigation\(navigation/,
    );
  });

  it('Home Visibility hydration is provider-agnostic', () => {
    const home = readShared('screens/MainHomeScreen.tsx');
    assert.doesNotMatch(
      home,
      /google|apple|facebook|linkedin|providerId|authentication\//i,
    );
    assert.doesNotMatch(home, /isNewUser/);
  });
});

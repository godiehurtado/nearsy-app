/**
 * Publication session gate — logout without endPresence (presence expires via
 * confirmedAt TTL), in-flight publishes, late callbacks, uid isolation and
 * post-login confirmation before runtime.
 *
 * Run:
 *   node --experimental-strip-types --test packages/shared/src/location/__tests__/publicationSession.test.ts
 */
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  acquireBackgroundPublicationTicket,
  acquirePublicationTicket,
  bindPublicationSession,
  closePublicationSession,
  confirmPublicationSession,
  drainInFlightPublications,
  getInFlightPublicationCount,
  getPublicationSessionPhase,
  isPublicationRuntimeOpen,
  isPublicationTicketCurrent,
  resetPublicationSessionForTests,
  sendGuardedPublication,
  subscribePublicationSession,
} from '../publicationSession.ts';
import { runContractualAndroidLogout } from '../contractualLogout.ts';
import {
  evaluateVisibilityHydration,
  isHomeSearchEnabled,
  isReadyForRuntimeConfirmation,
} from '../visibilityHydration.ts';

const UID_A = 'uid-account-a';
const UID_B = 'uid-account-b';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function readSource(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
}

/** Mirrors the BG task: ticket before any await, guard on every step. */
function backgroundCallback(authUid: () => string | null) {
  const ticket = acquireBackgroundPublicationTicket(authUid());
  return {
    ticket,
    guard: { isCurrent: () => isPublicationTicketCurrent(ticket, authUid()) },
  };
}

function openSession(uid: string) {
  bindPublicationSession(uid);
  const confirm = acquirePublicationTicket(uid, 'confirm');
  assert.ok(confirm);
  assert.equal(confirmPublicationSession(confirm), true);
}

beforeEach(() => {
  resetPublicationSessionForTests();
});

describe('session phases', () => {
  it('login starts pending: no runtime ticket until confirmation', () => {
    bindPublicationSession(UID_A);
    assert.equal(getPublicationSessionPhase(), 'pending');
    assert.equal(isPublicationRuntimeOpen(UID_A), false);
    assert.equal(acquirePublicationTicket(UID_A, 'runtime'), null);
    assert.ok(acquirePublicationTicket(UID_A, 'confirm'));
  });

  it('re-binding the same live session keeps it open', () => {
    openSession(UID_A);
    bindPublicationSession(UID_A);
    assert.equal(isPublicationRuntimeOpen(UID_A), true);
  });

  it('notifies subscribers on bind / confirm / close', () => {
    const seen: string[] = [];
    subscribePublicationSession(() => seen.push(getPublicationSessionPhase()));
    openSession(UID_A);
    closePublicationSession();
    assert.deepEqual(seen, ['pending', 'open', 'closed']);
  });
});

describe('in-flight publication', () => {
  it('logout waits for a publish already sent and invalidates its result', async () => {
    openSession(UID_A);
    let auth: string | null = UID_A;
    const ticket = acquirePublicationTicket(UID_A, 'runtime');
    const guard = { isCurrent: () => isPublicationTicketCurrent(ticket, auth) };
    const reply = deferred<{ ok: true }>();
    let sends = 0;

    const publish = sendGuardedPublication(guard, () => {
      sends += 1;
      return reply.promise;
    });
    await Promise.resolve();
    assert.equal(getInFlightPublicationCount(), 1);

    const steps: string[] = [];
    const logout = runContractualAndroidLogout({
      clearSocialPrefill: () => steps.push('prefill'),
      closePublicationGate: () => {
        steps.push('closeGate');
        closePublicationSession();
      },
      stopBackground: async () => {
        steps.push('stopRuntime');
      },
      drainInFlightPublications: async () => {
        steps.push('drain');
        await drainInFlightPublications(1_000);
        steps.push('drained');
      },
      signOut: async () => {
        steps.push('signOut');
        auth = null;
      },
    });

    await new Promise((r) => setTimeout(r, 10));
    assert.equal(steps.includes('signOut'), false, 'signOut waits for the in-flight publish');
    reply.resolve({ ok: true });
    await logout;
    assert.deepEqual(steps, [
      'prefill',
      'closeGate',
      'stopRuntime',
      'drain',
      'drained',
      'signOut',
    ]);
    assert.deepEqual(await publish, { status: 'session-closed' });
    assert.equal(sends, 1);
    assert.equal(getInFlightPublicationCount(), 0);
  });

  it('drain is bounded when the callable never answers', async () => {
    openSession(UID_A);
    void sendGuardedPublication(undefined, () => new Promise(() => {}));
    await Promise.resolve();
    assert.equal(await drainInFlightPublications(20), 'timeout');
  });

  it('a failure that lands after close is not reported as a callable error', async () => {
    openSession(UID_A);
    const ticket = acquirePublicationTicket(UID_A, 'runtime');
    const reply = deferred<never>();
    const publish = sendGuardedPublication(
      { isCurrent: () => isPublicationTicketCurrent(ticket, UID_A) },
      () => reply.promise,
    );
    closePublicationSession();
    reply.reject(new Error('unauthenticated'));
    assert.deepEqual(await publish, { status: 'session-closed' });
  });

  it('a current session reports the reply normally', async () => {
    openSession(UID_A);
    const ticket = acquirePublicationTicket(UID_A, 'runtime');
    const out = await sendGuardedPublication(
      { isCurrent: () => isPublicationTicketCurrent(ticket, UID_A) },
      async () => 'ok',
    );
    assert.deepEqual(out, { status: 'sent', value: 'ok' });
  });
});

describe('late callback from a previous session', () => {
  it('never sends once the gate closed', async () => {
    openSession(UID_A);
    const cb = backgroundCallback(() => UID_A);
    assert.ok(cb.ticket);
    closePublicationSession();
    let sends = 0;
    const out = await sendGuardedPublication(cb.guard, async () => {
      sends += 1;
    });
    assert.deepEqual(out, { status: 'session-closed' });
    assert.equal(sends, 0);
  });

  it('a callback that starts after logout gets no ticket', () => {
    openSession(UID_A);
    closePublicationSession();
    assert.equal(acquireBackgroundPublicationTicket(UID_A), null);
    assert.equal(acquirePublicationTicket(UID_A, 'runtime'), null);
  });

  it('a callback of the old session stays dead after the same user logs back in', () => {
    openSession(UID_A);
    const old = backgroundCallback(() => UID_A);
    closePublicationSession();
    openSession(UID_A);
    assert.equal(old.guard.isCurrent(), false);
  });
});

describe('uid change', () => {
  it('A → B: tickets of A are stale and B starts pending', () => {
    openSession(UID_A);
    const ticketA = acquirePublicationTicket(UID_A, 'runtime');
    closePublicationSession();
    bindPublicationSession(UID_B);
    assert.equal(isPublicationTicketCurrent(ticketA, UID_A), false);
    assert.equal(isPublicationTicketCurrent(ticketA, UID_B), false);
    assert.equal(isPublicationRuntimeOpen(UID_A), false);
    assert.equal(isPublicationRuntimeOpen(UID_B), false);
    assert.equal(acquirePublicationTicket(UID_A, 'confirm'), null);
  });

  it('switching uid without explicit logout still invalidates A', () => {
    openSession(UID_A);
    const ticketA = acquirePublicationTicket(UID_A, 'runtime');
    bindPublicationSession(UID_B);
    assert.equal(isPublicationTicketCurrent(ticketA, UID_A), false);
    assert.equal(acquirePublicationTicket(UID_B, 'runtime'), null);
  });

  it('a confirm ticket of A cannot open B', () => {
    bindPublicationSession(UID_A);
    const confirmA = acquirePublicationTicket(UID_A, 'confirm');
    bindPublicationSession(UID_B);
    assert.equal(confirmPublicationSession(confirmA), false);
    assert.equal(isPublicationRuntimeOpen(UID_B), false);
  });

  it('ticket for one uid is not current under another auth uid', () => {
    openSession(UID_A);
    const ticket = acquirePublicationTicket(UID_A, 'runtime');
    assert.equal(isPublicationTicketCurrent(ticket, UID_B), false);
  });
});

describe('headless background context (process death)', () => {
  it('unbound context defers to the persisted runtime authorization', () => {
    const cb = backgroundCallback(() => UID_A);
    assert.ok(cb.ticket?.unbound);
    assert.equal(cb.guard.isCurrent(), true);
    assert.equal(acquirePublicationTicket(UID_A, 'runtime'), null);
  });

  it('binding the context invalidates unbound tickets', () => {
    const cb = backgroundCallback(() => UID_A);
    bindPublicationSession(UID_A);
    assert.equal(cb.guard.isCurrent(), false);
    assert.equal(confirmPublicationSession(cb.ticket), false);
  });

  it('signed out → no ticket', () => {
    assert.equal(acquireBackgroundPublicationTicket(null), null);
  });
});

describe('activation after login (Active ON account)', () => {
  const base = {
    profileLoaded: true,
    persistedVisibility: true,
    permissionValidationPending: false,
    lastConfirmedVisibility: true,
  } as const;

  it('provisional → permissions → confirmed publish → runtime', () => {
    bindPublicationSession(UID_A);

    const pendingPermissions = evaluateVisibilityHydration({
      ...base,
      permissionValidationPending: true,
      permissionsValid: undefined,
      runtimeConfirmed: false,
    });
    assert.equal(pendingPermissions.displayActive, true);
    assert.equal(pendingPermissions.runtimeEligible, false);

    const validated = {
      ...base,
      permissionsValid: true,
      runtimeConfirmed: isPublicationRuntimeOpen(UID_A),
    };
    assert.equal(isReadyForRuntimeConfirmation(validated), true);
    const awaitingPublish = evaluateVisibilityHydration(validated);
    assert.equal(awaitingPublish.phase, 'validating');
    assert.equal(awaitingPublish.displayActive, true);
    assert.equal(awaitingPublish.runtimeEligible, false);
    assert.equal(
      isHomeSearchEnabled({
        displayActive: awaitingPublish.displayActive,
        permissionsValid: true,
        runtimeEligible: awaitingPublish.runtimeEligible,
      }),
      false,
    );
    assert.equal(acquirePublicationTicket(UID_A, 'runtime'), null);

    const confirm = acquirePublicationTicket(UID_A, 'confirm');
    assert.equal(confirmPublicationSession(confirm), true);

    const confirmed = evaluateVisibilityHydration({
      ...validated,
      runtimeConfirmed: isPublicationRuntimeOpen(UID_A),
    });
    assert.equal(confirmed.phase, 'active');
    assert.equal(confirmed.runtimeEligible, true);
    assert.equal(
      isHomeSearchEnabled({
        displayActive: confirmed.displayActive,
        permissionsValid: true,
        runtimeEligible: confirmed.runtimeEligible,
      }),
      true,
    );
    assert.ok(acquirePublicationTicket(UID_A, 'runtime'));
  });

  it('failed confirmation publish → Inactive without deactivate', () => {
    const r = evaluateVisibilityHydration({
      ...base,
      permissionsValid: true,
      runtimeConfirmed: false,
      runtimeConfirmationFailed: true,
    });
    assert.equal(r.phase, 'inactive');
    assert.equal(r.shouldDeactivate, false);
    assert.equal(r.toggleDisabled, false);
  });

  it('logout during confirmation never opens the next session', () => {
    bindPublicationSession(UID_A);
    const confirm = acquirePublicationTicket(UID_A, 'confirm');
    closePublicationSession();
    bindPublicationSession(UID_A);
    assert.equal(confirmPublicationSession(confirm), false);
    assert.equal(isPublicationRuntimeOpen(UID_A), false);
  });

  it('not ready to confirm while OFF or permissions pending/denied', () => {
    assert.equal(
      isReadyForRuntimeConfirmation({ ...base, persistedVisibility: false, permissionsValid: true }),
      false,
    );
    assert.equal(
      isReadyForRuntimeConfirmation({ ...base, permissionsValid: undefined, permissionValidationPending: true }),
      false,
    );
    assert.equal(
      isReadyForRuntimeConfirmation({ ...base, permissionsValid: false }),
      false,
    );
  });
});

describe('Nearby blocked outside a confirmed session', () => {
  it('pending session: Nearby has no runtime ticket', () => {
    bindPublicationSession(UID_A);
    const ticket = acquirePublicationTicket(UID_A, 'runtime');
    assert.equal(ticket, null);
    assert.equal(isPublicationTicketCurrent(ticket, UID_A), false);
  });

  it('load checks the session before publish, after publish and after discover', () => {
    const load = readSource('../../visibility/nearbyDiscoveryLoad.ts');
    const checks = load.match(/if \(!sessionIsCurrent\(\)\) \{/g) ?? [];
    assert.equal(checks.length, 3);
    assert.match(load, /isCurrent: sessionIsCurrent/);
    assert.match(load, /kind: 'session-closed'/);
  });
});

describe('wiring (source contracts)', () => {
  it('logout closes the gate and drains, never deactivates / endPresence', () => {
    const more = readSource('../../screens/MoreScreen.tsx');
    assert.match(more, /closePublicationGate: \(\) => closePublicationSession\(\)/);
    assert.match(more, /drainInFlightPublications: \(\) => drainInFlightPublications\(\)/);
    const logout = readSource('../contractualLogout.ts');
    assert.doesNotMatch(logout, /deactivateVisibility\(|endPresence/);
    assert.doesNotMatch(more, /endPresence/);
  });

  it('every production publisher passes a session guard', () => {
    const task = readSource('../../background/locationTask.android.ts');
    assert.match(task, /acquireBackgroundPublicationTicket\(/);
    assert.match(task, /publishLocationFlow\(\s*client,[\s\S]*?sessionGuard,\s*\)/);
    const fg = readSource('../../components/ContractualLocationPublisher.tsx');
    assert.match(fg, /acquirePublicationTicket\(uid, 'runtime'\)/);
    assert.match(fg, /publishLocationFlow\(client, undefined, \{/);
    const nearby = readSource('../../screens/NearbySearchScreen.tsx');
    assert.match(nearby, /sessionIsCurrent: \(\) =>/);
    const home = readSource('../../screens/MainHomeScreen.tsx');
    assert.match(home, /acquirePublicationTicket\(uid, 'confirm'\)/);
    assert.match(home, /confirmPublicationSession\(ticket\)/);
  });

  it('FGS start requires a confirmed session in a bound context', () => {
    const start = readSource('../startGatedBackgroundLocation.ts');
    assert.match(start, /isPublicationRuntimeOpen\(opts\.uid\)/);
    const app = readSource('../../App.tsx');
    assert.match(app, /bindPublicationSession\(user\.uid\)/);
    assert.match(app, /closePublicationSession\(\)/);
  });
});

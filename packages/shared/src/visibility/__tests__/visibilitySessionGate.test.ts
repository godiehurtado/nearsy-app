/**
 * Logout/login presence barrier: no publishLocation/activateVisibility may
 * renew confirmedAt after logout starts, and no previous-session attempt may
 * publish for the next session.
 */
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  VISIBILITY_LOGOUT_STEP_TIMEOUT_MS,
  captureVisibilitySessionTicket,
  closeVisibilitySessionForLogout,
  closeVisibilitySessionGate,
  countInFlightVisibilitySessionRequests,
  guardPresenceRenewal,
  isPresenceRenewingCallable,
  isVisibilitySessionGateClosed,
  isVisibilitySessionTicketCurrent,
  openVisibilitySessionGate,
  resetVisibilitySessionGateForTests,
} from '../visibilitySessionGate';
import { resolveVisibilityPresentation } from '../visibilityPresentation';

const sharedSrc = join(__dirname, '../..');
const UID_A = 'test-uid-session-gate-a';
const UID_B = 'test-uid-session-gate-b';

function readShared(rel: string): string {
  return readFileSync(join(sharedSrc, rel), 'utf8');
}

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Server stand-in: each processed renewal records the session UID. */
function createServer() {
  const renewals: string[] = [];
  return {
    renewals,
    send(uid: string, gate?: Promise<void>) {
      return async () => {
        if (gate) await gate;
        renewals.push(uid);
        return { confirmedAt: renewals.length };
      };
    },
  };
}

/**
 * Mirrors publishLocationFlow: ticket at start → (slow) location sample →
 * guarded send.
 */
async function publishFlow(input: {
  sample: Promise<void>;
  send: () => Promise<unknown>;
}): Promise<'sent' | 'session_closed'> {
  const ticket = captureVisibilitySessionTicket();
  if (!ticket) return 'session_closed';
  await input.sample;
  const guarded = await guardPresenceRenewal(ticket, input.send);
  return guarded.ok ? 'sent' : 'session_closed';
}

beforeEach(() => {
  resetVisibilitySessionGateForTests();
});

describe('session gate basics', () => {
  it('process start allows renewals (background relaunch keeps working)', () => {
    assert.equal(isVisibilitySessionGateClosed(), false);
    assert.ok(captureVisibilitySessionTicket());
  });

  it('only publishLocation and activateVisibility are gated', () => {
    assert.equal(isPresenceRenewingCallable('publishLocation'), true);
    assert.equal(isPresenceRenewingCallable('activateVisibility'), true);
    assert.equal(isPresenceRenewingCallable('discoverNearby'), false);
    assert.equal(isPresenceRenewingCallable('deactivateVisibility'), false);
  });

  it('closing blocks new tickets; reopening for a UID starts a new generation', () => {
    openVisibilitySessionGate(UID_A);
    const ticketA = captureVisibilitySessionTicket();
    closeVisibilitySessionGate();
    assert.equal(captureVisibilitySessionTicket(), null);
    assert.equal(isVisibilitySessionTicketCurrent(ticketA), false);
    openVisibilitySessionGate(UID_A);
    assert.equal(isVisibilitySessionTicketCurrent(ticketA), false);
    assert.equal(
      isVisibilitySessionTicketCurrent(captureVisibilitySessionTicket(), UID_A),
      true,
    );
  });
});

describe('1. publish in flight → logout cannot renew presence after closure', () => {
  it('an already-sent publish is awaited before signOut', async () => {
    openVisibilitySessionGate(UID_A);
    const server = createServer();
    const network = deferred();
    const events: string[] = [];

    const inflight = publishFlow({
      sample: Promise.resolve(),
      send: async () => {
        await server.send(UID_A, network.promise)();
        events.push('server_renewed');
      },
    });
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(countInFlightVisibilitySessionRequests(), 1);

    const logout = (async () => {
      await closeVisibilitySessionForLogout({
        stopRuntime: async () => {},
        timeoutMs: 1_000,
      });
      events.push('signOut');
    })();
    await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(events, [], 'signOut waits for the sent request');

    network.resolve();
    await Promise.all([inflight, logout]);
    assert.deepEqual(events, ['server_renewed', 'signOut']);
    assert.equal(countInFlightVisibilitySessionRequests(), 0);
  });

  it('a publish still sampling location when logout starts never sends', async () => {
    openVisibilitySessionGate(UID_A);
    const server = createServer();
    const sample = deferred();
    const flow = publishFlow({ sample: sample.promise, send: server.send(UID_A) });

    await closeVisibilitySessionForLogout({ stopRuntime: async () => {} });
    sample.resolve();
    assert.equal(await flow, 'session_closed');
    assert.deepEqual(server.renewals, []);
  });

  it('a publish started after logout began is rejected immediately', async () => {
    openVisibilitySessionGate(UID_A);
    const server = createServer();
    closeVisibilitySessionGate();
    assert.equal(
      await publishFlow({ sample: Promise.resolve(), send: server.send(UID_A) }),
      'session_closed',
    );
    assert.deepEqual(server.renewals, []);
  });
});

describe('2. late tick from the previous session is ignored', () => {
  it('background/foreground tick captured before logout cannot send after relogin', async () => {
    openVisibilitySessionGate(UID_A);
    const server = createServer();
    const sample = deferred();
    const lateTick = publishFlow({ sample: sample.promise, send: server.send(UID_A) });

    await closeVisibilitySessionForLogout({ stopRuntime: async () => {} });
    openVisibilitySessionGate(UID_A); // same account logs back in
    sample.resolve();

    assert.equal(await lateTick, 'session_closed');
    assert.deepEqual(server.renewals, []);
    assert.equal(
      await publishFlow({ sample: Promise.resolve(), send: server.send(UID_A) }),
      'sent',
    );
    assert.deepEqual(server.renewals, [UID_A]);
  });
});

describe('3. user A logout → late publication does not affect user B', () => {
  it('A ticket is invalid for B; invoke-level UID check rejects cross-session sends', async () => {
    openVisibilitySessionGate(UID_A);
    const server = createServer();
    const sample = deferred();
    const ticketA = captureVisibilitySessionTicket();
    const lateA = publishFlow({ sample: sample.promise, send: server.send(UID_B) });

    await closeVisibilitySessionForLogout({ stopRuntime: async () => {} });
    openVisibilitySessionGate(UID_B);
    sample.resolve();

    assert.equal(await lateA, 'session_closed');
    assert.deepEqual(server.renewals, []);
    assert.equal(isVisibilitySessionTicketCurrent(ticketA, UID_B), false);

    const ticketB = captureVisibilitySessionTicket();
    assert.equal(isVisibilitySessionTicketCurrent(ticketB, UID_B), true);
    assert.equal(isVisibilitySessionTicketCurrent(ticketB, UID_A), false);
  });

  it('switching UID without an explicit close also invalidates old tickets', () => {
    openVisibilitySessionGate(UID_A);
    const ticketA = captureVisibilitySessionTicket();
    openVisibilitySessionGate(UID_B);
    assert.equal(isVisibilitySessionTicketCurrent(ticketA), false);
  });
});

describe('4. login ON → Nearby/runtime only after a confirmed renewal', () => {
  it('Home renews location before confirming Active on the first validation', () => {
    const home = readShared('screens/MainHomeScreen.tsx');
    const branchStart = home.indexOf('if (remote && foregroundGranted) {');
    assert.ok(branchStart > 0);
    const branch = home.slice(branchStart, branchStart + 1200);
    const guardIdx = branch.indexOf('!hydrationValidationDoneRef.current');
    const publishIdx = branch.indexOf('await publishLocationFlow(client)');
    const failIdx = branch.indexOf('finishValidation(false)');
    const confirmIdx = branch.indexOf('finishValidation(true)');
    const runtimeIdx = branch.indexOf('syncBackgroundLocationRuntime');
    assert.ok(guardIdx > 0 && publishIdx > guardIdx);
    assert.ok(failIdx > publishIdx && confirmIdx > failIdx);
    assert.ok(runtimeIdx > confirmIdx);
    assert.match(branch, /noteContractualPublishSuccess\(Date\.now\(\)\)/);
  });

  it('an unrenewed session never becomes runtime-eligible on error', () => {
    const home = readShared('screens/MainHomeScreen.tsx');
    assert.match(
      home,
      /finishValidation\(\s*hydrationValidationDoneRef\.current && !!profileRef\.current\.visibility,?\s*\)/,
    );
    assert.doesNotMatch(home, /finishValidation\(!!profileRef\.current\.visibility\)/);
  });

  it('while renewal is pending: Active provisional, runtime and search blocked', () => {
    const pending = resolveVisibilityPresentation({
      profileLoaded: true,
      persistedVisibility: true,
      validationPending: true,
      validatedEffective: null,
      lastKnownActiveProvisional: false,
      persistedConfirmed: true,
    });
    assert.equal(pending.visualActive, true);
    assert.equal(pending.canStartRuntime, false);

    const renewalFailed = resolveVisibilityPresentation({
      profileLoaded: true,
      persistedVisibility: true,
      validationPending: false,
      validatedEffective: false,
      persistedConfirmed: true,
    });
    assert.equal(renewalFailed.visualActive, false);
    assert.equal(renewalFailed.canStartRuntime, false);

    const renewed = resolveVisibilityPresentation({
      profileLoaded: true,
      persistedVisibility: true,
      validationPending: false,
      validatedEffective: true,
      persistedConfirmed: true,
    });
    assert.equal(renewed.canStartRuntime, true);
  });
});

describe('5. runtime stop failure: gate stays closed, signOut never blocks', () => {
  it('stopRuntime rejects → reported failed, new publishes still blocked', async () => {
    openVisibilitySessionGate(UID_A);
    const server = createServer();
    const result = await closeVisibilitySessionForLogout({
      stopRuntime: async () => {
        throw new Error('stopLocationUpdatesAsync failed');
      },
      timeoutMs: 50,
    });
    assert.deepEqual(result, { runtimeStop: 'failed', inFlight: 'settled' });
    assert.equal(isVisibilitySessionGateClosed(), true);
    assert.equal(
      await publishFlow({ sample: Promise.resolve(), send: server.send(UID_A) }),
      'session_closed',
    );
    assert.deepEqual(server.renewals, []);
  });

  it('stopRuntime hangs and a sent request hangs → both bounded by timeoutMs', async () => {
    openVisibilitySessionGate(UID_A);
    const never = new Promise<never>(() => {});
    void publishFlow({ sample: Promise.resolve(), send: () => never });
    await new Promise((r) => setTimeout(r, 0));

    const started = Date.now();
    const result = await closeVisibilitySessionForLogout({
      stopRuntime: () => never,
      timeoutMs: 40,
    });
    const elapsed = Date.now() - started;
    assert.deepEqual(result, { runtimeStop: 'timeout', inFlight: 'timeout' });
    assert.ok(elapsed < 1_000, `logout barrier bounded (${elapsed} ms)`);
    assert.equal(isVisibilitySessionGateClosed(), true);
  });

  it('default bound is 4 s per step (≤ 8 s before signOut)', () => {
    assert.equal(VISIBILITY_LOGOUT_STEP_TIMEOUT_MS, 4_000);
  });
});

describe('wiring', () => {
  it('orchestration captures the ticket before sampling and guards the send', () => {
    const orchestration = readShared('visibility/orchestration.ts');
    for (const fn of ['activateVisibilityFlow', 'publishLocationFlow']) {
      const body = orchestration.slice(
        orchestration.indexOf(`export async function ${fn}`),
      );
      const ticketIdx = body.indexOf('captureVisibilitySessionTicket()');
      const sampleIdx = body.search(/obtainValidLocationSample\(\)|if \(coords\)/);
      const guardIdx = body.indexOf('guardPresenceRenewal(ticket');
      assert.ok(ticketIdx > 0 && sampleIdx > ticketIdx && guardIdx > sampleIdx, fn);
    }
    assert.doesNotMatch(orchestration, /await client\.publishLocation\(/);
    assert.doesNotMatch(orchestration, /await client\.activateVisibility\(/);
  });

  it('iOS callable invoke re-checks the session after getIdToken', () => {
    const foundation = readShared('visibility/iosVisibilityFoundation.ios.ts');
    const tokenIdx = foundation.indexOf('await user.getIdToken()');
    const recheckIdx = foundation.indexOf(
      'isVisibilitySessionTicketCurrent(ticket, user.uid)',
    );
    const sendIdx = foundation.indexOf('invokeVisibilityCallableHttp({');
    assert.ok(tokenIdx > 0 && recheckIdx > tokenIdx && sendIdx > recheckIdx);
    assert.match(foundation, /isPresenceRenewingCallable\(name\)/);
  });

  it('AppNavigator closes on signed-out and opens only for the authenticated UID', () => {
    const navigator = readShared('navigation/AppNavigator.tsx');
    assert.match(navigator, /if \(!user\) \{\s*closeVisibilitySessionGate\(\);/);
    assert.match(
      navigator,
      /openVisibilitySessionGate\(refreshedUser\.uid\);\s*setUid\(refreshedUser\.uid\);/,
    );
  });

  it('MoreScreen logout closes the gate and stops runtime before signOut', () => {
    const more = readShared('screens/MoreScreen.tsx');
    const logout = more.slice(
      more.indexOf('const handleLogout'),
      more.indexOf('const openCalendar'),
    );
    assert.match(
      logout,
      /await closeVisibilitySessionForLogout\(\{\s*stopRuntime: stopBackgroundLocationRuntime,\s*\}\);[\s\S]*await firebaseAuth\.signOut\(\);/,
    );
  });

  it('background task publishes only through the gated publishLocationFlow', () => {
    const task = readShared('background/locationTask.ios.ts');
    assert.match(task, /publishLocationFlow\(client,/);
    assert.doesNotMatch(task, /client\.publishLocation\(/);
  });
});

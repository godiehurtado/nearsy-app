/**
 * Onboarding-recovery pushes (Functions PR #49): the Expo token is registered
 * on sign-in with the permission already granted, CRJ complete or not, and
 * right after a grant in the CRJ Notifications step. Denial writes nothing;
 * logout and account switch keep releasing this device's token first, so it is
 * never written under another account.
 *
 * Run:
 *   node --experimental-strip-types --test packages/shared/src/__tests__/androidOnboardingPushToken.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  registerAfterNotificationsStep,
  signInPushTokenOptions,
  type RegisterPushTokenOptions,
} from '../notifications/onboardingPushToken.ts';
import {
  createPushTokenSessionStore,
  registerDevicePushToken,
  runWithOutgoingPushRelease,
  unregisterDevicePushToken,
} from '../services/pushTokenLifecycle.ts';

const here = dirname(fileURLToPath(import.meta.url));
const readShared = (rel: string) => readFileSync(join(here, '..', rel), 'utf8');

type Write = { op: 'set' | 'delete'; uid: string; token: string };

/** The real session lifecycle with an OS permission and a switchable Auth UID. */
function device(initialUid: string | null, granted: boolean) {
  let uid = initialUid;
  let permission = granted;
  const writes: Write[] = [];
  const store = createPushTokenSessionStore();
  const token = 'ExponentPushToken[device]';
  const getUid = () => uid;
  const persistToken = async (owner: string, value: string) => {
    if (owner !== uid) throw new Error('push-token-uid-mismatch');
    writes.push({ op: 'set', uid: owner, token: value });
  };
  const deleteToken = async (owner: string, value: string) => {
    if (owner !== uid) throw new Error('push-token-uid-mismatch');
    writes.push({ op: 'delete', uid: owner, token: value });
  };
  let mintGate: Promise<void> | null = null;
  // Mirrors registerPushToken: it reads the permission and never prompts.
  const registerPushToken = async (_options: RegisterPushTokenOptions = {}) => {
    if (!permission) return { ok: false as const, reason: 'permission-not-granted' as const };
    return registerDevicePushToken({
      store,
      getUid,
      permissionGranted: permission,
      mintToken: async () => {
        if (mintGate) await mintGate;
        return token;
      },
      persistToken,
      deleteToken,
    });
  };
  const release = () =>
    unregisterDevicePushToken({
      store,
      getUid,
      resolveToken: async () => (permission ? token : null),
      deleteToken,
    });
  return {
    writes,
    token,
    registerPushToken,
    release,
    getUid,
    setUid: (next: string | null) => {
      uid = next;
    },
    grant: () => {
      permission = true;
    },
    holdMint: () => {
      let open: () => void = () => {};
      mintGate = new Promise<void>((resolve) => {
        open = resolve;
      });
      return () => {
        mintGate = null;
        open();
      };
    },
  };
}

describe('onboarding push token: decisions', () => {
  it('sign-in always registers; notices are re-evaluated only for a completed profile', () => {
    assert.deepEqual(signInPushTokenOptions(false), { reevaluateNotices: false });
    assert.deepEqual(signInPushTokenOptions(true), { reevaluateNotices: true });
  });

  it('the Notifications step registers only after a grant, without re-evaluating notices', async () => {
    const calls: Array<RegisterPushTokenOptions | undefined> = [];
    const register = async (options?: RegisterPushTokenOptions) => {
      calls.push(options);
    };
    await registerAfterNotificationsStep(false, register);
    assert.equal(calls.length, 0, 'a denial writes nothing');
    await registerAfterNotificationsStep(true, register);
    assert.deepEqual(calls, [{ reevaluateNotices: false }]);
  });

  it('a failing registration never throws into the CRJ step', async () => {
    await registerAfterNotificationsStep(true, async () => {
      throw new Error('network');
    });
  });
});

describe('onboarding push token: real session lifecycle', () => {
  it('incomplete CRJ + permission already granted: the token is written under the signed-in UID', async () => {
    const d = device('uid-a', true);
    const result = await d.registerPushToken(signInPushTokenOptions(false));
    assert.equal(result.ok, true);
    assert.deepEqual(d.writes, [{ op: 'set', uid: 'uid-a', token: d.token }]);
  });

  it('permission denied or undecided: nothing is written, at sign-in or at the step', async () => {
    const d = device('uid-a', false);
    await d.registerPushToken(signInPushTokenOptions(false));
    await registerAfterNotificationsStep(false, d.registerPushToken);
    assert.deepEqual(d.writes, []);
  });

  it('grant at the Notifications step: written at once', async () => {
    const d = device('uid-a', false);
    await d.registerPushToken(signInPushTokenOptions(false));
    d.grant();
    await registerAfterNotificationsStep(true, d.registerPushToken);
    assert.deepEqual(d.writes, [{ op: 'set', uid: 'uid-a', token: d.token }]);
  });

  it('logout releases the token registered during the CRJ', async () => {
    const d = device('uid-a', true);
    await d.registerPushToken(signInPushTokenOptions(false));
    await d.release();
    d.setUid(null);
    assert.deepEqual(d.writes, [
      { op: 'set', uid: 'uid-a', token: d.token },
      { op: 'delete', uid: 'uid-a', token: d.token },
    ]);
  });

  it('account switch: A is released before B signs in, and B gets its own write', async () => {
    const d = device('uid-a', true);
    await d.registerPushToken(signInPushTokenOptions(false));
    await runWithOutgoingPushRelease({
      getUid: d.getUid,
      release: d.release,
      restore: d.registerPushToken,
      operation: async () => {
        d.setUid('uid-b');
      },
    });
    await d.registerPushToken(signInPushTokenOptions(false));
    assert.deepEqual(d.writes, [
      { op: 'set', uid: 'uid-a', token: d.token },
      { op: 'delete', uid: 'uid-a', token: d.token },
      { op: 'set', uid: 'uid-b', token: d.token },
    ]);
  });

  it('logout while the step registration is still minting: the stale registration is dropped', async () => {
    const d = device('uid-a', true);
    const open = d.holdMint();
    const pending = registerAfterNotificationsStep(true, d.registerPushToken);
    const releasing = d.release();
    open();
    await releasing;
    d.setUid(null);
    await pending;
    assert.ok(d.writes.every((write) => write.op !== 'set'), 'no token left behind for A');
  });

  it('the account changes while minting: nothing is written under the new account', async () => {
    const d = device('uid-a', true);
    const open = d.holdMint();
    const pending = d.registerPushToken(signInPushTokenOptions(false));
    d.setUid('uid-b');
    open();
    const result = await pending;
    assert.deepEqual(result, { ok: false, reason: 'user-changed' });
    assert.deepEqual(d.writes, []);
  });
});

describe('onboarding push token: wiring', () => {
  const app = readShared('App.tsx');
  const crj = readShared('screens/ProfileCompletionScreen.tsx');
  const tokens = readShared('services/pushTokens.android.ts');

  it('sign-in registers whatever the CRJ state, and never prompts', () => {
    assert.match(app, /await registerPushToken\(signInPushTokenOptions\(profileSetupCompleted\)\)/);
    assert.doesNotMatch(
      app,
      /if \(profileSetupCompleted\) \{\s*try \{\s*await registerPushToken/,
      'no longer gated on profileSetupCompleted',
    );
    assert.doesNotMatch(app, /requestPermissionsAsync/);
  });

  it('the Notifications step registers after an existing or new grant, before moving on', () => {
    const start = crj.indexOf('async function requestNotifications()');
    const end = crj.indexOf('async function finishOnboarding()');
    assert.ok(start > 0 && end > start);
    const step = crj.slice(start, end);
    assert.match(
      step,
      /if \(already\) \{\s*void registerAfterNotificationsStep\(true, registerPushToken\);\s*await commitStepIndex/,
    );
    assert.match(step, /void registerAfterNotificationsStep\(granted, registerPushToken\);\s*if \(!granted\)/);
    assert.equal((step.match(/requestPermissionsAsync/g) ?? []).length, 1, 'one prompt only');
  });

  it('registerPushToken reads the permission, never prompts, and re-evaluates only when asked', () => {
    assert.match(tokens, /const granted = await permissionGranted\(\);\s*if \(!granted\) return \{ ok: false, reason: 'permission-not-granted' \};/);
    assert.doesNotMatch(tokens, /requestPermissionsAsync/);
    assert.match(tokens, /if \(result\.ok && options\.reevaluateNotices !== false\) \{/);
  });
});

/**
 * AppNavigator profile-gate integration tests.
 *
 * Exercises the authenticated composition AppNavigator uses
 * (`createAuthenticatedProfileGate` + destination mapping + i18n keys),
 * without mounting the full React Navigation tree.
 *
 * Run:
 *   node --experimental-strip-types --test packages/shared/src/navigation/__tests__/AppNavigator.profileGate.integration.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { onboardingTranslations } from '../../i18n/resources/onboarding.ts';
import {
  createAuthenticatedProfileGate,
  isAuthenticatedProfileLoading,
  PROFILE_GATE_I18N_KEYS,
  resolveAuthenticatedProfileFlow,
  type AuthenticatedProfileFlow,
} from '../profileGate.ts';

function waitMicrotask(): Promise<void> {
  return new Promise((r) => queueMicrotask(r));
}

function leaf(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (!acc || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

describe('AppNavigator authenticated profile gate (integration)', () => {
  it('authenticated + absent profile → ProfileCompletion', async () => {
    const flows: AuthenticatedProfileFlow[] = [];
    const gate = createAuthenticatedProfileGate({
      listen: (_uid, onData) => {
        onData(null);
        return () => undefined;
      },
      get: async () => null,
    });
    gate.start('uid-any-provider', (f) => flows.push(f));
    await waitMicrotask();
    assert.equal(flows.at(-1)?.kind, 'ProfileCompletion');
    gate.stop();
  });

  it('authenticated + incomplete profile → ProfileCompletion', async () => {
    const flows: AuthenticatedProfileFlow[] = [];
    const gate = createAuthenticatedProfileGate({
      listen: (_uid, onData) => {
        onData({ profileSetupCompleted: false, email: 'a@b.c' });
        return () => undefined;
      },
      get: async () => null,
    });
    gate.start('uid-any-provider', (f) => flows.push(f));
    await waitMicrotask();
    assert.equal(flows.at(-1)?.kind, 'ProfileCompletion');
    gate.stop();
  });

  it('authenticated + complete profile → MainTabs', async () => {
    const flows: AuthenticatedProfileFlow[] = [];
    const gate = createAuthenticatedProfileGate({
      listen: (_uid, onData) => {
        onData({ profileSetupCompleted: true });
        return () => undefined;
      },
      get: async () => null,
    });
    gate.start('uid-any-provider', (f) => flows.push(f));
    await waitMicrotask();
    assert.equal(flows.at(-1)?.kind, 'MainTabs');
    gate.stop();
  });

  it('listener + fallback fail → profile_read_error, never MainTabs', async () => {
    const flows: AuthenticatedProfileFlow[] = [];
    const denied = Object.assign(new Error('denied'), {
      code: 'permission-denied',
    });
    const gate = createAuthenticatedProfileGate({
      listen: (_uid, _onData, onErr) => {
        onErr(denied);
        return () => undefined;
      },
      get: async () => {
        throw denied;
      },
    });
    gate.start('uid-any-provider', (f) => flows.push(f));
    await waitMicrotask();
    await waitMicrotask();
    assert.equal(flows.at(-1)?.kind, 'profile_read_error');
    assert.equal(
      flows.filter((f) => f.kind === 'MainTabs').length,
      0,
      'must never route to MainTabs on read error',
    );
    gate.stop();
  });

  it('retry shows loading then resolves destination', async () => {
    const flows: AuthenticatedProfileFlow[] = [];
    let mode: 'fail' | 'ok' = 'fail';
    const denied = Object.assign(new Error('denied'), {
      code: 'firestore/permission-denied',
    });
    const gate = createAuthenticatedProfileGate({
      listen: (_uid, onData, onErr) => {
        if (mode === 'fail') onErr(denied);
        else onData({ profileSetupCompleted: true });
        return () => undefined;
      },
      get: async () => {
        if (mode === 'fail') throw denied;
        return { profileSetupCompleted: true };
      },
    });
    gate.start('uid-any-provider', (f) => flows.push(f));
    await waitMicrotask();
    await waitMicrotask();
    assert.equal(flows.at(-1)?.kind, 'profile_read_error');

    mode = 'ok';
    gate.retry('uid-any-provider', (f) => flows.push(f));
    assert.equal(
      flows.some((f) => f.kind === 'loading'),
      true,
      'retry must emit loading',
    );
    await waitMicrotask();
    assert.equal(flows.at(-1)?.kind, 'MainTabs');
    gate.stop();
  });

  it('error and retry visible strings come from i18n EN and ES', () => {
    for (const key of Object.values(PROFILE_GATE_I18N_KEYS)) {
      const path = key.replace(/^onboarding\./, '');
      const en = leaf(
        onboardingTranslations.en as unknown as Record<string, unknown>,
        path,
      );
      const es = leaf(
        onboardingTranslations.es as unknown as Record<string, unknown>,
        path,
      );
      assert.equal(typeof en, 'string');
      assert.equal(typeof es, 'string');
      assert.ok(String(en).length > 0);
      assert.ok(String(es).length > 0);
    }
    assert.notEqual(
      onboardingTranslations.en.profileGate.retry,
      onboardingTranslations.es.profileGate.retry,
    );
  });

  it('unmount/stop clears listener; late response does not update flow', async () => {
    const flows: AuthenticatedProfileFlow[] = [];
    let onData: ((d: unknown) => void) | null = null;
    let unsubCount = 0;
    const gate = createAuthenticatedProfileGate({
      listen: (_uid, dataCb) => {
        onData = dataCb;
        return () => {
          unsubCount += 1;
        };
      },
      get: async () => null,
    });
    gate.start('uid-any-provider', (f) => flows.push(f));
    gate.stop();
    assert.equal(unsubCount, 1);
    onData?.({ profileSetupCompleted: true });
    await waitMicrotask();
    assert.equal(
      flows.filter((f) => f.kind === 'MainTabs').length,
      0,
      'late complete after stop must not apply',
    );
  });

  it('prior generation does not compete with retry', async () => {
    const flows: AuthenticatedProfileFlow[] = [];
    const listenCallbacks: Array<(d: unknown) => void> = [];
    const gate = createAuthenticatedProfileGate({
      listen: (_uid, onData) => {
        listenCallbacks.push(onData);
        return () => undefined;
      },
      get: async () => null,
    });
    gate.start('uid-any-provider', (f) => flows.push(f));
    assert.equal(listenCallbacks.length, 1);

    gate.retry('uid-any-provider', (f) => flows.push(f));
    assert.equal(listenCallbacks.length, 2);

    // Stale first listener reports complete; active retry reports incomplete.
    listenCallbacks[0]?.({ profileSetupCompleted: true });
    listenCallbacks[1]?.({ profileSetupCompleted: false });
    await waitMicrotask();

    assert.equal(flows.at(-1)?.kind, 'ProfileCompletion');
    assert.equal(
      flows.filter((f) => f.kind === 'MainTabs').length,
      0,
      'stale generation must not win over retry',
    );
    gate.stop();
  });

  it('gate applies to any authenticated session without provider branching', () => {
    for (const uid of ['google-uid', 'password-uid', 'li_uid']) {
      assert.equal(
        resolveAuthenticatedProfileFlow({
          phase: 'profile_missing_or_incomplete',
        }).kind,
        'ProfileCompletion',
      );
      assert.equal(
        resolveAuthenticatedProfileFlow({ phase: 'profile_complete' }).kind,
        'MainTabs',
      );
      const flows: AuthenticatedProfileFlow[] = [];
      const gate = createAuthenticatedProfileGate({
        listen: (_u, onData) => {
          onData({ profileSetupCompleted: true });
          return () => undefined;
        },
        get: async () => null,
      });
      gate.start(uid, (f) => flows.push(f));
      assert.equal(flows.at(-1)?.kind, 'MainTabs');
      gate.stop();
    }
  });
});

describe('AppNavigator guest loader gate', () => {
  it('guest (!uid) is never blocked by profileFlow loading', () => {
    assert.equal(isAuthenticatedProfileLoading(null, 'loading'), false);
    assert.equal(isAuthenticatedProfileLoading(undefined, 'loading'), false);
    assert.equal(isAuthenticatedProfileLoading('', 'loading'), false);
  });

  it('authenticated uid + loading still blocks until profile gate resolves', () => {
    assert.equal(isAuthenticatedProfileLoading('uid-1', 'loading'), true);
    assert.equal(
      isAuthenticatedProfileLoading('uid-1', 'ProfileCompletion'),
      false,
    );
    assert.equal(isAuthenticatedProfileLoading('uid-1', 'MainTabs'), false);
  });
});

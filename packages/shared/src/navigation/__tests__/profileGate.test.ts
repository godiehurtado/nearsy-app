/**
 * Profile gate fail-closed behavior (FIX-A).
 *
 * Run:
 *   node --experimental-strip-types --test packages/shared/src/navigation/__tests__/profileGate.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  classifyProfileReadError,
  createProfileGateController,
  statusFromProfileDocument,
  type ProfileGateStatus,
} from '../profileGate.ts';

function waitMicrotask(): Promise<void> {
  return new Promise((r) => queueMicrotask(r));
}

describe('statusFromProfileDocument', () => {
  it('null / missing document → profile_missing_or_incomplete', () => {
    assert.equal(statusFromProfileDocument(null), 'profile_missing_or_incomplete');
    assert.equal(
      statusFromProfileDocument(undefined),
      'profile_missing_or_incomplete',
    );
  });

  it('incomplete document → profile_missing_or_incomplete', () => {
    assert.equal(
      statusFromProfileDocument({ profileSetupCompleted: false }),
      'profile_missing_or_incomplete',
    );
    assert.equal(
      statusFromProfileDocument({ email: 'a@b.c' }),
      'profile_missing_or_incomplete',
    );
  });

  it('complete document → profile_complete', () => {
    assert.equal(
      statusFromProfileDocument({ profileSetupCompleted: true }),
      'profile_complete',
    );
  });
});

describe('classifyProfileReadError', () => {
  it('maps permission-denied codes', () => {
    assert.equal(
      classifyProfileReadError(
        Object.assign(new Error('x'), { code: 'permission-denied' }),
      ),
      'permission_denied',
    );
    assert.equal(
      classifyProfileReadError(
        Object.assign(new Error('x'), {
          code: 'firestore/permission-denied',
        }),
      ),
      'permission_denied',
    );
  });

  it('maps unknown errors as transient', () => {
    assert.equal(classifyProfileReadError(new Error('network')), 'transient');
    assert.equal(classifyProfileReadError(null), 'transient');
  });
});

describe('createProfileGateController', () => {
  it('listener success with absent doc → missing_or_incomplete', async () => {
    const statuses: ProfileGateStatus[] = [];
    const gate = createProfileGateController({
      listen: (_uid, onData) => {
        onData(null);
        return () => undefined;
      },
      get: async () => {
        throw new Error('should not get');
      },
    });
    gate.start('u1', (s) => statuses.push(s));
    assert.equal(statuses[0]?.phase, 'loading');
    assert.equal(statuses.at(-1)?.phase, 'profile_missing_or_incomplete');
    gate.stop();
  });

  it('listener success with incomplete doc → missing_or_incomplete', () => {
    const statuses: ProfileGateStatus[] = [];
    const gate = createProfileGateController({
      listen: (_uid, onData) => {
        onData({ profileSetupCompleted: false });
        return () => undefined;
      },
      get: async () => null,
    });
    gate.start('u1', (s) => statuses.push(s));
    assert.equal(statuses.at(-1)?.phase, 'profile_missing_or_incomplete');
    gate.stop();
  });

  it('listener success with complete doc → profile_complete (MainTabs path)', () => {
    const statuses: ProfileGateStatus[] = [];
    const gate = createProfileGateController({
      listen: (_uid, onData) => {
        onData({ profileSetupCompleted: true });
        return () => undefined;
      },
      get: async () => null,
    });
    gate.start('u1', (s) => statuses.push(s));
    assert.equal(statuses.at(-1)?.phase, 'profile_complete');
    gate.stop();
  });

  it('listener fails and fallback get returns complete → profile_complete', async () => {
    const statuses: ProfileGateStatus[] = [];
    const gate = createProfileGateController({
      listen: (_uid, _onData, onErr) => {
        onErr(Object.assign(new Error('listen'), { code: 'unavailable' }));
        return () => undefined;
      },
      get: async () => ({ profileSetupCompleted: true }),
    });
    gate.start('u1', (s) => statuses.push(s));
    await waitMicrotask();
    await waitMicrotask();
    assert.equal(statuses.at(-1)?.phase, 'profile_complete');
    gate.stop();
  });

  it('listener fails and fallback get returns absent → missing_or_incomplete', async () => {
    const statuses: ProfileGateStatus[] = [];
    const gate = createProfileGateController({
      listen: (_uid, _onData, onErr) => {
        onErr(new Error('listen'));
        return () => undefined;
      },
      get: async () => null,
    });
    gate.start('u1', (s) => statuses.push(s));
    await waitMicrotask();
    await waitMicrotask();
    assert.equal(statuses.at(-1)?.phase, 'profile_missing_or_incomplete');
    gate.stop();
  });

  it('listener and get permission-denied → profile_read_error (not MainTabs)', async () => {
    const statuses: ProfileGateStatus[] = [];
    const denied = Object.assign(new Error('denied'), {
      code: 'firestore/permission-denied',
    });
    const gate = createProfileGateController({
      listen: (_uid, _onData, onErr) => {
        onErr(denied);
        return () => undefined;
      },
      get: async () => {
        throw denied;
      },
    });
    gate.start('u1', (s) => statuses.push(s));
    await waitMicrotask();
    await waitMicrotask();
    const last = statuses.at(-1);
    assert.equal(last?.phase, 'profile_read_error');
    if (last?.phase === 'profile_read_error') {
      assert.equal(last.reason, 'permission_denied');
    }
    assert.ok(statuses.every((s) => s.phase !== 'profile_complete'));
    gate.stop();
  });

  it('listener and get transient → profile_read_error transient', async () => {
    const statuses: ProfileGateStatus[] = [];
    const gate = createProfileGateController({
      listen: (_uid, _onData, onErr) => {
        onErr(Object.assign(new Error('down'), { code: 'unavailable' }));
        return () => undefined;
      },
      get: async () => {
        throw Object.assign(new Error('down'), { code: 'unavailable' });
      },
    });
    gate.start('u1', (s) => statuses.push(s));
    await waitMicrotask();
    await waitMicrotask();
    const last = statuses.at(-1);
    assert.equal(last?.phase, 'profile_read_error');
    if (last?.phase === 'profile_read_error') {
      assert.equal(last.reason, 'transient');
    }
    gate.stop();
  });

  it('retry after error resolves to correct destination', async () => {
    const statuses: ProfileGateStatus[] = [];
    let mode: 'fail' | 'ok' = 'fail';
    const denied = Object.assign(new Error('denied'), {
      code: 'permission-denied',
    });
    const gate = createProfileGateController({
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
    gate.start('u1', (s) => statuses.push(s));
    await waitMicrotask();
    await waitMicrotask();
    assert.equal(statuses.at(-1)?.phase, 'profile_read_error');

    mode = 'ok';
    gate.retry('u1', (s) => statuses.push(s));
    await waitMicrotask();
    assert.equal(statuses.at(-1)?.phase, 'profile_complete');
    gate.stop();
  });

  it('start replaces prior listener (no duplicate active unsubs)', () => {
    let active = 0;
    const gate = createProfileGateController({
      listen: () => {
        active += 1;
        return () => {
          active -= 1;
        };
      },
      get: async () => null,
    });
    gate.start('u1', () => undefined);
    assert.equal(active, 1);
    gate.start('u1', () => undefined);
    assert.equal(active, 1);
    gate.stop();
    assert.equal(active, 0);
  });

  it('stop ignores late callbacks (unmount)', async () => {
    const statuses: ProfileGateStatus[] = [];
    let onData: ((d: unknown) => void) | null = null;
    const gate = createProfileGateController({
      listen: (_uid, dataCb) => {
        onData = dataCb;
        return () => undefined;
      },
      get: async () => null,
    });
    gate.start('u1', (s) => statuses.push(s));
    gate.stop();
    onData?.({ profileSetupCompleted: true });
    await waitMicrotask();
    assert.ok(
      statuses.every((s) => s.phase !== 'profile_complete'),
      'late complete must not apply after stop',
    );
  });

  it('no error path yields profile_complete accidentally', async () => {
    const statuses: ProfileGateStatus[] = [];
    const gate = createProfileGateController({
      listen: (_uid, _onData, onErr) => {
        onErr(new Error('x'));
        return () => undefined;
      },
      get: async () => {
        throw new Error('y');
      },
    });
    gate.start('u1', (s) => statuses.push(s));
    await waitMicrotask();
    await waitMicrotask();
    assert.equal(statuses.at(-1)?.phase, 'profile_read_error');
    assert.equal(
      statuses.filter((s) => s.phase === 'profile_complete').length,
      0,
    );
    gate.stop();
  });
});

describe('shared gate contract (Google / password / LinkedIn)', () => {
  it('exposes the same phase vocabulary for all auth providers', () => {
    const phases = new Set([
      statusFromProfileDocument(null),
      statusFromProfileDocument({ profileSetupCompleted: false }),
      statusFromProfileDocument({ profileSetupCompleted: true }),
    ]);
    assert.deepEqual(
      [...phases].sort(),
      ['profile_complete', 'profile_missing_or_incomplete'].sort(),
    );
  });
});

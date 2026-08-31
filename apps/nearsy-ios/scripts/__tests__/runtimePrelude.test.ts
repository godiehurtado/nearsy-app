import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ensureQueueMicrotaskOnTarget,
  type QueueMicrotaskRuntimeTarget,
} from '../../runtimePrelude';

function createTarget(
  existing?: (callback: () => void) => void,
): QueueMicrotaskRuntimeTarget {
  return {
    queueMicrotask: existing,
  } as QueueMicrotaskRuntimeTarget;
}

describe('queueMicrotask runtime prelude install', () => {
  it('does not replace an existing queueMicrotask implementation', () => {
    const calls: unknown[] = [];
    const existing = (callback: () => void) => {
      calls.push('existing');
      callback();
    };
    const target = createTarget(existing);

    ensureQueueMicrotaskOnTarget(target);
    target.queueMicrotask?.(() => {
      calls.push('ran');
    });

    assert.deepEqual(calls, ['existing', 'ran']);
    assert.equal(target.queueMicrotask, existing);
  });

  it('installs queueMicrotask when missing and runs callbacks asynchronously in order', async () => {
    const target = createTarget(undefined);
    ensureQueueMicrotaskOnTarget(target);

    assert.equal(typeof target.queueMicrotask, 'function');

    const order: string[] = [];
    let syncAfterFirstSchedule = false;

    target.queueMicrotask?.(() => {
      order.push('first');
    });
    syncAfterFirstSchedule = order.length === 0;

    target.queueMicrotask?.(() => {
      order.push('second');
    });

    assert.equal(syncAfterFirstSchedule, true);

    await Promise.resolve();
    assert.deepEqual(order, ['first', 'second']);
  });

  it('rejects non-function callbacks with TypeError', () => {
    const target = createTarget(undefined);
    ensureQueueMicrotaskOnTarget(target);

    assert.throws(
      () => target.queueMicrotask?.('not-a-function' as never),
      /must be a function/,
    );
  });

  it('rethrows callback errors asynchronously', async () => {
    const target = createTarget(undefined);
    ensureQueueMicrotaskOnTarget(target);

    const error = new Error('prelude callback failed');
    let thrown: unknown;

    await new Promise<void>((resolve) => {
      const originalSetTimeout = globalThis.setTimeout;
      globalThis.setTimeout = ((fn: () => void) => {
        globalThis.setTimeout = originalSetTimeout;
        try {
          fn();
        } catch (caught) {
          thrown = caught;
        }
        resolve();
        return 0 as unknown as ReturnType<typeof setTimeout>;
      }) as typeof setTimeout;

      target.queueMicrotask?.(() => {
        throw error;
      });
    });

    assert.equal(thrown, error);
  });
});

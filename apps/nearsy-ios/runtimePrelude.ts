type QueueMicrotaskCallback = () => void;

export type QueueMicrotaskRuntimeTarget = typeof globalThis & {
  queueMicrotask?: (callback: QueueMicrotaskCallback) => void;
};

const resolvedPromise = Promise.resolve();

export function ensureQueueMicrotaskOnTarget(
  target: QueueMicrotaskRuntimeTarget,
): void {
  if (typeof target.queueMicrotask === 'function') {
    return;
  }

  target.queueMicrotask = (callback: QueueMicrotaskCallback): void => {
    if (typeof callback !== 'function') {
      throw new TypeError('queueMicrotask callback must be a function');
    }

    void resolvedPromise.then(callback).catch((error: unknown) => {
      setTimeout(() => {
        throw error;
      }, 0);
    });
  };
}

ensureQueueMicrotaskOnTarget(globalThis as QueueMicrotaskRuntimeTarget);

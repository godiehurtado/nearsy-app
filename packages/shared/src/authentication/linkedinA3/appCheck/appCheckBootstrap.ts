/**
 * App Check bootstrap state machine (DI-friendly for unit tests).
 */

import { LinkedInA3ClientError } from '../sanitize';

export type AppCheckBootstrapState =
  | 'not_initialized'
  | 'initializing'
  | 'ready'
  | 'failed';

export type AppCheckBootstrapPort = {
  /** Configure + initialize native App Check. Must not log tokens. */
  initialize: () => Promise<void>;
  /** Force-refresh a token to prove readiness. Must not return/log the token to callers. */
  ensureToken: () => Promise<void>;
};

export type AppCheckBootstrapOptions = {
  port: AppCheckBootstrapPort;
  timeoutMs?: number;
  maxAttempts?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_ATTEMPTS = 2;

export function createAppCheckBootstrap(options: AppCheckBootstrapOptions) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const now = options.now ?? (() => Date.now());
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  let state: AppCheckBootstrapState = 'not_initialized';
  let shared: Promise<void> | null = null;
  let lastError: LinkedInA3ClientError | null = null;

  async function runAttempt(): Promise<void> {
    const started = now();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
    }, timeoutMs);

    try {
      await options.port.initialize();
      if (timedOut) {
        throw new LinkedInA3ClientError(
          'APP_CHECK_TIMEOUT',
          'App Check initialization timed out.',
        );
      }
      await options.port.ensureToken();
      if (timedOut) {
        throw new LinkedInA3ClientError(
          'APP_CHECK_TIMEOUT',
          'App Check initialization timed out.',
        );
      }
      if (now() - started > timeoutMs) {
        throw new LinkedInA3ClientError(
          'APP_CHECK_TIMEOUT',
          'App Check initialization timed out.',
        );
      }
    } finally {
      clearTimeout(timer);
    }
  }

  async function initializeInternal(): Promise<void> {
    state = 'initializing';
    lastError = null;

    let attempt = 0;
    let last: unknown;
    while (attempt < maxAttempts) {
      attempt += 1;
      try {
        await runAttempt();
        state = 'ready';
        return;
      } catch (err) {
        last = err;
        if (attempt < maxAttempts) {
          await sleep(250 * attempt);
        }
      }
    }

    const sanitized =
      last instanceof LinkedInA3ClientError
        ? last
        : (() => {
            const anyErr = last as { code?: string; message?: string };
            return new LinkedInA3ClientError(
              'APP_CHECK_FAILED',
              typeof anyErr?.message === 'string' && anyErr.message
                ? anyErr.message.slice(0, 180)
                : 'App Check initialization failed.',
              typeof anyErr?.code === 'string' ? anyErr.code : undefined,
            );
          })();
    lastError = sanitized;
    state = 'failed';
    throw sanitized;
  }

  function ensureReady(): void {
    if (state === 'ready') return;
    if (state === 'initializing') {
      throw new LinkedInA3ClientError(
        'INITIALIZING',
        'App Check is still initializing.',
      );
    }
    if (state === 'failed') {
      throw (
        lastError ??
        new LinkedInA3ClientError(
          'APP_CHECK_FAILED',
          'App Check initialization failed.',
        )
      );
    }
    throw new LinkedInA3ClientError(
      'NOT_INITIALIZED',
      'App Check is not initialized.',
    );
  }

  return {
    getState(): AppCheckBootstrapState {
      return state;
    },
    getLastError(): LinkedInA3ClientError | null {
      return lastError;
    },
    ensureReady,
    /** Single-flight initialize. Retries are explicit and bounded. */
    initialize(): Promise<void> {
      if (state === 'ready') {
        return Promise.resolve();
      }
      if (!shared) {
        shared = initializeInternal().finally(() => {
          // Allow a later explicit retry after failure by clearing the latch.
          if (state === 'failed') {
            shared = null;
          }
        });
      }
      return shared;
    },
    /** Explicit retry after failure (does not auto-loop forever). */
    retry(): Promise<void> {
      if (state === 'ready') {
        return Promise.resolve();
      }
      if (state === 'initializing' && shared) {
        return shared;
      }
      state = 'not_initialized';
      lastError = null;
      shared = null;
      return this.initialize();
    },
  };
}

export type AppCheckBootstrap = ReturnType<typeof createAppCheckBootstrap>;

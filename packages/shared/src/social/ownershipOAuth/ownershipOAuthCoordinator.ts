/**
 * Shared Android OAuth-return coordinator for YouTube / TikTok / X ownership.
 *
 * One coordinator instance per network handles:
 * - Custom Tabs auth-session URL
 * - Linking events while the app is alive
 * - getInitialURL after process recreation
 *
 * Never Starts, never opens a browser. Exchange at most once per return
 * (in-process fingerprint + durable SecureStore). LinkedIn login is untouched.
 */

export type OwnershipProfileMode = 'personal' | 'professional';

export type OwnershipReturnSource =
  | 'browser_session'
  | 'linking'
  | 'cold_start';

export type OwnershipLinkingPort = {
  getInitialURL: () => Promise<string | null>;
  addEventListener: (
    type: 'url',
    handler: (event: { url: string }) => void,
  ) => { remove: () => void };
};

export type OwnershipReturnParse =
  | {
      kind: 'success';
      transactionId: string;
      mode?: OwnershipProfileMode;
    }
  | {
      kind: 'provider_error';
      errorCode: string;
      transactionId?: string;
      mode?: OwnershipProfileMode;
    }
  | { kind: 'unrelated' }
  | { kind: 'invalid'; reason: string };

export type OwnershipStoredTx = {
  transactionId: string;
  clientProofVerifier: string;
  expiresAt: number;
  uid: string;
  mode: OwnershipProfileMode;
};

export type OwnershipBrowserOutcome =
  | { type: 'success'; url: string }
  | { type: 'cancel' }
  | { type: 'dismiss' }
  | { type: 'unavailable' }
  | { type: 'failed' };

export type OwnershipHandleResult<TExchange> =
  | { status: 'ignored' }
  | { status: 'duplicate' }
  | { status: 'exchanged'; result: TExchange }
  | {
      status: 'provider_error';
      errorCode: string;
      transactionId?: string;
    }
  | { status: 'failed'; code: string; message: string };

export type OwnershipBrowserSessionResult<TExchange> =
  | OwnershipHandleResult<TExchange>
  | { status: 'cancelled' }
  | { status: 'browser_failed'; code: 'BROWSER_FAILED' | 'BROWSER_UNAVAILABLE' };

export type OwnershipOAuthCoordinatorConfig<TExchange> = {
  parseReturnUrl: (url: string) => OwnershipReturnParse;
  readStoredTx: () => Promise<OwnershipStoredTx | null>;
  clearStoredTx: () => Promise<void>;
  currentUid: () => string | null;
  exchange: (tx: OwnershipStoredTx) => Promise<TExchange>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  dismissGraceMs?: number;
};

export type CompleteOwnershipBrowserSessionInput = {
  authorizationUrl: string;
  returnUrl: string;
  expectedUid: string;
  expectedMode: OwnershipProfileMode;
  openAuthSession: (
    authorizationUrl: string,
    returnUrl: string,
  ) => Promise<OwnershipBrowserOutcome>;
  linking?: OwnershipLinkingPort;
};

const DEFAULT_DISMISS_GRACE_MS = 400;

export function ownershipReturnFingerprint(
  parsed: OwnershipReturnParse,
): string | null {
  if (parsed.kind === 'success') {
    return `ok:${parsed.transactionId}`;
  }
  if (parsed.kind === 'provider_error') {
    return `err:${parsed.transactionId ?? ''}:${parsed.errorCode}`;
  }
  return null;
}

function isRelatedParse(parsed: OwnershipReturnParse): boolean {
  return parsed.kind !== 'unrelated';
}

export function createOwnershipOAuthCoordinator<TExchange>(
  config: OwnershipOAuthCoordinatorConfig<TExchange>,
) {
  const now = config.now ?? (() => Date.now());
  const sleep =
    config.sleep ??
    ((ms: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
      }));
  const dismissGraceMs = config.dismissGraceMs ?? DEFAULT_DISMISS_GRACE_MS;

  const processedFingerprints = new Set<string>();
  let handleMutex: Promise<void> = Promise.resolve();
  let flowInFlight = false;

  function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const previous = handleMutex;
    let release!: () => void;
    handleMutex = new Promise<void>((resolve) => {
      release = resolve;
    });
    return previous
      .catch(() => undefined)
      .then(fn)
      .finally(() => {
        release();
      });
  }

  function claimFingerprint(fp: string | null): 'ok' | 'duplicate' | 'none' {
    if (!fp) return 'none';
    if (processedFingerprints.has(fp)) return 'duplicate';
    processedFingerprints.add(fp);
    return 'ok';
  }

  function isSessionCorrelated(source: OwnershipReturnSource): boolean {
    return source === 'browser_session';
  }

  async function handleReturnUrl(
    url: string,
    options: {
      source: OwnershipReturnSource;
      expectedMode?: OwnershipProfileMode;
      expectedUid?: string;
    },
  ): Promise<OwnershipHandleResult<TExchange>> {
    const source = options.source;

    type Gate =
      | OwnershipHandleResult<TExchange>
      | { status: 'do_exchange'; tx: OwnershipStoredTx };

    const gated = await runExclusive(async (): Promise<Gate> => {
      const parsed = config.parseReturnUrl(url);

      if (parsed.kind === 'unrelated') {
        return { status: 'ignored' };
      }

      if (parsed.kind === 'invalid') {
        if (isSessionCorrelated(source)) {
          await config.clearStoredTx();
          return {
            status: 'failed',
            code: 'TX_INVALID',
            message: 'Invalid verification return.',
          };
        }
        return { status: 'ignored' };
      }

      const fp = ownershipReturnFingerprint(parsed);
      const claim = claimFingerprint(fp);
      if (claim === 'duplicate') {
        return { status: 'duplicate' };
      }

      if (parsed.kind === 'provider_error') {
        const stored = await config.readStoredTx();
        if (parsed.transactionId) {
          if (stored && stored.transactionId !== parsed.transactionId) {
            return {
              status: 'failed',
              code: 'TX_INVALID',
              message: 'Verification transaction mismatch.',
            };
          }
          if (stored && stored.transactionId === parsed.transactionId) {
            await config.clearStoredTx();
            return {
              status: 'provider_error',
              errorCode: parsed.errorCode,
              transactionId: parsed.transactionId,
            };
          }
          if (!isSessionCorrelated(source)) {
            return { status: 'ignored' };
          }
          return {
            status: 'provider_error',
            errorCode: parsed.errorCode,
            transactionId: parsed.transactionId,
          };
        }
        if (isSessionCorrelated(source)) {
          await config.clearStoredTx();
          return {
            status: 'provider_error',
            errorCode: parsed.errorCode,
          };
        }
        return { status: 'ignored' };
      }

      const stored = await config.readStoredTx();
      if (!stored) {
        if (!isSessionCorrelated(source)) {
          return { status: 'ignored' };
        }
        return {
          status: 'failed',
          code: 'TX_INVALID',
          message: 'Verification transaction mismatch.',
        };
      }

      const uid = config.currentUid();
      if (!uid) {
        return {
          status: 'failed',
          code: 'unauthenticated',
          message: 'Must be signed in.',
        };
      }
      if (stored.uid !== uid) {
        await config.clearStoredTx();
        return {
          status: 'failed',
          code: 'session_changed',
          message: 'Signed-in user changed during verification.',
        };
      }
      if (options.expectedUid && options.expectedUid !== uid) {
        await config.clearStoredTx();
        return {
          status: 'failed',
          code: 'session_changed',
          message: 'Signed-in user changed during verification.',
        };
      }

      if (options.expectedMode && stored.mode !== options.expectedMode) {
        return { status: 'ignored' };
      }
      if (parsed.mode && parsed.mode !== stored.mode) {
        if (isSessionCorrelated(source)) {
          await config.clearStoredTx();
          return {
            status: 'failed',
            code: 'TX_INVALID',
            message: 'Return mode does not match Start.',
          };
        }
        return { status: 'ignored' };
      }
      if (stored.transactionId !== parsed.transactionId) {
        return {
          status: 'failed',
          code: 'TX_INVALID',
          message: 'Verification transaction mismatch.',
        };
      }
      if (now() > stored.expiresAt) {
        await config.clearStoredTx();
        return {
          status: 'failed',
          code: 'TX_EXPIRED',
          message: 'Verification expired.',
        };
      }

      return { status: 'do_exchange', tx: stored };
    });

    if (gated.status !== 'do_exchange') {
      return gated;
    }

    try {
      const result = await config.exchange(gated.tx);
      await config.clearStoredTx();
      return { status: 'exchanged', result };
    } catch (err) {
      await config.clearStoredTx();
      const code =
        err &&
        typeof err === 'object' &&
        'code' in err &&
        typeof (err as { code?: unknown }).code === 'string'
          ? (err as { code: string }).code
          : 'TX_FAILED';
      const message =
        err instanceof Error ? err.message : 'Verification exchange failed.';
      return { status: 'failed', code, message };
    }
  }

  async function waitForRelatedReturn(
    getLiveUrl: () => string | null,
    linking?: OwnershipLinkingPort,
  ): Promise<string | null> {
    const deadline = now() + dismissGraceMs;
    const pick = (candidate: string | null): string | null => {
      if (!candidate) return null;
      return isRelatedParse(config.parseReturnUrl(candidate))
        ? candidate
        : null;
    };

    let found = pick(getLiveUrl());
    if (found) return found;

    while (now() < deadline) {
      const remaining = deadline - now();
      if (remaining <= 0) break;
      await sleep(Math.min(50, remaining));
      found = pick(getLiveUrl());
      if (found) return found;
    }

    found = pick(getLiveUrl());
    if (found) return found;
    if (linking) {
      try {
        found = pick(await linking.getInitialURL());
      } catch {
        found = null;
      }
    }
    return found;
  }

  async function inspectInitialReturn(
    linking: OwnershipLinkingPort,
    expectedMode?: OwnershipProfileMode,
  ): Promise<OwnershipHandleResult<TExchange>> {
    if (flowInFlight) {
      return { status: 'ignored' };
    }
    let initial: string | null;
    try {
      initial = await linking.getInitialURL();
    } catch {
      return { status: 'ignored' };
    }
    if (!initial) {
      return { status: 'ignored' };
    }
    return handleReturnUrl(initial, {
      source: 'cold_start',
      expectedMode,
    });
  }

  function subscribeReturnUrls(
    linking: OwnershipLinkingPort,
    onUrl: (url: string) => void,
  ): { remove: () => void } {
    const sub = linking.addEventListener('url', (event) => {
      if (typeof event.url !== 'string') return;
      if (!isRelatedParse(config.parseReturnUrl(event.url))) return;
      if (flowInFlight) return;
      onUrl(event.url);
    });
    return {
      remove: () => {
        sub.remove();
      },
    };
  }

  async function completeBrowserSession(
    input: CompleteOwnershipBrowserSessionInput,
  ): Promise<OwnershipBrowserSessionResult<TExchange>> {
    if (flowInFlight) {
      return {
        status: 'failed',
        code: 'TX_INVALID',
        message: 'A verification operation is already in progress.',
      };
    }
    flowInFlight = true;

    let linkingSub: { remove: () => void } | null = null;
    let linkingUrl: string | null = null;

    try {
      if (input.linking) {
        linkingSub = input.linking.addEventListener('url', (event) => {
          if (typeof event.url !== 'string') return;
          if (!isRelatedParse(config.parseReturnUrl(event.url))) return;
          if (linkingUrl == null) {
            linkingUrl = event.url;
          }
        });
      }

      let browserOutcome: OwnershipBrowserOutcome;
      try {
        browserOutcome = await input.openAuthSession(
          input.authorizationUrl,
          input.returnUrl,
        );
      } catch {
        await config.clearStoredTx();
        return { status: 'browser_failed', code: 'BROWSER_FAILED' };
      }

      if (browserOutcome.type === 'unavailable') {
        await config.clearStoredTx();
        return { status: 'browser_failed', code: 'BROWSER_UNAVAILABLE' };
      }
      if (browserOutcome.type === 'failed') {
        await config.clearStoredTx();
        return { status: 'browser_failed', code: 'BROWSER_FAILED' };
      }

      if (
        browserOutcome.type === 'cancel' ||
        browserOutcome.type === 'dismiss'
      ) {
        const pending = await waitForRelatedReturn(
          () => linkingUrl,
          input.linking,
        );
        if (pending) {
          return handleReturnUrl(pending, {
            source: 'browser_session',
            expectedMode: input.expectedMode,
            expectedUid: input.expectedUid,
          });
        }
        await config.clearStoredTx();
        return { status: 'cancelled' };
      }

      const returnUrl = browserOutcome.url || linkingUrl;
      if (!returnUrl) {
        await config.clearStoredTx();
        return {
          status: 'failed',
          code: 'TX_INVALID',
          message: 'Invalid verification return.',
        };
      }

      return handleReturnUrl(returnUrl, {
        source: 'browser_session',
        expectedMode: input.expectedMode,
        expectedUid: input.expectedUid,
      });
    } finally {
      if (linkingSub) {
        try {
          linkingSub.remove();
        } catch {
          // best-effort
        }
      }
      flowInFlight = false;
    }
  }

  function resetForTests(): void {
    processedFingerprints.clear();
    handleMutex = Promise.resolve();
    flowInFlight = false;
  }

  return {
    handleReturnUrl,
    inspectInitialReturn,
    subscribeReturnUrls,
    completeBrowserSession,
    resetForTests,
    isFlowInFlight: () => flowInFlight,
  };
}

export type OwnershipOAuthCoordinator<TExchange> = ReturnType<
  typeof createOwnershipOAuthCoordinator<TExchange>
>;

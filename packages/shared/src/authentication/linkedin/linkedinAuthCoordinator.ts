/**
 * LinkedIn browser + deep-link coordinator (A3.4.3).
 *
 * - Runs Start → auth session → strict parse → Exchange (in-memory customToken only).
 * - Exposes explicit initial-URL / foreground subscription APIs for A3.4.4 wiring.
 * - Does NOT auto-process initial URL in App.tsx.
 * - Does NOT call signInWithCustomToken.
 * - Does NOT persist customToken.
 *
 * Callback origin policy (error without transactionId):
 * - browser_session: correlated to the open auth attempt → clear local tx
 * - linking / cold_start: uncorrelated → never clear a local tx; ignore or fail soft
 *
 * Clear rules:
 * - unrelated → no clear
 * - invalid → clear only for browser_session
 * - mismatch (success or error tx ≠ local) → no clear
 * - duplicate → no clear (must not disturb in-flight Exchange)
 * - provider_error with matching tx → clear
 * - provider_error without tx → clear only for browser_session
 *
 * Dedup: in-process fingerprint claim mutex + durable SecureStore slot +
 * Functions one-time Exchange. Fingerprints alone are not sufficient across process death.
 *
 * NETWORK / UNKNOWN: A3.4.2 keep-tx policy; no automatic retry here.
 */

import type { LinkedInAuthBrowser } from './linkedinBrowserSession.ts';
import {
  linkedInReturnFingerprint,
  parseLinkedInMobileReturnUrl,
} from './linkedinDeepLinkParser.ts';
import {
  LINKEDIN_MOBILE_RETURN_URL,
  LinkedInAuthError,
  clearLinkedInAuthTransaction,
  linkedInAuthExchange,
  linkedInAuthStart,
  shouldClearTransactionAfterFlowError,
  type LinkedInAuthClientDeps,
  type LinkedInAuthStartResult,
  type LinkedInDeepLinkParseResult,
  type LinkedInProfileHints,
  type LinkedInStoredTransaction,
} from './linkedinAuthCore.ts';

export type LinkedInLinkingPort = {
  getInitialURL: () => Promise<string | null>;
  addEventListener: (
    type: 'url',
    handler: (event: { url: string }) => void,
  ) => { remove: () => void };
};

/** How the return URL entered the client — drives clear policy for uncorrelated errors. */
export type LinkedInReturnSource =
  | 'browser_session'
  | 'linking'
  | 'cold_start'
  | 'explicit';

export type LinkedInBrowserFlowResult =
  | { status: 'authenticated'; customToken: string; profileHints?: LinkedInProfileHints }
  | { status: 'cancelled' }
  | { status: 'dismissed' }
  | { status: 'provider_error'; errorCode: string; transactionId?: string }
  | { status: 'failed'; error: LinkedInAuthError };

/** Validated cold-start / ingress claim — Exchange not performed yet. */
export type LinkedInPendingExchangeClaim = {
  transactionId: string;
  /** Synthetic URL fingerprint already recorded for dedup (process-local). */
  fingerprint: string;
};

export type LinkedInReturnHandleResult =
  | { status: 'ignored' }
  | { status: 'pending_exchange'; claim: LinkedInPendingExchangeClaim }
  | { status: 'authenticated'; customToken: string; profileHints?: LinkedInProfileHints }
  | { status: 'provider_error'; errorCode: string; transactionId?: string }
  | { status: 'failed'; error: LinkedInAuthError };

export type LinkedInCoordinatorDeps = LinkedInAuthClientDeps & {
  browser: LinkedInAuthBrowser;
  linking?: LinkedInLinkingPort;
};

export type HandleLinkedInReturnOptions = {
  exchange?: boolean;
  source?: LinkedInReturnSource;
};

let flowInFlight = false;
/** Fingerprints claimed or completed in this process (dedup across channels). */
const processedFingerprints = new Set<string>();
/** Serializes claim + ownership through handleLinkedInReturnUrl entry. */
let handleMutex: Promise<void> = Promise.resolve();

/** Test-only */
export function __resetLinkedInCoordinatorForTests(): void {
  flowInFlight = false;
  processedFingerprints.clear();
  handleMutex = Promise.resolve();
}

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

async function readActiveTransaction(
  deps: LinkedInAuthClientDeps,
): Promise<LinkedInStoredTransaction | null> {
  try {
    return await deps.store.read();
  } catch (err) {
    if (
      err instanceof LinkedInAuthError &&
      (err.code === 'TRANSACTION_EXPIRED' ||
        err.code === 'TRANSACTION_CORRUPT')
    ) {
      return null;
    }
    throw err;
  }
}

async function clearOnTerminal(
  deps: LinkedInAuthClientDeps,
  err: LinkedInAuthError,
): Promise<void> {
  if (shouldClearTransactionAfterFlowError(err)) {
    await clearLinkedInAuthTransaction(deps.store);
  }
}

/**
 * Discard local transaction (cancel / abandon). Does not Start again.
 */
export async function discardLinkedInAuthTransaction(
  deps: LinkedInAuthClientDeps,
): Promise<void> {
  await clearLinkedInAuthTransaction(deps.store);
}

function isSessionCorrelatedSource(source: LinkedInReturnSource): boolean {
  return source === 'browser_session';
}

/**
 * Process a return URL against the durable transaction.
 * When exchange=false (cold-start handoff), returns pending_exchange without minting a token.
 *
 * Clear policy depends on `source` for uncorrelated callbacks (see file header).
 */
export async function handleLinkedInReturnUrl(
  deps: LinkedInAuthClientDeps,
  url: string,
  options: HandleLinkedInReturnOptions = {},
): Promise<LinkedInReturnHandleResult> {
  const exchange = options.exchange !== false;
  const source: LinkedInReturnSource = options.source ?? 'explicit';

  type GateResult =
    | LinkedInReturnHandleResult
    | { status: 'do_exchange'; transactionId: string };

  const gated = await runExclusive(async (): Promise<GateResult> => {
    const parsed = parseLinkedInMobileReturnUrl(url);

    if (parsed.kind === 'unrelated') {
      return { status: 'ignored' };
    }

    if (parsed.kind === 'invalid') {
      const err = new LinkedInAuthError(
        'CALLBACK_INVALID',
        'LinkedIn return URL is invalid.',
      );
      // Only the auth-session return is correlated to the local attempt.
      if (isSessionCorrelatedSource(source)) {
        await clearLinkedInAuthTransaction(deps.store);
      }
      return { status: 'failed', error: err };
    }

    const fp = linkedInReturnFingerprint(url);
    const claim = claimFingerprint(fp);
    if (claim === 'duplicate') {
      // Never clear — another owner may be mid-Exchange with the durable verifier.
      return {
        status: 'failed',
        error: new LinkedInAuthError(
          'CALLBACK_DUPLICATE',
          'LinkedIn return was already processed.',
        ),
      };
    }

    if (parsed.kind === 'provider_error') {
      const stored = await readActiveTransaction(deps);

      if (parsed.transactionId) {
        if (stored && stored.transactionId !== parsed.transactionId) {
          // Error for a different attempt — keep local durable tx.
          return {
            status: 'failed',
            error: new LinkedInAuthError(
              'CALLBACK_MISMATCH',
              'LinkedIn return does not match the local transaction.',
            ),
          };
        }
        if (stored && stored.transactionId === parsed.transactionId) {
          await clearLinkedInAuthTransaction(deps.store);
          return {
            status: 'provider_error',
            errorCode: parsed.errorCode,
            transactionId: parsed.transactionId,
          };
        }
        // No local tx (or expired) — terminal, no extra side effects.
        return {
          status: 'provider_error',
          errorCode: parsed.errorCode,
          transactionId: parsed.transactionId,
        };
      }

      // No transactionId on error — Functions unknown-tx redirect.
      if (isSessionCorrelatedSource(source)) {
        await clearLinkedInAuthTransaction(deps.store);
        return {
          status: 'provider_error',
          errorCode: parsed.errorCode,
        };
      }
      // linking / cold_start / explicit: cannot prove correlation → do not clear.
      return { status: 'ignored' };
    }

    // success
    const stored = await readActiveTransaction(deps);
    if (!stored) {
      return {
        status: 'failed',
        error: new LinkedInAuthError(
          'TRANSACTION_MISSING',
          'No LinkedIn auth transaction is available.',
        ),
      };
    }
    if (stored.transactionId !== parsed.transactionId) {
      // Keep the local correct transaction — foreign success must not cancel it.
      return {
        status: 'failed',
        error: new LinkedInAuthError(
          'CALLBACK_MISMATCH',
          'LinkedIn return does not match the local transaction.',
        ),
      };
    }

    if (!exchange) {
      return {
        status: 'pending_exchange',
        claim: { transactionId: parsed.transactionId, fingerprint: fp! },
      };
    }

    // Fingerprint already claimed; release mutex before Exchange so a concurrent
    // duplicate can fail soft without clearing the in-flight durable verifier.
    return { status: 'do_exchange', transactionId: parsed.transactionId };
  });

  if (gated.status !== 'do_exchange') {
    return gated;
  }

  try {
    const { customToken, profileHints } = await linkedInAuthExchange(deps, {
      transactionId: gated.transactionId,
    });
    return profileHints
      ? { status: 'authenticated', customToken, profileHints }
      : { status: 'authenticated', customToken };
  } catch (err) {
    const normalized =
      err instanceof LinkedInAuthError
        ? err
        : new LinkedInAuthError('UNKNOWN', 'LinkedIn authentication failed.');
    return { status: 'failed', error: normalized };
  }
}

/**
 * Full Start → browser → parse → Exchange flow.
 * customToken returned only in memory to the caller — never stored.
 */
export async function runLinkedInBrowserAuthFlow(
  deps: LinkedInCoordinatorDeps,
): Promise<LinkedInBrowserFlowResult> {
  if (flowInFlight) {
    return {
      status: 'failed',
      error: new LinkedInAuthError(
        'OPERATION_IN_PROGRESS',
        'A LinkedIn auth operation is already in progress.',
      ),
    };
  }
  flowInFlight = true;

  let linkingSub: { remove: () => void } | null = null;
  let linkingUrl: string | null = null;

  try {
    let start: LinkedInAuthStartResult;
    try {
      start = await linkedInAuthStart(deps);
    } catch (err) {
      const normalized =
        err instanceof LinkedInAuthError
          ? err
          : new LinkedInAuthError('UNKNOWN', 'LinkedIn authentication failed.');
      return { status: 'failed', error: normalized };
    }

    // Foreground Linking race helper (Android Custom Tabs may surface via Linking).
    if (deps.linking) {
      linkingSub = deps.linking.addEventListener('url', (event) => {
        if (typeof event.url !== 'string') return;
        const parsed = parseLinkedInMobileReturnUrl(event.url);
        // Unrelated links must not capture / displace the auth return slot.
        if (parsed.kind === 'unrelated') return;
        if (linkingUrl == null) {
          linkingUrl = event.url;
        }
      });
    }

    let browserOutcome;
    try {
      browserOutcome = await deps.browser.openAuthSession(
        start.authorizationUrl,
        LINKEDIN_MOBILE_RETURN_URL,
      );
    } catch {
      const err = new LinkedInAuthError(
        'BROWSER_FAILED',
        'LinkedIn browser session failed.',
      );
      await clearOnTerminal(deps, err);
      return { status: 'failed', error: err };
    }

    if (browserOutcome.type === 'unavailable') {
      const err = new LinkedInAuthError(
        'BROWSER_UNAVAILABLE',
        'LinkedIn browser session is unavailable.',
      );
      await clearOnTerminal(deps, err);
      return { status: 'failed', error: err };
    }
    if (browserOutcome.type === 'failed') {
      const err = new LinkedInAuthError(
        'BROWSER_FAILED',
        'LinkedIn browser session failed.',
      );
      await clearOnTerminal(deps, err);
      return { status: 'failed', error: err };
    }
    if (browserOutcome.type === 'cancel') {
      const err = new LinkedInAuthError(
        'BROWSER_CANCELLED',
        'LinkedIn browser session was cancelled.',
      );
      await clearOnTerminal(deps, err);
      return { status: 'cancelled' };
    }
    if (browserOutcome.type === 'dismiss') {
      const err = new LinkedInAuthError(
        'BROWSER_DISMISSED',
        'LinkedIn browser session was closed.',
      );
      await clearOnTerminal(deps, err);
      return { status: 'dismissed' };
    }

    // Prefer auth-session URL; fall back to first LinkedIn-shaped Linking event.
    const returnUrl = browserOutcome.url || linkingUrl;
    if (!returnUrl) {
      const err = new LinkedInAuthError(
        'CALLBACK_INVALID',
        'LinkedIn return URL is invalid.',
      );
      await clearOnTerminal(deps, err);
      return { status: 'failed', error: err };
    }

    const handled = await handleLinkedInReturnUrl(deps, returnUrl, {
      exchange: true,
      source: 'browser_session',
    });

    // Same logical return on the other channel: claimFingerprint makes a second
    // handle a soft duplicate (no clear). We do not invoke handle twice here.

    if (handled.status === 'authenticated') {
      return handled.profileHints
        ? {
            status: 'authenticated',
            customToken: handled.customToken,
            profileHints: handled.profileHints,
          }
        : {
            status: 'authenticated',
            customToken: handled.customToken,
          };
    }
    if (handled.status === 'provider_error') {
      return {
        status: 'provider_error',
        errorCode: handled.errorCode,
        transactionId: handled.transactionId,
      };
    }
    if (handled.status === 'ignored') {
      // Should not occur for browser_session correlated returns.
      const err = new LinkedInAuthError(
        'CALLBACK_INVALID',
        'LinkedIn return URL is invalid.',
      );
      await clearOnTerminal(deps, err);
      return { status: 'failed', error: err };
    }
    if (handled.status === 'failed') {
      return { status: 'failed', error: handled.error };
    }
    const err = new LinkedInAuthError(
      'UNKNOWN',
      'LinkedIn authentication failed.',
    );
    return { status: 'failed', error: err };
  } finally {
    if (linkingSub) {
      try {
        linkingSub.remove();
      } catch {
        // ignore
      }
    }
    flowInFlight = false;
  }
}

/**
 * Explicit cold-start / resume inspection — does not Exchange.
 * A3.4.4: authenticateWithLinkedInColdStartClaim / signInWithLinkedInColdStartClaim
 * consumes pending_exchange and immediately signs in via custom token.
 */
export async function inspectInitialLinkedInReturn(
  deps: LinkedInCoordinatorDeps,
): Promise<LinkedInReturnHandleResult> {
  if (!deps.linking) {
    return { status: 'ignored' };
  }
  const initial = await deps.linking.getInitialURL();
  if (!initial) {
    return { status: 'ignored' };
  }
  return handleLinkedInReturnUrl(deps, initial, {
    exchange: false,
    source: 'cold_start',
  });
}

/**
 * Controlled foreground subscription. Listener receives parse results only;
 * does not auto-Exchange or clear. Caller must pass source:'linking' to handle.
 * Always remove() when done.
 */
export function subscribeLinkedInReturnUrls(
  linking: LinkedInLinkingPort,
  onUrl: (url: string, parsed: LinkedInDeepLinkParseResult) => void,
): { remove: () => void } {
  const sub = linking.addEventListener('url', (event) => {
    if (typeof event.url !== 'string') return;
    const parsed = parseLinkedInMobileReturnUrl(event.url);
    if (parsed.kind === 'unrelated') return;
    onUrl(event.url, parsed);
  });
  return {
    remove: () => {
      sub.remove();
    },
  };
}

/** Re-export parse for consumers / tests. */
export { parseLinkedInMobileReturnUrl };

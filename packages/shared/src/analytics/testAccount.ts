/**
 * Dedicated test accounts (shared with Android and Functions).
 *
 * The only source is the Firebase Auth custom claim `nearsyTestUser === true`,
 * set by an admin for the dedicated test UIDs. Users cannot set it. The app reads
 * it from the signed-in account's ID token:
 * - a forced token refresh, up to 1.5 s;
 * - then the cached token, up to 0.5 s;
 * - anything else (no claim, error, timeout) means a real user (fail-closed).
 *
 * Limits: a claim set while the person is signed in shows up after the next
 * token read; a brand-new account's signup can't carry it (the claim is set
 * after the account exists).
 */
export const TEST_ACCOUNT_CLAIM = 'nearsyTestUser';
export const TEST_CLAIM_FORCED_TIMEOUT_MS = 1500;
export const TEST_CLAIM_CACHED_TIMEOUT_MS = 500;

export type TokenClaimsReader = {
  getIdTokenResult(forceRefresh?: boolean): Promise<{ claims?: Record<string, unknown> } | null | undefined>;
};

type Timer = (fn: () => void, ms: number) => unknown;

function within<T>(promise: Promise<T>, ms: number, setTimer: Timer): Promise<T | undefined> {
  return new Promise((resolve) => {
    let done = false;
    setTimer(() => {
      if (!done) {
        done = true;
        resolve(undefined);
      }
    }, ms);
    promise.then(
      (value) => {
        if (!done) {
          done = true;
          resolve(value);
        }
      },
      () => {
        if (!done) {
          done = true;
          resolve(undefined);
        }
      },
    );
  });
}

function hasClaim(result: { claims?: Record<string, unknown> } | null | undefined): boolean {
  return result?.claims?.[TEST_ACCOUNT_CLAIM] === true;
}

/** Never throws; false unless the token says nearsyTestUser === true. */
export async function readTestAccountClaim(
  user: unknown,
  setTimer: Timer = setTimeout,
): Promise<boolean> {
  const reader = user as TokenClaimsReader | null | undefined;
  if (!reader || typeof reader.getIdTokenResult !== 'function') return false;
  const call = (force: boolean) => {
    try {
      return Promise.resolve(reader.getIdTokenResult(force));
    } catch (error) {
      return Promise.reject(error);
    }
  };
  const forced = await within(call(true), TEST_CLAIM_FORCED_TIMEOUT_MS, setTimer);
  if (forced) return hasClaim(forced);
  const cached = await within(call(false), TEST_CLAIM_CACHED_TIMEOUT_MS, setTimer);
  return hasClaim(cached);
}

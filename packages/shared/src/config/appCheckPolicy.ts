/**
 * App Check provider policy for LinkedIn identity callables (A3.4.1).
 *
 * Debug is allowed ONLY when BOTH:
 * 1) Firebase env is Development (nearsy-dev), and
 * 2) the binary is a development client / __DEV__ session.
 *
 * A Development Metro session pointed at Production (default google-services)
 * must NEVER select Debug. Production / preview builds never select Debug.
 *
 * This phase does not configure Play Integrity. When Debug is not allowed,
 * App Check initialization is skipped (LinkedIn callables are Dev-only for now).
 */

export type NearsyFirebaseEnvLabel = 'development' | 'default';

export type NearsyFirebaseEnvExtras = {
  nearsyFirebaseEnv?: unknown;
  nearsyDevClient?: unknown;
};

export function resolveNearsyFirebaseEnvLabel(
  extras: NearsyFirebaseEnvExtras | null | undefined,
): NearsyFirebaseEnvLabel {
  const raw = extras?.nearsyFirebaseEnv;
  if (raw === 'development') return 'development';
  if (raw === 'default' || raw === undefined || raw === null) return 'default';
  // Unknown / inconsistent → fail closed to default (never treat as development).
  return 'default';
}

export function resolveNearsyDevClientFlag(
  extras: NearsyFirebaseEnvExtras | null | undefined,
): boolean {
  return extras?.nearsyDevClient === true;
}

export type AppCheckProviderDecision =
  | { action: 'use_debug'; reason: 'development_nearsy_dev' }
  | { action: 'skip'; reason: AppCheckSkipReason };

export type AppCheckSkipReason =
  | 'firebase_env_not_development'
  | 'not_a_development_build'
  | 'invalid_or_inconsistent_env';

export type AppCheckPolicyInput = {
  extras: NearsyFirebaseEnvExtras | null | undefined;
  /** Metro / debug JS bundle. Alone is insufficient without Development Firebase env. */
  isJsDev: boolean;
  /**
   * Optional explicit override when extras cannot be read in unit tests.
   * Production callers should omit this and rely on extras.
   */
  firebaseEnvOverride?: 'development' | 'default' | 'invalid';
};

export function decideAppCheckProvider(
  input: AppCheckPolicyInput,
): AppCheckProviderDecision {
  const envFromExtras = resolveNearsyFirebaseEnvLabel(input.extras);
  const env =
    input.firebaseEnvOverride === 'invalid'
      ? 'invalid'
      : (input.firebaseEnvOverride ?? envFromExtras);

  if (env === 'invalid') {
    return { action: 'skip', reason: 'invalid_or_inconsistent_env' };
  }

  if (env !== 'development') {
    return { action: 'skip', reason: 'firebase_env_not_development' };
  }

  const isDevBuild =
    input.isJsDev === true || resolveNearsyDevClientFlag(input.extras) === true;

  if (!isDevBuild) {
    return { action: 'skip', reason: 'not_a_development_build' };
  }

  return { action: 'use_debug', reason: 'development_nearsy_dev' };
}

// --- Injectable bootstrap (no native SDK imports; Node-test friendly) ---

export type AppCheckInitStatus =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'ready'; decision: AppCheckProviderDecision }
  | { status: 'skipped'; decision: AppCheckProviderDecision }
  | { status: 'error'; message: string; decision?: AppCheckProviderDecision };

type AppCheckModule = {
  newReactNativeFirebaseAppCheckProvider: () => {
    configure: (opts: {
      android: { provider: 'debug' | 'playIntegrity'; debugToken?: string };
    }) => void;
  };
  initializeAppCheck: (opts: {
    provider: unknown;
    isTokenAutoRefreshEnabled?: boolean;
  }) => Promise<void>;
};

export type AppCheckBootstrapDeps = {
  readExtras: () => NearsyFirebaseEnvExtras;
  isJsDev: boolean;
  getAppCheck: () => AppCheckModule;
};

let initPromise: Promise<AppCheckInitStatus> | null = null;
let lastStatus: AppCheckInitStatus = { status: 'idle' };

export function getAppCheckInitStatus(): AppCheckInitStatus {
  return lastStatus;
}

/** Test-only: reset idempotent latch. */
export function __resetAppCheckBootstrapForTests(): void {
  initPromise = null;
  lastStatus = { status: 'idle' };
}

async function runInit(
  deps: AppCheckBootstrapDeps,
): Promise<AppCheckInitStatus> {
  lastStatus = { status: 'pending' };
  const extras = deps.readExtras();
  const decision = decideAppCheckProvider({
    extras,
    isJsDev: deps.isJsDev,
  });

  if (decision.action === 'skip') {
    const skipped: AppCheckInitStatus = { status: 'skipped', decision };
    lastStatus = skipped;
    return skipped;
  }

  try {
    const ac = deps.getAppCheck();
    const provider = ac.newReactNativeFirebaseAppCheckProvider();
    // Debug provider without embedding a token — owner registers logcat token
    // privately in Firebase Console (see docs/operations/A3.4.1-APP-CHECK-DEBUG.md).
    provider.configure({
      android: {
        provider: 'debug',
      },
    });
    await ac.initializeAppCheck({
      provider,
      isTokenAutoRefreshEnabled: true,
    });
    const ready: AppCheckInitStatus = { status: 'ready', decision };
    lastStatus = ready;
    return ready;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'App Check initialization failed.';
    const sanitized = message.replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      '[redacted]',
    );
    const errorStatus: AppCheckInitStatus = {
      status: 'error',
      message: sanitized,
      decision,
    };
    lastStatus = errorStatus;
    return errorStatus;
  }
}

export function ensureAppCheckInitializedWithDeps(
  deps: AppCheckBootstrapDeps,
): Promise<AppCheckInitStatus> {
  if (!initPromise) {
    initPromise = runInit(deps);
  }
  return initPromise;
}

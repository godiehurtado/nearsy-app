import type { AffiliationEntitySearchProvider } from './affiliationEntitySearchProvider.ts';
import { fixtureAffiliationEntitySearchProvider } from './fixtureAffiliationEntitySearchProvider.ts';
import type { AffiliationEntitySearchCallable } from './firebaseAffiliationEntitySearchProvider.ts';
import { createFirebaseAffiliationEntitySearchProvider } from './firebaseAffiliationEntitySearchProvider.ts';
import { buildLogoDevImageUrl } from './affiliationLogoDev.ts';
import { readLogoDevPublishableKey } from './affiliationLogoDevConfig.ts';
import { AffiliationEntitySearchClientError } from './affiliationEntitySearchContract.ts';

/**
 * Environment / runtime kinds:
 * - firebase: valid env pair + registered callable
 * - unavailable: invalid/unknown/mismatched pair or callable missing (fail closed)
 * - fixture: explicit TEST / local harness only — never selected by env resolution
 */
export type AffiliationEntitySearchProviderKind =
  | 'firebase'
  | 'unavailable'
  | 'fixture';

export type AffiliationEntitySearchRuntimeContext = {
  firebaseEnv?: string | null;
  projectId?: string | null;
};

let registeredCallable: AffiliationEntitySearchCallable | null = null;

/** Test-only: simulate Constants.expoConfig.extra without loading RN. */
let expoExtraForTests: Record<string, unknown> | null = null;

export function setAffiliationExpoExtraForTests(
  extra: Record<string, unknown> | null,
): void {
  expoExtraForTests = extra;
}

/**
 * Explicit kind override (tests / harness).
 * Never maps unknown values to fixture — unknown → unavailable.
 */
export function resolveAffiliationEntitySearchProviderKind(
  raw?: string | null,
): AffiliationEntitySearchProviderKind {
  const value = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (value === 'firebase') return 'firebase';
  if (value === 'fixture') return 'fixture';
  return 'unavailable';
}

const AFFILIATION_LIVE_PROJECT_BY_ENV = {
  development: 'nearsy-dev',
  production: 'nearsy-pj',
} as const;

function parseExplicitFirebaseEnv(
  firebaseEnv?: string | null,
): keyof typeof AFFILIATION_LIVE_PROJECT_BY_ENV | null {
  const raw = String(firebaseEnv ?? '')
    .trim()
    .toLowerCase();
  if (raw === 'development' || raw === 'production') return raw;
  return null;
}

function readExpoConfigExtra(): Record<string, unknown> {
  if (expoExtraForTests) return expoExtraForTests;
  try {
    // Dynamic require: Node tests must not load expo-constants / RN.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Constants = require('expo-constants').default as {
      expoConfig?: { extra?: Record<string, unknown> };
      manifest2?: { extra?: Record<string, unknown> };
    };
    return (
      (Constants.expoConfig?.extra as Record<string, unknown> | undefined) ??
      (Constants.manifest2?.extra as Record<string, unknown> | undefined) ??
      {}
    );
  } catch {
    return {};
  }
}

/**
 * Same precedence as firebaseConfig.ios / affiliation bootstrap pick():
 * Constants.expoConfig.extra → process.env.
 */
function pickExpoPublicConfigValue(name: string): string | null {
  const extra = readExpoConfigExtra();
  const fromExtra = extra?.[name];
  if (typeof fromExtra === 'string' && fromExtra.trim().length > 0) {
    return fromExtra.trim();
  }
  const fromProcess = process.env[name];
  if (typeof fromProcess === 'string' && fromProcess.trim().length > 0) {
    return fromProcess.trim();
  }
  return null;
}

function readAffiliationProjectId(projectId?: string | null): string {
  const explicit = String(projectId ?? '')
    .trim()
    .toLowerCase();
  if (explicit) return explicit;
  return (
    pickExpoPublicConfigValue('EXPO_PUBLIC_FIREBASE_PROJECT_ID') ??
    pickExpoPublicConfigValue('nearsyFirebaseProjectId') ??
    ''
  )
    .trim()
    .toLowerCase();
}

/**
 * Live Firebase provider is allowlisted only:
 * development↔nearsy-dev and production↔nearsy-pj.
 * Crossed, empty, or unknown pairs FAIL CLOSED (unavailable) — never fixture.
 */
export function resolveAffiliationEntitySearchProviderKindFromEnvironment(
  firebaseEnv?: string | null,
  projectId?: string | null,
): Exclude<AffiliationEntitySearchProviderKind, 'fixture'> {
  const environment = parseExplicitFirebaseEnv(
    firebaseEnv ??
      pickExpoPublicConfigValue('nearsyFirebaseEnv') ??
      pickExpoPublicConfigValue('EXPO_PUBLIC_NEARSY_FIREBASE_ENV'),
  );
  if (!environment) return 'unavailable';
  const expected = AFFILIATION_LIVE_PROJECT_BY_ENV[environment];
  const project = readAffiliationProjectId(projectId);
  if (!project || project !== expected) return 'unavailable';
  return 'firebase';
}

export function registerAffiliationEntitySearchCallable(
  invoke: AffiliationEntitySearchCallable | null,
): void {
  registeredCallable = invoke;
}

export function getRegisteredAffiliationEntitySearchCallable(): AffiliationEntitySearchCallable | null {
  return registeredCallable;
}

function readRuntimeContext(): AffiliationEntitySearchRuntimeContext {
  return {
    firebaseEnv:
      pickExpoPublicConfigValue('nearsyFirebaseEnv') ??
      pickExpoPublicConfigValue('EXPO_PUBLIC_NEARSY_FIREBASE_ENV'),
    projectId:
      pickExpoPublicConfigValue('nearsyFirebaseProjectId') ??
      pickExpoPublicConfigValue('EXPO_PUBLIC_FIREBASE_PROJECT_ID'),
  };
}

/** Fail-closed provider — search rejects; UI shows suggestionsUnavailable. */
export function createUnavailableAffiliationEntitySearchProvider(
  reason = 'Affiliation entity search is unavailable for this environment.',
): AffiliationEntitySearchProvider {
  return {
    id: 'unavailable',
    search: async () => {
      throw new AffiliationEntitySearchClientError(
        'FAILED_PRECONDITION',
        reason,
      );
    },
  };
}

export function getAffiliationEntitySearchProvider(
  rawKind?: string | null,
  context?: AffiliationEntitySearchRuntimeContext,
): AffiliationEntitySearchProvider {
  const kind = rawKind
    ? resolveAffiliationEntitySearchProviderKind(rawKind)
    : resolveAffiliationEntitySearchProviderKindFromEnvironment(
        context?.firebaseEnv ?? readRuntimeContext().firebaseEnv,
        context?.projectId ?? readRuntimeContext().projectId,
      );

  // Explicit test / local harness only — never chosen by environment resolution.
  if (kind === 'fixture') {
    return fixtureAffiliationEntitySearchProvider;
  }

  if (kind === 'firebase' && registeredCallable) {
    return createFirebaseAffiliationEntitySearchProvider({
      invoke: registeredCallable,
      resolveLogoUrl: (domain) =>
        buildLogoDevImageUrl(domain, readLogoDevPublishableKey()),
    });
  }

  // Invalid env, or valid env without a registered callable → fail closed.
  return createUnavailableAffiliationEntitySearchProvider(
    kind === 'firebase'
      ? 'Affiliation search callable is not registered.'
      : 'Affiliation entity search is unavailable for this environment.',
  );
}

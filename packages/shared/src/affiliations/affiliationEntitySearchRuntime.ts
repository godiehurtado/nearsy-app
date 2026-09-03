import { parseNearsyFirebaseEnvironmentName } from '../authentication/linkedinA3/environment/nearsyFirebaseEnvironment';
import type { AffiliationEntitySearchProvider } from './affiliationEntitySearchProvider';
import { fixtureAffiliationEntitySearchProvider } from './fixtureAffiliationEntitySearchProvider';
import type { AffiliationEntitySearchCallable } from './firebaseAffiliationEntitySearchProvider';
import { createFirebaseAffiliationEntitySearchProvider } from './firebaseAffiliationEntitySearchProvider';
import { buildLogoDevImageUrl } from './affiliationLogoDev';
import { readLogoDevPublishableKey } from './affiliationLogoDevConfig';

export type AffiliationEntitySearchProviderKind = 'fixture' | 'firebase';

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

export function resolveAffiliationEntitySearchProviderKind(
  raw?: string | null,
): AffiliationEntitySearchProviderKind {
  const value = String(raw ?? '')
    .trim()
    .toLowerCase();
  return value === 'firebase' ? 'firebase' : 'fixture';
}

const AFFILIATION_LIVE_PROJECT_BY_ENV = {
  development: 'nearsy-dev',
  production: 'nearsy-pj',
} as const;

function readExplicitAffiliationFirebaseEnv(
  firebaseEnv?: string | null,
): keyof typeof AFFILIATION_LIVE_PROJECT_BY_ENV | null {
  const raw = String(firebaseEnv ?? '')
    .trim()
    .toLowerCase();
  // Empty is production in the shared env table; affiliations require an
  // explicit name so a missing env cannot silently pick a live project.
  if (!raw) return null;
  try {
    return parseNearsyFirebaseEnvironmentName(raw);
  } catch {
    return null;
  }
}

function readAffiliationProjectId(projectId?: string | null): string {
  const explicit = String(projectId ?? '')
    .trim()
    .toLowerCase();
  if (explicit) return explicit;
  return (pickExpoPublicConfigValue('EXPO_PUBLIC_FIREBASE_PROJECT_ID') ?? '')
    .trim()
    .toLowerCase();
}

/**
 * Live Firebase provider is allowlisted:
 * development / nearsy-dev and production / nearsy-pj.
 * Crossed, empty, or unknown pairs stay on fixture.
 */
export function resolveAffiliationEntitySearchProviderKindFromEnvironment(
  firebaseEnv?: string | null,
  projectId?: string | null,
): AffiliationEntitySearchProviderKind {
  const environment = readExplicitAffiliationFirebaseEnv(firebaseEnv);
  if (!environment) return 'fixture';
  const expected = AFFILIATION_LIVE_PROJECT_BY_ENV[environment];
  const project = readAffiliationProjectId(projectId);
  if (!project || project !== expected) return 'fixture';
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

function readExpoConfigExtra(): Record<string, unknown> {
  if (expoExtraForTests) return expoExtraForTests;
  try {
    // Dynamic require: Node tests must not load expo-constants / RN.
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

function readRuntimeContext(): AffiliationEntitySearchRuntimeContext {
  return {
    firebaseEnv: pickExpoPublicConfigValue('EXPO_PUBLIC_NEARSY_FIREBASE_ENV'),
    projectId: pickExpoPublicConfigValue('EXPO_PUBLIC_FIREBASE_PROJECT_ID'),
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
  if (kind === 'firebase' && registeredCallable) {
    return createFirebaseAffiliationEntitySearchProvider({
      invoke: registeredCallable,
      resolveLogoUrl: (domain) =>
        buildLogoDevImageUrl(domain, readLogoDevPublishableKey()),
    });
  }
  return fixtureAffiliationEntitySearchProvider;
}

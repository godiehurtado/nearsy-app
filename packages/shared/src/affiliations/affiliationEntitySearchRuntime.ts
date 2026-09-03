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
  return String(process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '')
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

function readRuntimeContext(): AffiliationEntitySearchRuntimeContext {
  return {
    firebaseEnv: process.env.EXPO_PUBLIC_NEARSY_FIREBASE_ENV ?? null,
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? null,
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

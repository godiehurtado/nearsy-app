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

/**
 * Live Firebase provider is Development / nearsy-dev only.
 * Empty or production env stays on fixture.
 */
export function resolveAffiliationEntitySearchProviderKindFromEnvironment(
  firebaseEnv?: string | null,
  projectId?: string | null,
): AffiliationEntitySearchProviderKind {
  try {
    const environment = parseNearsyFirebaseEnvironmentName(firebaseEnv);
    if (environment !== 'development') return 'fixture';
  } catch {
    return 'fixture';
  }
  const project = String(projectId ?? '')
    .trim()
    .toLowerCase();
  if (project && project !== 'nearsy-dev') return 'fixture';
  if (!project) {
    const fromProcess = String(process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '')
      .trim()
      .toLowerCase();
    if (fromProcess && fromProcess !== 'nearsy-dev') return 'fixture';
  }
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

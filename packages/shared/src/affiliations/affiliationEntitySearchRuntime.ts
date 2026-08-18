import type { AffiliationEntitySearchProvider } from './affiliationEntitySearchProvider';
import { fixtureAffiliationEntitySearchProvider } from './fixtureAffiliationEntitySearchProvider';
import type { AffiliationEntitySearchCallable } from './firebaseAffiliationEntitySearchProvider';
import { createFirebaseAffiliationEntitySearchProvider } from './firebaseAffiliationEntitySearchProvider';

export type AffiliationEntitySearchProviderKind = 'fixture' | 'firebase';

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
 * I9-C will register a Functions invoker. Until then the runtime stays on fixture.
 */
export function registerAffiliationEntitySearchCallable(
  invoke: AffiliationEntitySearchCallable | null,
): void {
  registeredCallable = invoke;
}

export function getRegisteredAffiliationEntitySearchCallable(): AffiliationEntitySearchCallable | null {
  return registeredCallable;
}

export function getAffiliationEntitySearchProvider(
  rawKind?: string | null,
): AffiliationEntitySearchProvider {
  const kind = resolveAffiliationEntitySearchProviderKind(rawKind);
  if (kind === 'firebase' && registeredCallable) {
    return createFirebaseAffiliationEntitySearchProvider({
      invoke: registeredCallable,
    });
  }
  return fixtureAffiliationEntitySearchProvider;
}

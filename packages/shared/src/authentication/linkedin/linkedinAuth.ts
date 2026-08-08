/**
 * Non-Android stub — LinkedIn A3 client core is Android-scoped in A3.4.
 */
export * from './linkedinAuthCore';

export async function startLinkedInAuth(): Promise<never> {
  throw new Error('startLinkedInAuth is only available on Android.');
}

export async function exchangeLinkedInAuth(): Promise<never> {
  throw new Error('exchangeLinkedInAuth is only available on Android.');
}

export async function cancelLinkedInAuth(): Promise<void> {
  return;
}

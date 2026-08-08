/**
 * Non-Android stub — LinkedIn A3 client is Android-scoped in A3.4.
 */
export * from './linkedinAuthCore';
export {
  parseLinkedInMobileReturnUrl,
  linkedInReturnFingerprint,
} from './linkedinDeepLinkParser';
export {
  mapExpoAuthSessionResult,
  createExpoLinkedInAuthBrowser,
} from './linkedinBrowserSession';
export {
  discardLinkedInAuthTransaction,
  handleLinkedInReturnUrl,
  inspectInitialLinkedInReturn,
  runLinkedInBrowserAuthFlow,
  subscribeLinkedInReturnUrls,
  __resetLinkedInCoordinatorForTests,
} from './linkedinAuthCoordinator';
export {
  mapFirebaseCustomTokenError,
  signInWithLinkedInCustomToken,
  isTerminalFirebaseSignInError,
  isUncertainFirebaseSignInError,
} from './linkedinFirebaseAuth';
export {
  authenticateWithLinkedInBrowser,
  authenticateWithLinkedInColdStartClaim,
  assertLinkedInPendingExchangeClaim,
  reconcileLinkedInFirebaseUncertainState,
  getLinkedInFirebaseUncertainBarrier,
  expectedLinkedInSuccessFingerprint,
  __resetLinkedInSessionForTests,
} from './linkedinSession';

export async function startLinkedInAuth(): Promise<never> {
  throw new Error('startLinkedInAuth is only available on Android.');
}

export async function exchangeLinkedInAuth(): Promise<never> {
  throw new Error('exchangeLinkedInAuth is only available on Android.');
}

export async function cancelLinkedInAuth(): Promise<void> {
  return;
}

export async function runLinkedInAuthWithBrowser(): Promise<never> {
  throw new Error('runLinkedInAuthWithBrowser is only available on Android.');
}

export async function inspectLinkedInInitialReturn(): Promise<never> {
  throw new Error('inspectLinkedInInitialReturn is only available on Android.');
}

export async function processLinkedInReturnUrl(): Promise<never> {
  throw new Error('processLinkedInReturnUrl is only available on Android.');
}

export async function signInWithLinkedInBrowser(): Promise<never> {
  throw new Error('signInWithLinkedInBrowser is only available on Android.');
}

export async function signInWithLinkedInColdStartClaim(): Promise<never> {
  throw new Error(
    'signInWithLinkedInColdStartClaim is only available on Android.',
  );
}

export function reconcileLinkedInSession(): never {
  throw new Error('reconcileLinkedInSession is only available on Android.');
}

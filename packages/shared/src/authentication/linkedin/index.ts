/**
 * Public barrel for LinkedIn A3 client (platform-resolved via Metro).
 *
 * Session APIs (A3.4.4) for future UI/bootstrap wiring — never expose customToken:
 *   signInWithLinkedInBrowser
 *   signInWithLinkedInColdStartClaim
 *   reconcileLinkedInSession
 *
 * Inherited composition/test surfaces (may touch ephemeral tokens internally;
 * UI must not use these to receive a customToken):
 *   exchangeLinkedInAuth, runLinkedInAuthWithBrowser, processLinkedInReturnUrl
 */
export {
  startLinkedInAuth,
  exchangeLinkedInAuth,
  cancelLinkedInAuth,
  runLinkedInAuthWithBrowser,
  inspectLinkedInInitialReturn,
  processLinkedInReturnUrl,
  discardLinkedInAuthTransaction,
  subscribeLinkedInReturnUrls,
  signInWithLinkedInBrowser,
  signInWithLinkedInColdStartClaim,
  reconcileLinkedInSession,
} from './linkedinAuth';

export {
  LINKEDIN_AUTH_START_CALLABLE,
  LINKEDIN_AUTH_EXCHANGE_CALLABLE,
  LINKEDIN_MOBILE_RETURN_URL,
  LINKEDIN_TRANSACTION_TTL_MS,
  LINKEDIN_TX_STORAGE_KEY,
  LinkedInAuthError,
  isExactLinkedInMobileReturnBase,
  shouldClearTransactionAfterFlowError,
  type LinkedInAuthStartResult,
  type LinkedInDeepLinkParseResult,
  type LinkedInStoredTransaction,
  type LinkedInAuthErrorCode,
} from './linkedinAuthCore';

export {
  parseLinkedInMobileReturnUrl,
  linkedInReturnFingerprint,
  LINKEDIN_MOBILE_RETURN_ERROR_CODES,
} from './linkedinDeepLinkParser';

export type { LinkedInReturnSource } from './linkedinAuthCoordinator';

export type {
  LinkedInFirebaseSession,
  LinkedInFirebaseAuthPort,
  LinkedInAuthResolution,
} from './linkedinFirebaseAuth';

export type {
  LinkedInSessionResult,
  LinkedInReconcileResult,
  LinkedInUncertainBarrier,
} from './linkedinSession';

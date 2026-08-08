/**
 * Public barrel for LinkedIn A3 client (platform-resolved via Metro).
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

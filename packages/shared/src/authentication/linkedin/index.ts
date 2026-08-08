/**
 * Public barrel for LinkedIn A3 client (platform-resolved via Metro).
 */
export {
  startLinkedInAuth,
  exchangeLinkedInAuth,
  cancelLinkedInAuth,
} from './linkedinAuth';

export {
  LINKEDIN_AUTH_START_CALLABLE,
  LINKEDIN_AUTH_EXCHANGE_CALLABLE,
  LINKEDIN_MOBILE_RETURN_URL,
  LINKEDIN_TRANSACTION_TTL_MS,
  LINKEDIN_TX_STORAGE_KEY,
  LinkedInAuthError,
  isExactLinkedInMobileReturnBase,
  type LinkedInAuthStartResult,
  type LinkedInDeepLinkParseResult,
  type LinkedInStoredTransaction,
  type LinkedInAuthErrorCode,
} from './linkedinAuthCore';

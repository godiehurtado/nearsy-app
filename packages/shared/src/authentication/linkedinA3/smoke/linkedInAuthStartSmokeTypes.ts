export type LinkedInA3StartSmokeReport = {
  ok: boolean;
  hasTransactionId: boolean;
  hasAuthorizationUrl: boolean;
  hasExpiresAt: boolean;
  transactionIdSanitized?: string;
  authorizationHostPath?: string;
  errorCode?: string;
};

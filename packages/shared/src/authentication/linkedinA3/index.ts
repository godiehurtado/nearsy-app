export {
  resolveNearsyFirebaseEnvironment,
  parseNearsyFirebaseEnvironmentName,
  isDebugAppCheckAllowed,
  FUNCTIONS_REGION,
  LINKEDIN_APP_RETURN_URL,
  DEVELOPMENT_GOOGLE_SERVICES_FILE,
  PRODUCTION_GOOGLE_SERVICES_FILE,
} from './environment/nearsyFirebaseEnvironment';
export type {
  NearsyFirebaseEnvironmentName,
  NearsyFirebaseEnvironmentConfig,
  AppCheckProviderKind,
} from './environment/nearsyFirebaseEnvironment';

export { assertEnvironmentConsistency } from './environment/assertEnvironmentConsistency';

export { createAppCheckBootstrap } from './appCheck/appCheckBootstrap';
export type {
  AppCheckBootstrap,
  AppCheckBootstrapState,
  AppCheckBootstrapPort,
} from './appCheck/appCheckBootstrap';

export { createLinkedInA3CallableClient } from './functions/linkedInA3CallableClient';

export {
  LinkedInA3ClientError,
  sanitizeTransactionId,
  sanitizeAuthorizationUrl,
} from './sanitize';

export {
  getLinkedInA3CallableClient,
  getLinkedInA3AppCheckState,
} from './iosLinkedInA3Foundation';

/** @deprecated decision marker — do not change ProfileCompletion shell in I1 */
export const CRJ_CROSS_PLATFORM_DECISION_PENDING =
  'CRJ_CROSS_PLATFORM_DECISION_PENDING' as const;

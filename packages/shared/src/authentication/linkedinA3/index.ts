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
  toSanitizedCallableError,
  linkedInA3RetrySafe,
} from './sanitize';

export {
  getLinkedInA3CallableClient,
  getLinkedInA3AppCheckState,
} from './iosLinkedInA3Foundation';

export { shouldShowLinkedInA3DevSmokePanel } from './smoke/devSmokePanelGate';
export type { LinkedInA3DevSmokePanelGateInput } from './smoke/devSmokePanelGate';

export {
  runLinkedInA3BrowserAuthFlow,
  clearLinkedInA3OrchestratorStateForTests,
} from './orchestrator';
export { parseLinkedInMobileReturnUrl } from './returnUrl';
export { createClientProofPair } from './clientProof';
export { mapExpoAuthSessionResult } from './browserSession';
export {
  queueLinkedInCrjPrefillIfNeeded,
  buildLinkedInSocialProfileFromAuthHints,
  mergeLinkedInProfileHints,
} from './profilePrefill';
export {
  createInMemoryLinkedInA3DurableStore,
  parseLinkedInA3DurableRecord,
  serializeLinkedInA3DurableRecord,
} from './durableTransactionStore';
export { createLinkedInA3DurableStore } from './createLinkedInA3DurableStore';
export { getSharedLinkedInA3DurableStore } from './runtimeDurableStore';
export {
  resumeLinkedInA3FromReturnUrl,
  resumeLinkedInA3FromLaunchUrl,
  clearLinkedInA3ResumeStateForTests,
} from './durableResume';
export { attachLinkedInA3AppRootResume } from './appRootResume';
export { resetNavigationAfterLinkedInA3SignIn } from './linkedinA3Navigation';
export {
  isLinkedInTransactionExpired,
  normalizeLinkedInExpiresAtMs,
} from './expiresAt';
export { assertLinkedInAuthExchangeResult } from './types';
export type {
  LinkedInAuthExchangeResult,
  LinkedInAuthProfileHints,
} from './types';

/** @deprecated decision marker — do not change ProfileCompletion shell in I1 */
export const CRJ_CROSS_PLATFORM_DECISION_PENDING =
  'CRJ_CROSS_PLATFORM_DECISION_PENDING' as const;

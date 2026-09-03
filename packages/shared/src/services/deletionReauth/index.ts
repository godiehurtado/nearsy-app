export {
  DELETION_REAUTH_PRIORITY,
  FIREBASE_PROVIDER_APPLE,
  FIREBASE_PROVIDER_GOOGLE,
  FIREBASE_PROVIDER_PASSWORD,
  listLinkedProviderIds,
  resolveDeletionReauthMethod,
  type DeletionReauthMethod,
  type FirebaseAuthProviderDataEntry,
} from './deletionReauthMethod';

export {
  AccountDeletionReauthError,
  __resetAccountDeletionReauthInProgressForTests,
  createDefaultReauthenticateForDeletionDependencies,
  reauthenticateForAccountDeletion,
  type AccountDeletionReauthErrorCode,
  type ReauthenticateForDeletionDependencies,
  type ReauthenticateForDeletionInput,
} from './reauthenticateForAccountDeletion';

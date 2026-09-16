/**
 * Pure gate: whether a Firestore user document is complete enough to enter MainTabs.
 *
 * CRJ (new onboarding): the ONLY completion signal is profileSetupCompleted === true.
 * Implicit combinations (realName + mode + profileImage, interests, etc.) must NOT
 * eject the user from ProfileCompletion into MainTabs mid-wizard.
 */
export function isProfileDocumentComplete(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return d.profileSetupCompleted === true;
}

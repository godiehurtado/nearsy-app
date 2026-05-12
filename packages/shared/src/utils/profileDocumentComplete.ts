/**
 * Pure gate: whether a Firestore `users/{uid}` document counts as "profile complete"
 * for navigation / login checks. Same rules everywhere this is imported.
 */
export function isProfileDocumentComplete(data: unknown): boolean {
  if (data == null || typeof data !== 'object') return false;

  const d = data as Record<string, unknown>;

  if (d.profileSetupCompleted === true) return true;

  const realNameOk =
    typeof d.realName === 'string' && d.realName.trim().length > 0;

  const modeOk = d.mode === 'personal' || d.mode === 'professional';

  const profileImageOk =
    typeof d.profileImage === 'string' &&
    d.profileImage.trim().length > 0;

  return realNameOk && modeOk && profileImageOk;
}

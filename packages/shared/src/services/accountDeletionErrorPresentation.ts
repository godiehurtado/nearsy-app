/**
 * Safe user-facing mapping for account deletion failures.
 * Never surfaces raw Firebase permission strings.
 */
export function resolveAccountDeletionErrorMessageKey(err: unknown): string {
  const code =
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'string'
      ? (err as { code: string }).code
      : '';

  const message =
    typeof err === 'object' &&
    err !== null &&
    'message' in err &&
    typeof (err as { message: unknown }).message === 'string'
      ? (err as { message: string }).message
      : '';

  const haystack = `${code} ${message}`.toLowerCase();

  if (
    haystack.includes('permission-denied') ||
    haystack.includes('missing or insufficient permissions')
  ) {
    return 'settings.deleteAccount.permissionError';
  }

  if (haystack.includes('auth/requires-recent-login')) {
    // Caller should intercept this for reauth UI; fallback only.
    return 'settings.deleteAccount.error';
  }

  if (haystack.includes('auth/network-request-failed') || haystack.includes('network')) {
    return 'settings.deleteAccount.networkError';
  }

  return 'settings.deleteAccount.error';
}

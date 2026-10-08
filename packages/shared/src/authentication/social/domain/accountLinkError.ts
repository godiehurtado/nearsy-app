/**
 * Explicit "Connect provider" (account linking) error taxonomy.
 * Separate from SocialAuthError: linking never signs in, never creates users
 * and never resolves conflicts by email.
 */
export type LinkableProvider = 'google' | 'apple' | 'facebook';

export const LINKABLE_PROVIDERS: readonly LinkableProvider[] = ['google', 'apple', 'facebook'];

export const LINKABLE_PROVIDER_IDS: Record<LinkableProvider, string> = {
  google: 'google.com',
  apple: 'apple.com',
  facebook: 'facebook.com',
};

/** Brand names are not translated. */
export const LINKABLE_PROVIDER_DISPLAY_NAMES: Record<LinkableProvider, string> = {
  google: 'Google',
  apple: 'Apple',
  facebook: 'Facebook',
};

export type AccountLinkErrorCode =
  | 'CANCELLED'
  | 'IN_PROGRESS'
  | 'NOT_AUTHENTICATED'
  | 'PROVIDER_UNAVAILABLE'
  | 'TOKEN_MISSING'
  | 'TOKEN_INVALID'
  | 'CREDENTIAL_IN_USE'
  | 'RECENT_LOGIN_REQUIRED'
  | 'NETWORK_ERROR'
  | 'IDENTITY_CHANGED'
  | 'UNKNOWN';

export const ACCOUNT_LINK_ERROR_TITLE_KEY = 'settings.signInMethods.errors.title';
export const ACCOUNT_LINK_RECENT_LOGIN_TITLE_KEY =
  'settings.signInMethods.errors.recentLoginTitle';

const MESSAGE_KEYS: Record<AccountLinkErrorCode, string> = {
  CANCELLED: 'settings.signInMethods.errors.unknown',
  IN_PROGRESS: 'settings.signInMethods.errors.unknown',
  NOT_AUTHENTICATED: 'settings.signInMethods.errors.notAuthenticated',
  PROVIDER_UNAVAILABLE: 'settings.signInMethods.errors.unavailable',
  TOKEN_MISSING: 'settings.signInMethods.errors.verificationFailed',
  TOKEN_INVALID: 'settings.signInMethods.errors.verificationFailed',
  CREDENTIAL_IN_USE: 'settings.signInMethods.errors.credentialInUse',
  RECENT_LOGIN_REQUIRED: 'settings.signInMethods.errors.recentLogin',
  NETWORK_ERROR: 'settings.signInMethods.errors.network',
  IDENTITY_CHANGED: 'settings.signInMethods.errors.identityChanged',
  UNKNOWN: 'settings.signInMethods.errors.unknown',
};

export function messageKeyForAccountLinkCode(code: AccountLinkErrorCode): string {
  return MESSAGE_KEYS[code];
}

export class AccountLinkError extends Error {
  readonly code: AccountLinkErrorCode;
  readonly provider: LinkableProvider;
  readonly messageKey: string;
  /** Stable, non-PII diagnostic (Firebase / SDK error code or internal tag). */
  readonly diagnosticCode: string;

  constructor(code: AccountLinkErrorCode, provider: LinkableProvider, diagnosticCode: string) {
    super(`AccountLinkError:${provider}:${code}`);
    this.name = 'AccountLinkError';
    this.code = code;
    this.provider = provider;
    this.messageKey = MESSAGE_KEYS[code];
    this.diagnosticCode = diagnosticCode;
  }
}

/** Cancellation and double-tap never surface an alert. */
export function shouldSuppressAccountLinkAlert(code: AccountLinkErrorCode): boolean {
  return code === 'CANCELLED' || code === 'IN_PROGRESS';
}

export function resolveAccountLinkAlert(error: AccountLinkError): {
  titleKey: string;
  messageKey: string;
  params: { provider: string };
} {
  return {
    titleKey:
      error.code === 'RECENT_LOGIN_REQUIRED'
        ? ACCOUNT_LINK_RECENT_LOGIN_TITLE_KEY
        : ACCOUNT_LINK_ERROR_TITLE_KEY,
    messageKey: error.messageKey,
    params: { provider: LINKABLE_PROVIDER_DISPLAY_NAMES[error.provider] },
  };
}

export const FIREBASE_PROVIDER_ALREADY_LINKED_CODE = 'auth/provider-already-linked';

export function readFirebaseErrorCode(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null || !('code' in err)) return undefined;
  const code = (err as { code: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * Maps `linkWithCredential` failures. `auth/provider-already-linked` is
 * resolved by the orchestrator (success only when the provider is on this user).
 * Firebase messages are never surfaced — only stable codes are kept.
 */
export function mapFirebaseLinkError(
  provider: LinkableProvider,
  err: unknown,
): AccountLinkError {
  if (err instanceof AccountLinkError) return err;
  const code = readFirebaseErrorCode(err);
  switch (code) {
    case 'auth/credential-already-in-use':
    case 'auth/email-already-in-use':
    case 'auth/account-exists-with-different-credential':
      return new AccountLinkError('CREDENTIAL_IN_USE', provider, code);
    case 'auth/requires-recent-login':
      return new AccountLinkError('RECENT_LOGIN_REQUIRED', provider, code);
    case 'auth/network-request-failed':
      return new AccountLinkError('NETWORK_ERROR', provider, code);
    case 'auth/invalid-credential':
    case 'auth/invalid-id-token':
    case 'auth/missing-or-invalid-nonce':
      return new AccountLinkError('TOKEN_INVALID', provider, code);
    case 'auth/user-token-expired':
    case 'auth/user-disabled':
    case 'auth/user-not-found':
    case 'auth/no-such-user':
      return new AccountLinkError('NOT_AUTHENTICATED', provider, code);
    default:
      return new AccountLinkError('UNKNOWN', provider, code ?? 'FIREBASE_LINK_FAILED');
  }
}

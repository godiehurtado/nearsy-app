/**
 * __DEV__-only, redacted stage trace for Facebook Login diagnostics.
 *
 * Records stage names plus booleans / numbers / short technical codes only.
 * Never accepts tokens, nonces, hashes, emails, names, UIDs or claims: string
 * details are restricted to an allowlisted key set and scrubbed again.
 */

export type FacebookAuthTraceStage =
  | 'attempt_started'
  | 'native_login_started'
  | 'native_login_completed'
  | 'cancelled'
  | 'access_token_present'
  | 'authentication_token_present'
  | 'nonce_present'
  | 'nonce_match'
  | 'token_claims_checked'
  | 'profile_checked'
  | 'native_error'
  | 'firebase_credential_created'
  | 'firebase_sign_in_started'
  | 'firebase_sign_in_success'
  | 'firebase_sign_in_error'
  | 'profile_gate_started'
  | 'profile_gate_success'
  | 'profile_gate_error'
  | 'orchestrator_error'
  | 'ui_error';

export type FacebookAuthTraceDetail = Record<string, boolean | number | string | null | undefined>;

export type FacebookAuthTraceEvent = {
  stage: FacebookAuthTraceStage;
  detail?: Record<string, boolean | number | string>;
};

const STRING_DETAIL_KEYS = new Set([
  'errorCode',
  'errorName',
  'errorDomain',
  'errorMessage',
  'diagnosticCode',
  'socialCode',
  'providerId',
  'signInMethod',
  'platform',
  'route',
  'tokenKind',
  'issuer',
  'step',
  'projectId',
]);

const MAX_STRING = 160;

/** Scrub anything that could carry a secret or PII out of a short string. */
export function redactTraceString(value: string): string {
  return value
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]*)?/g, '<jwt>')
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '<email>')
    // Alphanumeric runs (tokens, nonces, hex hashes); keeps error codes such
    // as auth/account-exists-with-different-credential or FACEBOOK_* readable.
    .replace(/[A-Za-z0-9+=]{20,}/g, '<redacted>')
    .replace(/\d{6,}/g, '<digits>')
    .slice(0, MAX_STRING);
}

export function sanitizeTraceDetail(
  detail: FacebookAuthTraceDetail | undefined,
): Record<string, boolean | number | string> | undefined {
  if (!detail) return undefined;
  const out: Record<string, boolean | number | string> = {};
  for (const [key, value] of Object.entries(detail)) {
    if (typeof value === 'boolean') {
      out[key] = value;
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      out[key] = value;
    } else if (typeof value === 'string' && STRING_DETAIL_KEYS.has(key)) {
      out[key] = redactTraceString(value);
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

type TraceSink = (label: string, payload: unknown) => void;

let enabledOverride: boolean | undefined;
let sinkOverride: TraceSink | undefined;
let attempt = 0;
let events: FacebookAuthTraceEvent[] = [];

function isEnabled(): boolean {
  if (enabledOverride !== undefined) return enabledOverride;
  return typeof __DEV__ !== 'undefined' && __DEV__ === true;
}

export function isFacebookAuthTraceEnabled(): boolean {
  return isEnabled();
}

function decodeBase64Url(segment: string): string {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const atobFn = (globalThis as { atob?: (s: string) => string }).atob;
  if (typeof atobFn === 'function') return atobFn(padded);
  const buffer = (globalThis as { Buffer?: { from: (s: string, e: string) => { toString: (e: string) => string } } }).Buffer;
  if (buffer) return buffer.from(padded, 'base64').toString('binary');
  throw new Error('no_base64_decoder');
}

type LimitedLoginClaims = Record<string, unknown>;

function decodeLimitedLoginClaims(idToken: string | undefined): LimitedLoginClaims | null {
  if (!idToken) return null;
  try {
    const parts = idToken.split('.');
    if (parts.length !== 3) return null;
    const claims = JSON.parse(decodeBase64Url(parts[1]!)) as unknown;
    return typeof claims === 'object' && claims !== null ? (claims as LimitedLoginClaims) : null;
  } catch {
    return null;
  }
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Boolean-only checks of a Limited Login OIDC token. Claims are compared in
 * memory and never returned; only the well-known issuer URL is echoed.
 */
export function inspectLimitedLoginTokenForTrace(
  idToken: string,
  expected: { appId?: string; hashedNonce: string; nowMs?: number },
): FacebookAuthTraceDetail {
  const parts = idToken.split('.');
  if (parts.length !== 3) return { tokenDecodable: false, tokenParts: parts.length };
  const claims = decodeLimitedLoginClaims(idToken);
  if (!claims) return { tokenDecodable: false };
  const issuer = typeof claims.iss === 'string' ? claims.iss : '';
  const knownIssuers = ['https://www.facebook.com', 'https://limited.facebook.com'];
  const now = expected.nowMs ?? Date.now();
  return {
    tokenDecodable: true,
    issuerKnown: knownIssuers.includes(issuer),
    issuer: knownIssuers.includes(issuer) ? issuer : 'unexpected',
    audMatchesAppId: Boolean(expected.appId) && claims.aud === expected.appId,
    notExpired: typeof claims.exp === 'number' && claims.exp * 1000 > now,
    nonceClaimPresent: nonEmptyString(claims.nonce),
    nonceClaimMatchesHash: claims.nonce === expected.hashedNonce,
    subClaimPresent: nonEmptyString(claims.sub),
    nameClaimPresent: nonEmptyString(claims.name),
    givenNameClaimPresent: nonEmptyString(claims.given_name),
    familyNameClaimPresent: nonEmptyString(claims.family_name),
    pictureClaimPresent: nonEmptyString(claims.picture),
    emailClaimKeyPresent: Object.prototype.hasOwnProperty.call(claims, 'email'),
    emailClaimPresent: nonEmptyString(claims.email),
  };
}

export type FacebookProfileForTrace = {
  userID?: string | null;
  name?: string | null;
  imageURL?: string | null;
  email?: string | null;
  refreshDate?: Date | number | null;
  permissions?: readonly string[] | null;
} | null | undefined;

/**
 * Booleans describing the SDK Profile read right after native login, and
 * whether it was built from this attempt's OIDC token (compared in memory).
 */
export function inspectFacebookProfileForTrace(
  profile: FacebookProfileForTrace,
  context: { idToken?: string; loginStartedAtMs: number },
): FacebookAuthTraceDetail {
  const claims = decodeLimitedLoginClaims(context.idToken);
  const refreshMs =
    profile?.refreshDate instanceof Date
      ? profile.refreshDate.getTime()
      : typeof profile?.refreshDate === 'number'
        ? profile.refreshDate
        : NaN;
  const profileEmail = profile?.email;
  const tokenEmail = claims?.email;
  return {
    profilePresent: Boolean(profile),
    profileUserIdPresent: nonEmptyString(profile?.userID),
    profileNamePresent: nonEmptyString(profile?.name),
    profileImagePresent: nonEmptyString(profile?.imageURL),
    profileEmailPresent: nonEmptyString(profileEmail),
    profilePermissionsIncludeEmail: Boolean(profile?.permissions?.includes('email')),
    profileRefreshDatePresent: Number.isFinite(refreshMs),
    // A residual profile would predate this attempt's native login.
    profileRefreshedThisAttempt:
      Number.isFinite(refreshMs) && refreshMs >= context.loginStartedAtMs - 1_000,
    profileUserIdMatchesTokenSub:
      nonEmptyString(profile?.userID) && profile?.userID === claims?.sub,
    profileEmailMatchesTokenEmail:
      nonEmptyString(profileEmail) && nonEmptyString(tokenEmail) && profileEmail === tokenEmail,
  };
}

type UserInfoLike = { providerId?: unknown; email?: unknown };

export type FirebaseCredentialForTrace = {
  user?: {
    email?: unknown;
    emailVerified?: unknown;
    providerData?: readonly UserInfoLike[] | null;
  } | null;
} | null | undefined;

export type AdditionalUserInfoForTrace = {
  isNewUser?: unknown;
  providerId?: unknown;
  profile?: Record<string, unknown> | null;
} | null | undefined;

/** Booleans describing where (if anywhere) Firebase kept the Facebook email. */
export function inspectFirebaseFacebookCredentialForTrace(
  cred: FirebaseCredentialForTrace,
  additional: AdditionalUserInfoForTrace,
): FacebookAuthTraceDetail {
  const providerData = cred?.user?.providerData ?? [];
  const facebook = providerData.find((entry) => entry?.providerId === 'facebook.com');
  const rawProfile = additional?.profile ?? null;
  return {
    userEmailPresent: nonEmptyString(cred?.user?.email),
    userEmailVerified: cred?.user?.emailVerified === true,
    providerDataCount: providerData.length,
    facebookProviderPresent: Boolean(facebook),
    facebookProviderEmailPresent: nonEmptyString(facebook?.email),
    additionalUserInfoAvailable: Boolean(additional),
    additionalUserInfoProviderIsFacebook: additional?.providerId === 'facebook.com',
    additionalProfilePresent: Boolean(rawProfile) && Object.keys(rawProfile ?? {}).length > 0,
    additionalProfileEmailPresent: nonEmptyString(rawProfile?.email),
    additionalProfileNamePresent: nonEmptyString(rawProfile?.name),
    additionalProfilePicturePresent: rawProfile?.picture != null,
    isNewUser: additional?.isNewUser === true,
  };
}

function emit(label: string, payload: unknown): void {
  if (sinkOverride) {
    sinkOverride(label, payload);
    return;
  }
  console.log(label, JSON.stringify(payload));
}

export function beginFacebookAuthTrace(): void {
  if (!isEnabled()) return;
  attempt += 1;
  events = [];
  traceFacebookAuth('attempt_started');
}

export function traceFacebookAuth(
  stage: FacebookAuthTraceStage,
  detail?: FacebookAuthTraceDetail,
): void {
  if (!isEnabled()) return;
  const event: FacebookAuthTraceEvent = { stage };
  const clean = sanitizeTraceDetail(detail);
  if (clean) event.detail = clean;
  events.push(event);
  emit('[facebookAuthTrace]', { attempt, ...event });
}

export function getFacebookAuthTrace(): FacebookAuthTraceEvent[] {
  return events.map((event) => ({ ...event }));
}

/** Last stage + technical code, safe for a __DEV__ alert suffix. */
export function summarizeFacebookAuthTrace(): string | undefined {
  if (!isEnabled() || events.length === 0) return undefined;
  const last = events[events.length - 1]!;
  const code =
    last.detail?.errorCode ?? last.detail?.diagnosticCode ?? last.detail?.socialCode;
  return `[DEV] attempt=${attempt} stage=${last.stage}${code !== undefined ? ` code=${String(code)}` : ''}`;
}

/** Emit the whole attempt as one line (re-emitted later in case the dev socket dropped). */
export function flushFacebookAuthTrace(reason: string): void {
  if (!isEnabled()) return;
  emit('[facebookAuthTrace:summary]', {
    attempt,
    reason: redactTraceString(reason),
    stages: events,
  });
}

/** Error fields safe to trace: code / name / domain and a scrubbed message. */
export function describeErrorForTrace(err: unknown): FacebookAuthTraceDetail {
  if (typeof err !== 'object' || err === null) {
    return { errorName: typeof err };
  }
  const e = err as {
    code?: unknown;
    name?: unknown;
    domain?: unknown;
    message?: unknown;
  };
  return {
    errorCode: typeof e.code === 'string' || typeof e.code === 'number' ? String(e.code) : undefined,
    errorName: typeof e.name === 'string' ? e.name : undefined,
    errorDomain: typeof e.domain === 'string' ? e.domain : undefined,
    errorMessage: typeof e.message === 'string' ? e.message : undefined,
  };
}

export function __setFacebookAuthTraceForTests(options: {
  enabled?: boolean;
  sink?: TraceSink;
}): void {
  enabledOverride = options.enabled;
  sinkOverride = options.sink;
  attempt = 0;
  events = [];
}

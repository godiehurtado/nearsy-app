/**
 * NEARSY-209 — copy auth-provider profile photos into Nearsy Storage.
 *
 * Android Google Sign-In does not expose profileImageSize (iOS-only in
 * @react-native-google-signin/google-signin). We keep the provider URL as-is
 * for preview and, on profile save, download + uploadProfileImage under
 * users/{uid}/. Arbitrary user-entered URLs are never downloaded.
 *
 * Redirect limitation: native downloadAsync follows redirects; we re-check the
 * optional `headers` Location / final URI host when exposed. Source URL must
 * already be allowlisted https. Residual risk if the native stack does not
 * surface the final host after redirects.
 *
 * Download uses expo-file-system/legacy (file:// cache paths compatible with
 * RNFirebase putFile). The newer File.write API is avoided — its URIs were a
 * likely cause of Storage upload failures after a successful Image preview.
 */

import { isLocalProfileImageUri } from './ownProfileEditorState.ts';

/** Successful copies only: `${uid}\0${sourceUrl}` → Storage download URL. */
const copiedByUid = new Map<string, string>();

/** Auth uid bound to the in-memory copy cache (null = signed out). */
let activeUid: string | null = null;

/** Bumped on uid change / logout so in-flight copies from prior sessions discard. */
let copyGeneration = 0;

const AUTH_PROVIDER_HOST_SUFFIXES = [
  'googleusercontent.com',
  'ggpht.com',
  'platform-lookaside.fbsbx.com',
  'fbsbx.com',
  'fbcdn.net',
  'facebook.com',
  // LinkedIn media CDN family (media.licdn.com, media-exp*.licdn.com, dms.licdn.com, …)
  'licdn.com',
  'linkedin.com',
] as const;

export type SocialPhotoCopyStage =
  | 'validate_source'
  | 'download'
  | 'validate_redirect'
  | 'write_temp'
  | 'upload_storage'
  | 'validate_result'
  | 'session_guard';

type CopyDiag = {
  stage: SocialPhotoCopyStage;
  host?: string;
  finalHost?: string;
  httpStatus?: number;
  bytes?: number;
  errorCode?: string;
  /** Sanitized short message — URLs stripped. */
  errMsg?: string;
};

function trimOrEmpty(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.toLowerCase() || undefined;
  } catch {
    return undefined;
  }
}

/** Strip URLs / long tokens from error text before logging. */
function sanitizeErrMsg(err: unknown): string {
  let raw =
    err instanceof Error
      ? `${err.name}: ${err.message}`
      : typeof err === 'string'
        ? err
        : 'unknown';
  raw = raw.replace(/https?:\/\/\S+/gi, '[url]');
  raw = raw.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');
  return raw.slice(0, 180);
}

function logCopyDiag(diag: CopyDiag): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  // Metadata only — never log full URLs, tokens, or PII.
  console.warn('[socialProfilePhotoCopy]', {
    stage: diag.stage,
    host: diag.host,
    finalHost: diag.finalHost,
    httpStatus: diag.httpStatus,
    bytes: diag.bytes,
    errorCode: diag.errorCode,
    errMsg: diag.errMsg,
  });
}

export function getSocialPhotoCopyActiveUidForTests(): string | null {
  return activeUid;
}

export function getSocialPhotoCopyGenerationForTests(): number {
  return copyGeneration;
}

/** Bind cache to the signed-in uid; clears when uid changes. */
export function bindSocialPhotoCopySession(uid: string | null | undefined): void {
  const next = trimOrEmpty(uid) || null;
  if (next === activeUid) return;
  copiedByUid.clear();
  activeUid = next;
  copyGeneration += 1;
}

/** Full clear (sign-out / account deletion). */
export function clearSocialPhotoCopySessionCache(): void {
  copiedByUid.clear();
  activeUid = null;
  copyGeneration += 1;
}

export function isAuthProviderPhotoHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  if (!host) return false;
  return AUTH_PROVIDER_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

/**
 * True only for https URLs on known auth-provider CDNs (Google / Facebook / LinkedIn).
 * Rejects http, non-http(s), and arbitrary hosts — never download user-typed URLs.
 */
export function isAuthProviderPhotoUrl(value: unknown): boolean {
  const url = trimOrEmpty(value);
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    return isAuthProviderPhotoHost(parsed.hostname);
  } catch {
    return false;
  }
}

/** Already a Nearsy-managed object under users/{uid}/ (Firebase Storage download URL). */
export function isNearsyOwnedProfileImageUrl(
  value: unknown,
  uid: string,
): boolean {
  const url = trimOrEmpty(value);
  const id = trimOrEmpty(uid);
  if (!url || !id) return false;
  try {
    const parsed = new URL(url);
    const haystack = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    const decoded = decodeURIComponent(haystack);
    return (
      decoded.includes(`users/${id}/`) ||
      decoded.includes(`users%2F${id}%2F`) ||
      haystack.includes(`users%2F${encodeURIComponent(id)}%2F`)
    );
  } catch {
    return false;
  }
}

export function shouldCopyAuthProviderPhotoToStorage(
  value: unknown,
  uid: string,
): boolean {
  if (!trimOrEmpty(uid)) return false;
  if (isLocalProfileImageUri(typeof value === 'string' ? value : null)) {
    return false;
  }
  if (isNearsyOwnedProfileImageUrl(value, uid)) return false;
  return isAuthProviderPhotoUrl(value);
}

function sessionKey(uid: string, sourceUrl: string): string {
  return `${uid}\0${sourceUrl}`;
}

export type PersistProfileImageResult =
  | {
      ok: true;
      url: string;
      source:
        | 'local_upload'
        | 'social_copy'
        | 'already_owned'
        | 'remote_passthrough'
        | 'session_cache';
    }
  | { ok: false; reason: 'empty' | 'social_import_failed' | 'session_stale' };

export type SocialPhotoCopyDeps = {
  uploadProfileImage: (uid: string, uri: string) => Promise<string>;
  downloadToCache: (remoteUrl: string, uid: string) => Promise<string>;
  cleanupLocalTemp?: (localUri: string) => Promise<void>;
};

async function defaultCleanupLocalTemp(localUri: string): Promise<void> {
  try {
    const LegacyFS = await loadLegacyFileSystem();
    await LegacyFS.deleteAsync(localUri, { idempotent: true });
  } catch {
    // Best-effort temp cleanup.
  }
}

class SocialPhotoCopyError extends Error {
  readonly stage: SocialPhotoCopyStage;
  readonly diag: CopyDiag;

  constructor(stage: SocialPhotoCopyStage, errorCode: string, diag: CopyDiag) {
    super(`social_photo_${stage}:${errorCode}`);
    this.name = 'SocialPhotoCopyError';
    this.stage = stage;
    this.diag = { ...diag, stage, errorCode };
  }
}

function isSocialPhotoCopyError(err: unknown): err is SocialPhotoCopyError {
  return (
    !!err &&
    typeof err === 'object' &&
    (err as { name?: unknown }).name === 'SocialPhotoCopyError' &&
    typeof (err as { stage?: unknown }).stage === 'string' &&
    typeof (err as { diag?: unknown }).diag === 'object'
  );
}

type LegacyFileSystemModule = {
  cacheDirectory: string | null;
  downloadAsync: (
    uri: string,
    fileUri: string,
    options?: { headers?: Record<string, string> },
  ) => Promise<{
    uri: string;
    status: number;
    headers: Record<string, string>;
  }>;
  getInfoAsync: (
    fileUri: string,
  ) => Promise<{ exists: boolean; size?: number; uri?: string }>;
  deleteAsync: (
    fileUri: string,
    options?: { idempotent?: boolean },
  ) => Promise<void>;
};

/**
 * Load expo-file-system legacy via the Android Metro bare specifier
 * `nearsy-expo-fs-legacy` (see apps/nearsy-android/metro.config.js). The package
 * subpath `expo-file-system/legacy` has no exports map on expo-file-system@19,
 * and relative imports from the @nearsy/shared junction break under Metro.
 * Named exports may land on `default` under Hermes interop.
 */
async function loadLegacyFileSystem(): Promise<LegacyFileSystemModule> {
  let mod: Record<string, unknown>;
  try {
    mod = (await import('nearsy-expo-fs-legacy')) as Record<string, unknown>;
  } catch (primary) {
    throw new SocialPhotoCopyError('download', 'legacy_fs_import_failed', {
      stage: 'download',
      errorCode: 'legacy_fs_import_failed',
      errMsg: sanitizeErrMsg(primary),
    });
  }
  const candidate = (
    typeof mod.downloadAsync === 'function'
      ? mod
      : typeof (mod.default as { downloadAsync?: unknown } | undefined)
            ?.downloadAsync === 'function'
        ? (mod.default as Record<string, unknown>)
        : null
  ) as LegacyFileSystemModule | null;

  if (!candidate || typeof candidate.downloadAsync !== 'function') {
    throw new SocialPhotoCopyError('download', 'legacy_fs_unavailable', {
      stage: 'download',
      errorCode: 'legacy_fs_unavailable',
      errMsg: 'downloadAsync missing on nearsy-expo-fs-legacy',
    });
  }
  return candidate;
}

/**
 * Download via legacy FileSystem so the local URI is a real file:// path that
 * RNFirebase putFile can read (new File.write URIs were failing at upload).
 *
 * downloadAsync follows redirects; final CDN host is usually not exposed
 * (result.uri is file://). Source URL must already pass allowlist.
 */
async function defaultDownloadToCache(
  remoteUrl: string,
  uid: string,
): Promise<string> {
  const host = hostOf(remoteUrl);
  try {
    if (!isAuthProviderPhotoUrl(remoteUrl)) {
      throw new SocialPhotoCopyError('validate_source', 'allowlist_reject', {
        stage: 'validate_source',
        host,
      });
    }

    let LegacyFS: LegacyFileSystemModule;
    try {
      LegacyFS = await loadLegacyFileSystem();
    } catch (cause) {
      if (isSocialPhotoCopyError(cause)) throw cause;
      throw new SocialPhotoCopyError('download', 'legacy_fs_import_failed', {
        stage: 'download',
        host,
        errMsg: sanitizeErrMsg(cause),
      });
    }

    const cacheRoot = LegacyFS.cacheDirectory;
    if (!cacheRoot) {
      throw new SocialPhotoCopyError('write_temp', 'no_cache_dir', {
        stage: 'write_temp',
        host,
      });
    }

    const safeUid = uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || 'user';
    const target = `${cacheRoot}nearsy-social-photo-${safeUid}-${Date.now()}.jpg`;

    let result: {
      uri: string;
      status: number;
      headers: Record<string, string>;
    };
    try {
      result = await LegacyFS.downloadAsync(remoteUrl, target, {
        headers: {
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        },
      });
    } catch (cause) {
      const code =
        cause && typeof cause === 'object' && 'code' in cause
          ? String((cause as { code?: unknown }).code ?? 'download_throw')
          : 'download_throw';
      throw new SocialPhotoCopyError('download', code, {
        stage: 'download',
        host,
        errMsg: sanitizeErrMsg(cause),
      });
    }

    const httpStatus = Number(result.status) || 0;
    if (httpStatus < 200 || httpStatus >= 300) {
      throw new SocialPhotoCopyError('download', 'http_not_ok', {
        stage: 'download',
        host,
        httpStatus,
        errMsg: `HTTP ${httpStatus}`,
      });
    }

    // result.uri is typically file:// — final CDN host after redirects is not
    // available from downloadAsync (residual limitation).
    const finalHost =
      hostOf(result.uri.startsWith('http') ? result.uri : '') ??
      hostOf(
        typeof result.headers?.Location === 'string'
          ? result.headers.Location
          : '',
      );

    let bytes = 0;
    try {
      const info = await LegacyFS.getInfoAsync(result.uri);
      if (!info.exists || (typeof info.size === 'number' && info.size <= 0)) {
        throw new SocialPhotoCopyError('write_temp', 'empty_file', {
          stage: 'write_temp',
          host,
          finalHost,
          httpStatus,
          bytes: 0,
        });
      }
      bytes = typeof info.size === 'number' ? info.size : 0;
    } catch (err) {
      if (isSocialPhotoCopyError(err)) throw err;
      throw new SocialPhotoCopyError('write_temp', 'stat_failed', {
        stage: 'write_temp',
        host,
        httpStatus,
        errMsg: sanitizeErrMsg(err),
      });
    }

    return result.uri;
  } catch (cause) {
    if (isSocialPhotoCopyError(cause)) {
      logCopyDiag({ ...cause.diag, errMsg: cause.diag.errMsg ?? sanitizeErrMsg(cause) });
      throw cause;
    }
    const wrapped = new SocialPhotoCopyError('download', 'download_unhandled', {
      stage: 'download',
      host,
      errMsg: sanitizeErrMsg(cause),
    });
    logCopyDiag(wrapped.diag);
    throw wrapped;
  }
}

async function defaultUploadProfileImage(
  uid: string,
  uri: string,
): Promise<string> {
  // Sync require of the storage barrel (already in the main bundle). A dynamic
  // import of storageService.android as an async chunk fails with
  // METRO_SERVER_ERROR. Lazy require keeps unit tests that inject deps from
  // loading Firebase at import time.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { uploadProfileImage } = require('../services/storageService') as {
    uploadProfileImage: (uid: string, uri: string) => Promise<string>;
  };
  return uploadProfileImage(uid, uri);
}

function defaultDeps(): SocialPhotoCopyDeps {
  return {
    uploadProfileImage: defaultUploadProfileImage,
    downloadToCache: defaultDownloadToCache,
    cleanupLocalTemp: defaultCleanupLocalTemp,
  };
}

function isSessionCurrent(uid: string, generation: number): boolean {
  return copyGeneration === generation && activeUid === uid;
}

/**
 * Resolve the URL to persist on the profile document.
 * - Local pick (manual) → always wins; uploadProfileImage; never social-copy path
 * - Auth-provider HTTPS (new) → download + upload under users/{uid}/
 * - Already owned Storage URL → keep (no re-upload)
 * - Other remote HTTPS (legacy) → passthrough (no download)
 * - Failure → ok:false, not cached, temp cleaned; caller allows manual retry
 * - Session/uid change mid-flight → discard (session_stale)
 */
export async function resolvePersistedProfileImageUrl(
  uid: string,
  uri: string | null | undefined,
  deps: SocialPhotoCopyDeps = defaultDeps(),
): Promise<PersistProfileImageResult> {
  const id = trimOrEmpty(uid);
  const value = trimOrEmpty(uri);
  if (!id || !value) {
    return { ok: false, reason: 'empty' };
  }

  if (activeUid !== id) {
    bindSocialPhotoCopySession(id);
  }
  const generation = copyGeneration;
  const host = hostOf(value);

  // Manual / camera / library selection always wins over social import.
  if (isLocalProfileImageUri(value)) {
    try {
      const url = await deps.uploadProfileImage(id, value);
      if (!isSessionCurrent(id, generation)) {
        return { ok: false, reason: 'session_stale' };
      }
      return { ok: true, url, source: 'local_upload' };
    } catch (cause) {
      logCopyDiag({
        stage: 'upload_storage',
        errorCode: 'local_upload_failed',
      });
      return { ok: false, reason: 'social_import_failed' };
    }
  }

  if (isNearsyOwnedProfileImageUrl(value, id)) {
    return { ok: true, url: value, source: 'already_owned' };
  }

  if (!shouldCopyAuthProviderPhotoToStorage(value, id)) {
    return { ok: true, url: value, source: 'remote_passthrough' };
  }

  const cached = copiedByUid.get(sessionKey(id, value));
  if (cached) {
    return { ok: true, url: cached, source: 'session_cache' };
  }

  let localUri: string | null = null;
  try {
    localUri = await deps.downloadToCache(value, id);
    if (!isSessionCurrent(id, generation)) {
      logCopyDiag({
        stage: 'session_guard',
        host,
        errorCode: 'stale_after_download',
      });
      return { ok: false, reason: 'session_stale' };
    }

    let url: string;
    try {
      url = await deps.uploadProfileImage(id, localUri);
    } catch (cause) {
      const code =
        cause && typeof cause === 'object' && 'code' in cause
          ? String((cause as { code?: unknown }).code ?? 'upload_throw')
          : 'upload_throw';
      const errMsg = sanitizeErrMsg(cause);
      logCopyDiag({
        stage: 'upload_storage',
        host,
        errorCode: code,
        errMsg,
      });
      throw new SocialPhotoCopyError('upload_storage', code, {
        stage: 'upload_storage',
        host,
        errMsg,
      });
    }

    if (!url || isLocalProfileImageUri(url)) {
      logCopyDiag({
        stage: 'validate_result',
        host,
        errorCode: 'invalid_storage_url',
      });
      return { ok: false, reason: 'social_import_failed' };
    }
    if (!isSessionCurrent(id, generation)) {
      return { ok: false, reason: 'session_stale' };
    }
    copiedByUid.set(sessionKey(id, value), url);
    return { ok: true, url, source: 'social_copy' };
  } catch (cause) {
    if (isSocialPhotoCopyError(cause)) {
      logCopyDiag({
        ...cause.diag,
        errMsg: cause.diag.errMsg ?? sanitizeErrMsg(cause),
      });
    } else {
      logCopyDiag({
        stage: 'download',
        host,
        errorCode: 'unhandled',
        errMsg: sanitizeErrMsg(cause),
      });
    }
    return { ok: false, reason: 'social_import_failed' };
  } finally {
    if (localUri && deps.cleanupLocalTemp) {
      await deps.cleanupLocalTemp(localUri).catch(() => undefined);
    }
  }
}

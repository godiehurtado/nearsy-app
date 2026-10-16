/**
 * Import auth-provider profile photos into Nearsy-managed Storage.
 *
 * Only Google / Facebook / LinkedIn HTTPS avatar hosts are eligible for
 * download+upload. Arbitrary user-entered URLs are never fetched.
 * Local URIs and existing Nearsy Storage URLs are handled separately.
 *
 * Redirect limitation: downloads use `fetch` / XHR which follow redirects.
 * When the runtime exposes `response.url` after redirects, the final host is
 * re-checked against the allowlist. If the runtime does not expose the final
 * URL, a redirect to a non-allowlisted host cannot be blocked with the current
 * networking APIs — do not claim full redirect containment.
 *
 * `uploadProfileImage` is loaded lazily so unit tests can inject a stub
 * without pulling React Native / Firebase into the test process.
 */
import { isLocalProfileImageUri } from './ownProfileEditorState';

export type SocialPhotoImportUpload = (
  uid: string,
  uri: string,
) => Promise<string>;

export type ResolveProfileImageForPersistenceResult =
  | { ok: true; url: string; imported: boolean }
  | {
      ok: false;
      reason: 'empty' | 'import_failed' | 'invalid';
    };

const SOCIAL_PHOTO_HOST_SUFFIXES = [
  'googleusercontent.com',
  'ggpht.com',
  'fbcdn.net',
  'facebook.com',
  'fbsbx.com',
  'licdn.com',
  'linkedin.com',
] as const;

/** Session cache: avoid repeat Storage uploads for the same uid+remote URL. */
const importCache = new Map<string, Promise<string>>();

function cacheKey(uid: string, remoteUrl: string): string {
  return `${uid}::${remoteUrl}`;
}

function hostMatchesSuffix(hostname: string, suffix: string): boolean {
  const host = hostname.toLowerCase();
  const needle = suffix.toLowerCase();
  return host === needle || host.endsWith(`.${needle}`);
}

/**
 * True when the URL is an https avatar we may fetch from an auth provider.
 * HTTP is rejected. Does not accept Firebase Storage or arbitrary hosts.
 */
export function isEligibleSocialProviderPhotoUrl(
  value: unknown,
): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') {
      return false;
    }
    return SOCIAL_PHOTO_HOST_SUFFIXES.some((suffix) =>
      hostMatchesSuffix(parsed.hostname, suffix),
    );
  } catch {
    return false;
  }
}

/** True when the URL already points at a Nearsy Storage object for this uid. */
export function isNearsyManagedProfileImageUrl(
  uid: string,
  value: unknown,
): value is string {
  if (typeof value !== 'string' || !uid?.trim()) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    if (!/firebasestorage\.googleapis\.com$/i.test(parsed.hostname)) {
      return false;
    }
    const encodedPrefix = encodeURIComponent(`users/${uid}/`);
    return (
      parsed.pathname.includes(`/o/${encodedPrefix}`) ||
      parsed.pathname.includes(`/o/users%2F${encodeURIComponent(uid)}%2F`) ||
      decodeURIComponent(parsed.pathname).includes(`/users/${uid}/`)
    );
  } catch {
    return false;
  }
}

/**
 * Download an eligible social HTTPS URL and return a blob ready for Storage.
 * Re-validates `response.url` when the runtime exposes it after redirects.
 */
async function fetchEligibleSocialPhotoBlob(
  remoteUrl: string,
): Promise<Blob> {
  if (!isEligibleSocialProviderPhotoUrl(remoteUrl)) {
    throw new Error('Social photo URL is not eligible.');
  }

  const response = await fetch(remoteUrl, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`Social photo fetch failed (${response.status}).`);
  }

  const finalUrl =
    typeof response.url === 'string' && response.url.trim()
      ? response.url.trim()
      : remoteUrl;
  if (!isEligibleSocialProviderPhotoUrl(finalUrl)) {
    throw new Error('Social photo redirect left the allowlist.');
  }

  return await response.blob();
}

async function importEligibleSocialPhoto(
  uid: string,
  remoteUrl: string,
  upload: SocialPhotoImportUpload,
): Promise<string> {
  // Prefer fetch so we can re-check the final URL when exposed; then fall back
  // to the existing URI upload pipeline (XHR) which also follows redirects.
  try {
    const blob = await fetchEligibleSocialPhotoBlob(remoteUrl);
    const { uploadProfileImageBlob } = await import('../services/storageService');
    return await uploadProfileImageBlob(uid, blob, {
      contentType: blob.type || 'image/jpeg',
      extension: 'jpg',
    });
  } catch (fetchError) {
    // If allowlist escape was detected, do not fall back to XHR.
    if (
      fetchError instanceof Error &&
      /allowlist|not eligible/i.test(fetchError.message)
    ) {
      throw fetchError;
    }
    // Fetch unavailable / CDN quirk: fall back to URI upload (redirect
    // final-host check may be unavailable — see module doc).
    return await upload(uid, remoteUrl);
  }
}

/**
 * Resolve the URL to persist for a profile photo during CRJ / Own Profile save.
 * - Local URI → upload via uploadProfileImage
 * - Eligible social HTTPS → download+upload once (session-cached)
 * - Already Nearsy Storage for this uid → keep
 * - Other existing HTTPS (user-owned remote already on the profile) → keep as-is
 *   without downloading
 */
export async function resolveProfileImageForPersistence(
  uid: string,
  uri: string | null | undefined,
  options?: { upload?: SocialPhotoImportUpload },
): Promise<ResolveProfileImageForPersistenceResult> {
  if (typeof uri !== 'string' || !uri.trim()) {
    return { ok: false, reason: 'empty' };
  }
  const trimmed = uri.trim();
  if (!uid?.trim()) {
    return { ok: false, reason: 'invalid' };
  }

  const upload: SocialPhotoImportUpload =
    options?.upload ??
    (async (uploadUid, uploadUri) => {
      const { uploadProfileImage } = await import('../services/storageService');
      return uploadProfileImage(uploadUid, uploadUri);
    });

  if (isLocalProfileImageUri(trimmed)) {
    try {
      const url = await upload(uid, trimmed);
      if (!url?.trim() || isLocalProfileImageUri(url)) {
        return { ok: false, reason: 'import_failed' };
      }
      return { ok: true, url, imported: false };
    } catch {
      return { ok: false, reason: 'import_failed' };
    }
  }

  if (isNearsyManagedProfileImageUrl(uid, trimmed)) {
    return { ok: true, url: trimmed, imported: false };
  }

  if (isEligibleSocialProviderPhotoUrl(trimmed)) {
    const key = cacheKey(uid, trimmed);
    let pending = importCache.get(key);
    if (!pending) {
      pending = (async () => {
        if (options?.upload) {
          // Tests / explicit inject: call upload directly with the remote URL.
          return await upload(uid, trimmed);
        }
        return await importEligibleSocialPhoto(uid, trimmed, upload);
      })();
      importCache.set(key, pending);
      pending.catch(() => {
        importCache.delete(key);
      });
    }
    try {
      const url = await pending;
      if (
        !url?.trim() ||
        isLocalProfileImageUri(url) ||
        !isNearsyManagedProfileImageUrl(uid, url)
      ) {
        importCache.delete(key);
        return { ok: false, reason: 'import_failed' };
      }
      return { ok: true, url, imported: true };
    } catch {
      importCache.delete(key);
      return { ok: false, reason: 'import_failed' };
    }
  }

  // Already-persisted non-social remote (or unknown https). Keep the reference;
  // never fetch arbitrary hosts.
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:') {
      return { ok: true, url: trimmed, imported: false };
    }
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  return { ok: false, reason: 'invalid' };
}

/** Clears the entire session import cache (logout / account switch). */
export function clearSocialProfilePhotoImportCache(): void {
  importCache.clear();
}

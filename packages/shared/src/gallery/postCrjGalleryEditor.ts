import type { GalleryPhoto } from '../types/profile';
import type { ProfileMode } from '../profile/profileModeFields';
import {
  galleryPhotoIdentity,
  isRemoteGalleryUrl,
} from './onboardingGalleryPersistence';

export {
  parsePostCrjInterestEditorParams as parsePostCrjGalleryEditorParams,
  type PostCrjInterestEditorParams as PostCrjGalleryEditorParams,
  type ParsedPostCrjInterestEditorParams as ParsedPostCrjGalleryEditorParams,
} from '../interests/postCrjInterestEditor';

export function postCrjGalleryBagKey(
  mode: ProfileMode,
): 'personalGallery' | 'professionalGallery' {
  return mode === 'professional' ? 'professionalGallery' : 'personalGallery';
}

export function isPersistableGalleryPhoto(
  row: unknown,
): row is GalleryPhoto {
  if (!row || typeof row !== 'object') return false;
  const photo = row as Record<string, unknown>;
  const url = typeof photo.url === 'string' ? photo.url : '';
  const path = typeof photo.path === 'string' ? photo.path : '';
  if (!isRemoteGalleryUrl(url)) return false;
  if (!path || path.startsWith('local-')) return false;
  if (/^(file|content|ph|assets-library):/i.test(path)) return false;
  return typeof photo.createdAt === 'number';
}

export function sanitizeGalleryPhotosForPersistence(
  photos: GalleryPhoto[],
): GalleryPhoto[] {
  const out: GalleryPhoto[] = [];
  for (const row of photos) {
    if (!isPersistableGalleryPhoto(row)) continue;
    out.push({
      url: row.url,
      path: row.path,
      createdAt: row.createdAt,
    });
  }
  return out;
}

/**
 * Read post-CRJ gallery for one face. Invalid/local rows are omitted without
 * rewriting the document during load.
 */
export function readPostCrjGalleryFromDoc(
  data: Record<string, unknown> | null | undefined,
  mode: ProfileMode,
): GalleryPhoto[] {
  const raw = data?.[postCrjGalleryBagKey(mode)];
  if (!Array.isArray(raw)) return [];
  const out: GalleryPhoto[] = [];
  for (const row of raw) {
    if (!isPersistableGalleryPhoto(row)) continue;
    out.push({
      url: row.url,
      path: row.path,
      createdAt: row.createdAt,
    });
  }
  return out;
}

export function countPersistableGalleryPhotos(photos: GalleryPhoto[]): number {
  return sanitizeGalleryPhotosForPersistence(photos).length;
}

/** Newest photo first — local prepend only; no global sort/migration. */
export function prependGalleryPhoto(
  photos: GalleryPhoto[],
  photo: GalleryPhoto,
): GalleryPhoto[] {
  return [photo, ...photos];
}

export function removeGalleryPhoto(
  photos: GalleryPhoto[],
  target: GalleryPhoto,
): GalleryPhoto[] {
  const key = galleryPhotoIdentity(target);
  return photos.filter((photo) => galleryPhotoIdentity(photo) !== key);
}

export type PostCrjGalleryPersistencePatch = {
  personalGallery?: GalleryPhoto[];
  professionalGallery?: GalleryPhoto[];
};

export function buildPostCrjGalleryPersistencePatch(
  mode: ProfileMode,
  photos: GalleryPhoto[],
): PostCrjGalleryPersistencePatch {
  const sanitized = sanitizeGalleryPhotosForPersistence(photos);
  if (mode === 'personal') {
    return { personalGallery: sanitized };
  }
  return { professionalGallery: sanitized };
}

export function extractOwnProfileGallerySummaryCounts(
  data: Record<string, unknown> | null | undefined,
): { personal: number; professional: number } {
  return {
    personal: readPostCrjGalleryFromDoc(data, 'personal').length,
    professional: readPostCrjGalleryFromDoc(data, 'professional').length,
  };
}

export type GalleryOperationLock = {
  tryAcquire: () => boolean;
  release: () => void;
  isHeld: () => boolean;
};

/** Synchronous single-operation gate for add/delete/upload flows. */
export function createGalleryOperationLock(): GalleryOperationLock {
  let held = false;
  return {
    tryAcquire() {
      if (held) return false;
      held = true;
      return true;
    },
    release() {
      held = false;
    },
    isHeld() {
      return held;
    },
  };
}

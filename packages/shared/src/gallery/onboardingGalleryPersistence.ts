import type { GalleryPhoto } from '../types/profile.ts';

/**
 * CRJ UX proposal only — not a production GalleryScreen / backend cap.
 * Authenticated gallery remains uncapped.
 */
export const CRJ_GALLERY_UX_CAP = 6;

/** After Gallery — Location for I8. */
export const POST_GALLERY_CRJ_STEP = 'location' as const;

export type CrjGalleryItemStatus = 'ready' | 'uploading' | 'failed';

export type CrjGalleryItem = {
  id: string;
  url: string;
  path: string;
  createdAt: number;
  status: CrjGalleryItemStatus;
  fromSession: boolean;
};

export type CrjGalleryPersistencePatch = {
  personalGallery?: GalleryPhoto[];
  professionalGallery?: GalleryPhoto[];
  profileSetupCompleted: false;
};

export function isRemoteGalleryUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  if (/^(file|content|ph|assets-library|data):/i.test(url)) return false;
  return /^https:\/\//i.test(url);
}

export function galleryPhotoIdentity(photo: {
  path?: string;
  url: string;
}): string {
  return photo.path || photo.url;
}

export function toPersistedGalleryPhotos(
  items: CrjGalleryItem[],
): GalleryPhoto[] {
  const out: GalleryPhoto[] = [];
  for (const item of items) {
    if (item.status !== 'ready') continue;
    if (!isRemoteGalleryUrl(item.url)) continue;
    if (!item.path || item.path.startsWith('local-')) continue;
    out.push({
      url: item.url,
      path: item.path,
      createdAt: item.createdAt,
    });
  }
  return out;
}

export function readCrjGallery(
  data: Record<string, unknown> | null | undefined,
  mode: 'personal' | 'professional',
): CrjGalleryItem[] {
  const key = mode === 'professional' ? 'professionalGallery' : 'personalGallery';
  const raw = data?.[key];
  if (!Array.isArray(raw)) return [];
  const out: CrjGalleryItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const photo = row as Record<string, unknown>;
    const url = typeof photo.url === 'string' ? photo.url : '';
    const path = typeof photo.path === 'string' ? photo.path : '';
    if (!isRemoteGalleryUrl(url)) continue;
    const createdAt =
      typeof photo.createdAt === 'number' ? photo.createdAt : Date.now();
    const id = path || url;
    out.push({
      id,
      url,
      path: path || url,
      createdAt,
      status: 'ready',
      fromSession: false,
    });
  }
  return out;
}

export function galleriesEqual(
  a: GalleryPhoto[],
  b: GalleryPhoto[],
): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (photo, index) =>
      galleryPhotoIdentity(photo) === galleryPhotoIdentity(b[index]!),
  );
}

export function shouldPersistCrjGallery(
  original: CrjGalleryItem[],
  current: CrjGalleryItem[],
): boolean {
  return !galleriesEqual(
    toPersistedGalleryPhotos(original),
    toPersistedGalleryPhotos(current),
  );
}

/**
 * Session-uploaded Storage objects that would be abandoned on Skip
 * (not part of the originally persisted gallery).
 */
export function abandonedSessionUploadPaths(
  original: CrjGalleryItem[],
  current: CrjGalleryItem[],
): string[] {
  const originalIds = new Set(original.map((item) => item.id));
  const paths: string[] = [];
  for (const item of current) {
    if (!item.fromSession) continue;
    if (originalIds.has(item.id)) continue;
    if (
      item.path &&
      !item.path.startsWith('local-') &&
      isRemoteGalleryUrl(item.url)
    ) {
      paths.push(item.path);
    }
  }
  return paths;
}

export function removedPersistedGalleryPaths(
  original: CrjGalleryItem[],
  current: CrjGalleryItem[],
): string[] {
  const kept = new Set(
    toPersistedGalleryPhotos(current).map(galleryPhotoIdentity),
  );
  const paths: string[] = [];
  for (const item of original) {
    if (!item.fromSession && !kept.has(galleryPhotoIdentity(item)) && item.path) {
      paths.push(item.path);
    }
  }
  return paths;
}

export function buildCrjGalleryPersistencePatch(
  mode: 'personal' | 'professional',
  items: CrjGalleryItem[],
): CrjGalleryPersistencePatch {
  const photos = toPersistedGalleryPhotos(items);
  if (mode === 'personal') {
    return {
      profileSetupCompleted: false,
      personalGallery: photos,
    };
  }
  return {
    profileSetupCompleted: false,
    professionalGallery: photos,
  };
}

export function hasUploadingGalleryItems(items: CrjGalleryItem[]): boolean {
  return items.some((item) => item.status === 'uploading');
}

export function payloadContainsUndefined(value: unknown): boolean {
  if (value === undefined) return true;
  if (Array.isArray(value)) return value.some(payloadContainsUndefined);
  if (value && typeof value === 'object') {
    return Object.values(value).some(payloadContainsUndefined);
  }
  return false;
}

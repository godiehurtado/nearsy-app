// Android profile extras backed by RNFirebase Firestore.
import { Platform } from 'react-native';
import { firestoreDb } from '../config/firebaseConfig.android';

import type { SocialLinks, GalleryPhoto } from '../types/profile';
import type { UserProfile } from './firestoreService.android';

export type ProfileMode = 'personal' | 'professional';

const fieldFor = (mode: ProfileMode, base: 'socialLinks' | 'gallery') => {
  if (base === 'socialLinks') {
    return mode === 'personal'
      ? 'socialLinksPersonal'
      : 'socialLinksProfessional';
  }

  return mode === 'personal' ? 'personalGallery' : 'professionalGallery';
};

function logFirestoreSource(functionName: string, op: string) {
  console.warn('[FirestoreSource]', {
    service: 'profileExtras.android',
    function: functionName,
    platform: Platform.OS,
    op,
  });
}

const userDocRef = (uid: string, functionName: string) => {
  logFirestoreSource(functionName, 'collection/doc');
  return (firestoreDb as any).collection('users').doc(uid);
};

function snapshotExists(snap: any) {
  const exists = snap?.exists;
  return typeof exists === 'function' ? exists.call(snap) : !!exists;
}

export async function getSocialLinks(
  uid: string,
  mode: ProfileMode,
): Promise<SocialLinks> {
  logFirestoreSource('getSocialLinks', 'get');
  const snap = await userDocRef(uid, 'getSocialLinks').get();
  if (!snapshotExists(snap)) return {};

  const data = snap.data() as UserProfile | undefined;
  const key = fieldFor(mode, 'socialLinks') as keyof UserProfile;

  return ((data?.[key] as SocialLinks) ?? {}) as SocialLinks;
}

export async function setSocialLinks(
  uid: string,
  mode: ProfileMode,
  links: SocialLinks,
): Promise<void> {
  const key = fieldFor(mode, 'socialLinks');

  logFirestoreSource('setSocialLinks', 'set');
  await userDocRef(uid, 'setSocialLinks').set(
    {
      [key]: links,
      updatedAt: Date.now(),
    },
    { merge: true },
  );
}

export async function getGallery(
  uid: string,
  mode: ProfileMode,
): Promise<GalleryPhoto[]> {
  logFirestoreSource('getGallery', 'get');
  const snap = await userDocRef(uid, 'getGallery').get();
  if (!snapshotExists(snap)) return [];

  const data = snap.data() as UserProfile | undefined;
  const key = fieldFor(mode, 'gallery') as keyof UserProfile;

  return ((data?.[key] as GalleryPhoto[]) ?? []) as GalleryPhoto[];
}

export async function setGallery(
  uid: string,
  mode: ProfileMode,
  photos: GalleryPhoto[],
): Promise<void> {
  const key = fieldFor(mode, 'gallery');

  logFirestoreSource('setGallery', 'set');
  await userDocRef(uid, 'setGallery').set(
    {
      [key]: photos,
      updatedAt: Date.now(),
    },
    { merge: true },
  );
}

export async function addPhotoToGallery(
  uid: string,
  mode: ProfileMode,
  photo: GalleryPhoto,
): Promise<GalleryPhoto[]> {
  const current = await getGallery(uid, mode);
  const next = [photo, ...current];
  await setGallery(uid, mode, next);
  return next;
}

export async function removePhotoFromGallery(
  uid: string,
  mode: ProfileMode,
  photo: GalleryPhoto,
): Promise<GalleryPhoto[]> {
  const current = await getGallery(uid, mode);
  const keyOf = (p: GalleryPhoto) => p.path || p.url;
  const next = current.filter((p) => keyOf(p) !== keyOf(photo));
  await setGallery(uid, mode, next);
  return next;
}

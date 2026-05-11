// src/services/profileExtras.ts  ✅ Web Firestore + RNFirebase Auth
import { firestoreDb } from '../config/firebaseConfig';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

import type { SocialLinks, GalleryPhoto } from '../types/profile';
import type { UserProfile } from './firestoreService';

export type ProfileMode = 'personal' | 'professional';

/* --------------------------------- utils --------------------------------- */
const fieldFor = (mode: ProfileMode, base: 'socialLinks' | 'gallery') => {
  if (base === 'socialLinks') {
    return mode === 'personal'
      ? 'socialLinksPersonal'
      : 'socialLinksProfessional';
  }
  // base === 'gallery'
  return mode === 'personal' ? 'personalGallery' : 'professionalGallery';
};

const userDocRef = (uid: string) => doc(firestoreDb, 'users', uid);

/* ----------------------------- SOCIAL (por modo) ----------------------------- */
export async function getSocialLinks(
  uid: string,
  mode: ProfileMode,
): Promise<SocialLinks> {
  const snap = await getDoc(userDocRef(uid));
  if (!snap.exists()) return {};

  const data = snap.data() as UserProfile | undefined;
  const key = fieldFor(mode, 'socialLinks') as keyof UserProfile;

  return ((data?.[key] as SocialLinks) ?? {}) as SocialLinks;
}

export async function setSocialLinks(
  uid: string,
  mode: ProfileMode,
  links: SocialLinks,
): Promise<void> {
  const ref = userDocRef(uid);
  const key = fieldFor(mode, 'socialLinks');

  await setDoc(
    ref,
    {
      [key]: links,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/* ----------------------------- GALLERY (por modo) ---------------------------- */
export async function getGallery(
  uid: string,
  mode: ProfileMode,
): Promise<GalleryPhoto[]> {
  const snap = await getDoc(userDocRef(uid));
  if (!snap.exists()) return [];

  const data = snap.data() as UserProfile | undefined;
  const key = fieldFor(mode, 'gallery') as keyof UserProfile;

  return ((data?.[key] as GalleryPhoto[]) ?? []) as GalleryPhoto[];
}

export async function setGallery(
  uid: string,
  mode: ProfileMode,
  photos: GalleryPhoto[],
): Promise<void> {
  const ref = userDocRef(uid);
  const key = fieldFor(mode, 'gallery');

  await setDoc(
    ref,
    {
      [key]: photos,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/** Agrega una foto al inicio de la galería del modo indicado */
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

/** Elimina una foto por url o path (el que coincida) */
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

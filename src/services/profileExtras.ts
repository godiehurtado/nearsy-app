// src/services/profileExtras.ts
import { firestore } from '../config/firebaseConfig';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import type { SocialLinks, GalleryPhoto } from '../types/profile';
import type { UserProfile } from './firestoreService';

export type ProfileMode = 'personal' | 'professional';

/* --------------------------------- utils --------------------------------- */
const fieldFor = (mode: ProfileMode, base: 'socialLinks' | 'photos') => {
  if (base === 'socialLinks') {
    return mode === 'personal'
      ? 'socialLinksPersonal'
      : 'socialLinksProfessional';
  }
  // base === 'photos'
  return mode === 'personal' ? 'photosPersonal' : 'photosProfessional';
};

/* ----------------------------- SOCIAL (por modo) ----------------------------- */
export async function getSocialLinks(
  uid: string,
  mode: ProfileMode,
): Promise<SocialLinks> {
  const snap = await getDoc(doc(firestore, 'users', uid));
  if (!snap.exists()) return {};
  const data = snap.data() as UserProfile;
  const key = fieldFor(mode, 'socialLinks') as keyof UserProfile;
  return (data[key] as SocialLinks) ?? {};
}

export async function setSocialLinks(
  uid: string,
  mode: ProfileMode,
  links: SocialLinks,
): Promise<void> {
  const ref = doc(firestore, 'users', uid);
  const key = fieldFor(mode, 'socialLinks');
  await setDoc(
    ref,
    { [key]: links, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

/* ----------------------------- GALLERY (por modo) ---------------------------- */
export async function getGallery(
  uid: string,
  mode: ProfileMode,
): Promise<GalleryPhoto[]> {
  const snap = await getDoc(doc(firestore, 'users', uid));
  if (!snap.exists()) return [];
  const data = snap.data() as UserProfile;
  const key = fieldFor(mode, 'photos') as keyof UserProfile;
  return (data[key] as GalleryPhoto[]) ?? [];
}

export async function setGallery(
  uid: string,
  mode: ProfileMode,
  photos: GalleryPhoto[],
): Promise<void> {
  const ref = doc(firestore, 'users', uid);
  const key = fieldFor(mode, 'photos');
  await setDoc(
    ref,
    { [key]: photos, updatedAt: serverTimestamp() },
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
  const key = (p: GalleryPhoto) => p.path || p.url;
  const next = current.filter((p) => key(p) !== key(photo));
  await setGallery(uid, mode, next);
  return next;
}

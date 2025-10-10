// src/services/firestoreService.ts
import { firestore } from '../config/firebaseConfig';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import {
  InterestAffiliations,
  SocialLinks,
  GalleryPhoto,
} from '../types/profile';

export type UserProfile = {
  bio?: string;
  company?: string;
  email?: string;
  phone?: string | null;
  realName: string;

  // ubicación (como la usas en MainHomeScreen)
  location?: { lat: number; lng: number; updatedAt: number } | null;

  mode?: 'personal' | 'professional';
  occupation?: string;

  // ===== Interests por modo =====
  personalInterestAffiliations?: InterestAffiliations;
  personalInterests?: string[];
  professionalInterestAffiliations?: InterestAffiliations;
  professionalInterests?: string[];

  // ===== Social links por modo =====
  socialLinksPersonal?: SocialLinks;
  socialLinksProfessional?: SocialLinks;

  // ===== Galería por modo =====
  photosPersonal?: GalleryPhoto[];
  photosProfessional?: GalleryPhoto[];

  // ===== Media/top bar =====
  profileImage?: string | null;
  topBarColor?: string;
  topBarImage?: string | null; // URL de la imagen (o null si usa color)
  topBarMode?: 'color' | 'image';

  // visibilidad
  visibility?: boolean;

  // (opcional) Campos antiguos mientras migras las screens. Puedes quitarlos cuando
  // ya no se referencien en el código.
  /** @deprecated usar socialLinksPersonal / socialLinksProfessional */
  socialLinks?: SocialLinks;
  /** @deprecated usar photosPersonal / photosProfessional */
  photos?: GalleryPhoto[];
};

/** Crea un perfil base en Firestore (si no existe) */
export const createUserProfile = async (
  uid: string,
  data: { email: string; phone?: string; birthYear: number },
) => {
  try {
    await setDoc(
      doc(firestore, 'users', uid),
      {
        email: data.email,
        phone: data.phone ?? null,
        birthYear: data.birthYear,

        // timestamps
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),

        // defaults
        visibility: false,
        mode: 'personal',

        // perfil
        bio: '',
        realName: '',
        occupation: '',
        company: '',
        profileImage: null,

        // top bar
        topBarColor: '#3B5A85',
        topBarImage: null,
        topBarMode: 'color',

        // interests por modo
        personalInterests: [],
        personalInterestAffiliations: {},
        professionalInterests: [],
        professionalInterestAffiliations: {},

        // social por modo
        socialLinksPersonal: {},
        socialLinksProfessional: {},

        // galería por modo
        photosPersonal: [],
        photosProfessional: [],

        // ubicación aún no seteada
        location: null,
      },
      { merge: true },
    );
  } catch (error) {
    console.error('❌ Error en createUserProfile:', error);
    throw error;
  }
};

async function upsertUserProfile(uid: string, patch: Record<string, any>) {
  try {
    const ref = doc(firestore, 'users', uid);
    await setDoc(
      ref,
      {
        ...patch,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    console.log('✅ User profile upserted in Firestore');
  } catch (error) {
    console.error('❌ Error updating user profile:', error);
    throw error;
  }
}

/** Guarda/actualiza el perfil completo (crea si no existe) */
export async function saveCompleteProfile(
  uid: string,
  data: Partial<UserProfile>,
) {
  return upsertUserProfile(uid, data);
}

/** Actualiza solo las props enviadas en `patch` */
export async function updateUserProfilePartial(
  uid: string,
  patch: Record<string, any>,
) {
  return upsertUserProfile(uid, patch);
}

export const isProfileComplete = async (uid: string): Promise<boolean> => {
  const userDoc = await getDoc(doc(firestore, 'users', uid));
  if (!userDoc.exists()) return false;
  const data = userDoc.data() as UserProfile;
  return !!data.realName && data.realName.trim().length > 0;
};

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const ref = doc(firestore, 'users', uid);
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data() as UserProfile) : null;
}

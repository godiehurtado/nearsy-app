// src/services/firestoreService.ts  ✅ RNFirebase-only
import firestore from '@react-native-firebase/firestore';
import { firestoreDb } from '../config/firebaseConfig';
import {
  InterestAffiliations,
  SocialLinks,
  GalleryPhoto,
  AffiliationItem,
} from '../types/profile';

export type UserProfile = {
  bio?: string;
  company?: string;
  email?: string;
  phone?: string | null;
  realName: string;

  status?: string;
  location?: { lat: number; lng: number; updatedAt: number } | null;

  mode?: 'personal' | 'professional';
  occupation?: string;

  personalInterestAffiliations?: InterestAffiliations;
  personalInterests?: string[];
  professionalInterestAffiliations?: InterestAffiliations;
  professionalInterests?: string[];

  socialLinksPersonal?: SocialLinks;
  socialLinksProfessional?: SocialLinks;

  personalGallery?: GalleryPhoto[];
  professionalGallery?: GalleryPhoto[];

  personalAffiliations?: AffiliationItem[];
  professionalAffiliations?: AffiliationItem[];

  profileImage?: string | null;
  topBarColor?: string;
  topBarImage?: string | null;
  topBarMode?: 'color' | 'image';

  visibility?: boolean;

  /** @deprecated */
  socialLinks?: SocialLinks;
  /** @deprecated */
  photos?: GalleryPhoto[];
};

/** Crea un perfil base en Firestore (si no existe) */
export const createUserProfile = async (
  uid: string,
  data: { email: string; phone?: string; birthYear: number },
) => {
  try {
    const ref = firestoreDb.collection('users').doc(uid);

    await ref.set(
      {
        email: data.email,
        phone: data.phone ?? null,
        birthYear: data.birthYear,

        createdAt: firestore.FieldValue.serverTimestamp(),
        updatedAt: firestore.FieldValue.serverTimestamp(),

        visibility: false,
        mode: 'personal',

        bio: '',
        status: '',
        realName: '',
        occupation: '',
        company: '',
        profileImage: null,

        topBarColor: '#3B5A85',
        topBarImage: null,
        topBarMode: 'color',

        personalInterests: [],
        personalInterestAffiliations: {},
        professionalInterests: [],
        professionalInterestAffiliations: {},

        socialLinksPersonal: {},
        socialLinksProfessional: {},

        personalGallery: [],
        professionalGallery: [],

        personalAffiliations: [],
        professionalAffiliations: [],

        location: null,
      },
      { merge: true },
    );
  } catch (error) {
    if (__DEV__) {
      console.error('[Firestore] Error in createUserProfile:', error);
    }
    throw error;
  }
};

export async function updateUserAffiliations(
  uid: string,
  fieldName: 'personalAffiliations' | 'professionalAffiliations',
  items: AffiliationItem[],
) {
  return upsertUserProfile(uid, { [fieldName]: items });
}

async function upsertUserProfile(uid: string, patch: Record<string, any>) {
  try {
    const ref = firestoreDb.collection('users').doc(uid);

    await ref.set(
      {
        ...patch,
        updatedAt: firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  } catch (error) {
    if (__DEV__) {
      console.error('[Firestore] Error updating profile:', error);
    }
    throw error;
  }
}

export async function saveCompleteProfile(
  uid: string,
  data: Partial<UserProfile>,
) {
  return upsertUserProfile(uid, data);
}

export async function updateUserProfilePartial(
  uid: string,
  patch: Record<string, any>,
) {
  return upsertUserProfile(uid, patch);
}

export const isProfileComplete = async (uid: string): Promise<boolean> => {
  const snap = await firestoreDb.collection('users').doc(uid).get();
  if (!snap.exists) return false;

  const data = snap.data() as UserProfile | undefined;
  const realName = data?.realName ?? '';
  return realName.trim().length > 0;
};

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const ref = firestoreDb.collection('users').doc(uid);
  const snap = await ref.get();

  if (!snap.exists) {
    return null;
  }

  return snap.data() as UserProfile;
}

export const updateUserMode = async (
  uid: string,
  mode: 'personal' | 'professional',
) => {
  try {
    await firestoreDb.collection('users').doc(uid).set(
      {
        mode,
        updatedAt: firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  } catch (error) {
    if (__DEV__) {
      console.error('[Firestore] Error updating mode:', error);
    }
    throw error;
  }
};

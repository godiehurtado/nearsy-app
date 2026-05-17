// src/services/firestoreService.android.ts ✅ RNFirebase Firestore
import { firestoreDb } from '../config/firebaseConfig';
import { isProfileDocumentComplete } from '../utils/profileDocumentComplete';

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

const now = () => Date.now();

function userDoc(uid: string) {
  return (firestoreDb as any).collection('users').doc(uid);
}

export const createUserProfile = async (
  uid: string,
  data: { email: string; phone?: string | null; birthYear: number },
) => {
  try {
    await userDoc(uid).set(
      {
        email: data.email,
        phone: data.phone ?? null,
        birthYear: data.birthYear,

        createdAt: now(),
        updatedAt: now(),

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
    await userDoc(uid).set(
      {
        ...patch,
        updatedAt: now(),
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
  const snap = await userDoc(uid).get();

  if (!snap.exists) return false;

  return isProfileDocumentComplete(snap.data());
};

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await userDoc(uid).get();

  if (!snap.exists) return null;

  return snap.data() as UserProfile;
}

export const updateUserMode = async (
  uid: string,
  mode: 'personal' | 'professional',
) => {
  try {
    await userDoc(uid).set(
      {
        mode,
        updatedAt: now(),
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

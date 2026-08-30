// src/services/firestoreService.ts  ✅ Web Firestore + RNFirebase Auth
import { firestoreDb } from '../config/firebaseConfig';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { isProfileDocumentComplete } from '../utils/profileDocumentComplete';

import {
  InterestAffiliations,
  SocialLinks,
  GalleryPhoto,
  AffiliationItem,
} from '../types/profile';

export type ModePresentationFields = {
  realName?: string;
  lastName?: string;
  profileImage?: string | null;
  occupation?: string;
  status?: string;
  bio?: string;
  company?: string;
};

export type UserProfile = {
  bio?: string;
  company?: string;
  email?: string;
  phone?: string | null;
  realName: string;
  /** Temporary top-level mirror of active profile lastName (CRJ). */
  lastName?: string;

  status?: string;
  location?:
    | {
        lat: number;
        lng: number;
        updatedAt: number;
        accuracy?: number | null;
      }
    | null;

  mode?: 'personal' | 'professional';
  occupation?: string;

  /**
   * Per-mode presentation (CRJ). Identity (realName/lastName) lives per mode;
   * top-level may mirror the active face for legacy readers.
   */
  profiles?: {
    personal?: ModePresentationFields;
    professional?: ModePresentationFields;
  };

  /**
   * CRJ onboarding interest selections (detailed).
   * INTERNAL INTERESTS MIGRATION — pending for in-app InterestsScreen.
   */
  personalOnboardingInterests?: Array<{
    id: string;
    name: string;
    categoryId: string;
    icon?: string;
    isCustom?: boolean;
    groupId?: string;
  }>;
  professionalOnboardingInterests?: Array<{
    id: string;
    name: string;
    categoryId: string;
    icon?: string;
    isCustom?: boolean;
    groupId?: string;
  }>;

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
  personalOnboardingAffiliations?: Array<{
    id: string;
    name: string;
    categoryId: string;
    source: 'provider' | 'custom';
    providerId?: string;
    logoUrl?: string;
    website?: string;
    topic?: string;
  }>;
  professionalOnboardingAffiliations?: Array<{
    id: string;
    name: string;
    categoryId: string;
    source: 'provider' | 'custom';
    providerId?: string;
    logoUrl?: string;
    website?: string;
    topic?: string;
  }>;

  /** @deprecated Prefer profiles[mode].profileImage — kept for legacy fallback. */
  profileImage?: string | null;
  topBarColor?: string;
  topBarImage?: string | null;
  topBarMode?: 'color' | 'image';

  visibility?: boolean;
  profileSetupCompleted?: boolean;

  /** @deprecated */
  socialLinks?: SocialLinks;
  /** @deprecated */
  photos?: GalleryPhoto[];
};

/** Crea un perfil base en Firestore (si no existe) */
export const createUserProfile = async (
  uid: string,
  data: {
    email: string;
    phone?: string | null;
    birthYear: number;
    /** Full birth date ISO `YYYY-MM-DD` for new registrations (TSB-001). */
    birthDate?: string | null;
    realName?: string;
    phoneVerified?: boolean;
    phoneVerifiedAt?: string | null;
    acceptedTerms?: boolean;
    acceptedTermsAt?: string | null;
  },
) => {
  try {
    const ref = doc(firestoreDb, 'users', uid);

    await setDoc(
      ref,
      {
        email: data.email,
        phone: data.phone ?? null,
        birthYear: data.birthYear,
        ...(data.birthDate ? { birthDate: data.birthDate } : {}),
        phoneVerified: data.phoneVerified ?? false,
        phoneVerifiedAt: data.phoneVerifiedAt ?? null,
        ...(data.acceptedTerms != null
          ? {
              acceptedTerms: data.acceptedTerms,
              acceptedTermsAt: data.acceptedTermsAt ?? null,
            }
          : {}),

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),

        visibility: false,
        // mode is chosen in Profile Type (CRJ) — do not default here.

        bio: '',
        status: '',
        // Identity is collected after Profile Type (CRJ). Leave empty shell only.
        realName: data.realName?.trim() ?? '',
        occupation: '',
        company: '',
        profileImage: null,
        profiles: {
          personal: {
            profileImage: null,
            occupation: '',
            status: '',
            bio: '',
          },
          professional: {
            profileImage: null,
            occupation: '',
            status: '',
            bio: '',
            company: '',
          },
        },

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
    const ref = doc(firestoreDb, 'users', uid);

    await setDoc(
      ref,
      {
        ...patch,
        updatedAt: serverTimestamp(),
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
  const ref = doc(firestoreDb, 'users', uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) return false;

  return isProfileDocumentComplete(snap.data());
};

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const ref = doc(firestoreDb, 'users', uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) return null;

  return snap.data() as UserProfile;
}

export const updateUserMode = async (
  uid: string,
  mode: 'personal' | 'professional',
) => {
  /**
   * @deprecated iOS must use setActiveProfileMode callable (activeProfileModeSync).
   * Retained for Android until that platform migrates.
   */
  try {
    const ref = doc(firestoreDb, 'users', uid);

    await setDoc(
      ref,
      {
        mode,
        updatedAt: serverTimestamp(),
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

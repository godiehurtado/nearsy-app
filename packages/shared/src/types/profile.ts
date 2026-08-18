// src/types/profile.ts
export type InterestLabel =
  | 'Healthy Lifestyle'
  | 'Extra-Curricular Activities'
  | 'Language'
  | 'Other'
  | 'Sports'
  | 'Music';

export type LogoPick = {
  id: string;
  name: string;
  emoji: string;
};

export type InterestAffiliations = Partial<Record<InterestLabel, LogoPick[]>>;
export type SocialCustomLink = {
  name: string;
  url: string;
};

export type SocialLinks = {
  linkedin?: string;
  instagram?: string;
  facebook?: string;
  youtube?: string;
  twitter?: string;
  tiktok?: string;
  snapchat?: string;
  website?: string;
  /** Claude CRJ "Other network" rows. Not a known-platform id. */
  custom?: SocialCustomLink[];
};

export type GalleryPhoto = {
  url: string; // URL https (downloadURL)
  path: string; // ruta en storage (por si luego quieres borrar)
  createdAt: number;
};

// Tipo genérico, igual al usado en la screen
export type AffiliationCategory =
  | 'schoolCollege'
  | 'majorField'
  | 'alumniGroup'
  // | 'favoriteSport'
  | 'favoriteTeam'
  | 'hobbiesClubs'
  | 'industry'
  | 'communityGroups'
  // | 'from'
  | 'pets';

export type AffiliationItem = {
  category: AffiliationCategory;
  label: string;
  imageUrl: string | null;
};

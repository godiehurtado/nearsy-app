// src/types/profile.ts
export type InterestLabel =
  | 'Sports'
  | 'Music'
  | 'Healthy Lifestyle'
  | 'Extra-Curricular Activities'
  | 'Other'
  | 'Lenguage';

export type LogoPick = {
  id: string;
  name: string;
  emoji: string;
};

export type InterestAffiliations = Partial<Record<InterestLabel, LogoPick[]>>;
export type SocialLinks = {
  linkedin?: string;
  instagram?: string;
  facebook?: string;
  youtube?: string;
  twitter?: string;
  tiktok?: string;
  snapchat?: string;
  website?: string;
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
  | 'favoriteSport'
  | 'favoriteTeam'
  | 'hobbiesClubs'
  | 'industry'
  | 'communityGroups'
  | 'languages'
  | 'pets';

export type AffiliationItem = {
  category: AffiliationCategory;
  label: string;
  imageUrl: string | null;
};

// src/types/profile.ts
export type InterestLabel =
  | 'Sports'
  | 'Travel'
  | 'Music'
  | 'Study'
  | 'Gaming'
  | 'Country'
  | 'Healthy Lifestyle'
  | 'Fun Time'
  | 'Pets'
  | 'Other'
  | 'Interests'
  | 'Lenguage'
  | 'Career';

export type LogoPick = {
  id: string;
  name: string;
  // si es de catálogo:
  imageKey?: string;
  // si es subida por el usuario:
  imageUrl?: string;
  path?: string; // ruta en Storage (para borrar si deseas)
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

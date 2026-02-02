// src/services/storageService.ts  ✅ RNFirebase-only
import { bucket } from '../config/firebaseConfig';

function safeSlug(value: string) {
  return value.toLowerCase().trim().replace(/\s+/g, '_');
}

/** Sube la imagen del perfil */
export const uploadProfileImage = async (
  uid: string,
  uri: string,
): Promise<string> => {
  try {
    const filename = `users/${uid}/${uid}_${Date.now()}.jpg`;
    const fileRef = bucket.ref(filename);

    // ✅ RNFirebase: subir directo desde URI local (file://...)
    await fileRef.putFile(uri, { contentType: 'image/jpeg' });

    const downloadURL = await fileRef.getDownloadURL();
    return downloadURL;
  } catch (error) {
    if (__DEV__) {
      console.warn('uploadProfileImage error:', error);
    }
    throw error;
  }
};

/** Sube una imagen a la galería según el modo */
export async function uploadGalleryImage(
  uid: string,
  localUri: string,
  mode: 'personal' | 'professional',
) {
  const filename = `users/${uid}/gallery/${mode}/${Date.now()}.jpg`;
  const fileRef = bucket.ref(filename);

  await fileRef.putFile(localUri, { contentType: 'image/jpeg' });
  const url = await fileRef.getDownloadURL();

  return { url, path: filename };
}

/** Sube la imagen del top bar */
export async function uploadTopBarImage(uid: string, localUri: string) {
  const path = `users/${uid}/topbar/${Date.now()}.jpg`;
  const fileRef = bucket.ref(path);

  await fileRef.putFile(localUri, { contentType: 'image/jpeg' });
  const url = await fileRef.getDownloadURL();
  return url;
}

/** Sube un logo personalizado para un interés */
export async function uploadInterestLogo(
  uid: string,
  scope: 'personal' | 'professional',
  interest: string,
  localUri: string,
) {
  const safeInterest = safeSlug(interest);
  const filename = `users/${uid}/interest_icons/${scope}/${safeInterest}/${Date.now()}.png`;
  const fileRef = bucket.ref(filename);

  // Si realmente es png, usa contentType image/png
  await fileRef.putFile(localUri, { contentType: 'image/png' });
  const url = await fileRef.getDownloadURL();

  return { url, path: filename };
}

/** Sube una imagen para una afiliación */
export async function uploadAffiliationImage(
  uid: string,
  localUri: string,
  category: string,
): Promise<string> {
  const ext = (localUri.split('.').pop() || 'jpg').toLowerCase();
  const contentType =
    ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

  const safeCategory = safeSlug(category);
  const path = `users/${uid}/affiliations/${safeCategory}_${Date.now()}.${ext}`;
  const fileRef = bucket.ref(path);

  await fileRef.putFile(localUri, { contentType });
  const downloadUrl = await fileRef.getDownloadURL();
  return downloadUrl;
}

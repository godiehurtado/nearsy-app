// src/services/storageService.ts  ✅ Web Storage SDK
import { storageWeb } from '../config/firebaseConfig';
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
  type UploadMetadata,
} from 'firebase/storage';

function safeSlug(value: string) {
  return value.toLowerCase().trim().replace(/\s+/g, '_');
}

function normalizeLocalUri(uri: string): string {
  if (!uri) {
    throw new Error('Image URI is empty.');
  }

  return uri.trim();
}

function getExtensionFromUri(uri: string): string {
  const cleanUri = uri.split('?')[0];
  const match = cleanUri.match(/\.([a-zA-Z0-9]+)$/);
  return (match?.[1] || 'jpg').toLowerCase();
}

function getContentTypeFromExtension(ext: string): string {
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'heic':
      return 'image/heic';
    case 'heif':
      return 'image/heif';
    case 'jpg':
    case 'jpeg':
    default:
      return 'image/jpeg';
  }
}

/** Convierte un localUri a Blob de forma más compatible con RN/Expo */
async function uriToBlob(uri: string): Promise<Blob> {
  const normalizedUri = normalizeLocalUri(uri);

  return await new Promise<Blob>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = function () {
      resolve(xhr.response);
    };
    xhr.onerror = function () {
      reject(new Error(`Failed to convert URI to Blob: ${normalizedUri}`));
    };
    xhr.responseType = 'blob';
    xhr.open('GET', normalizedUri, true);
    xhr.send(null);
  });
}

async function uploadImageAndGetUrl(
  path: string,
  localUri: string,
  metadata?: UploadMetadata,
): Promise<{ url: string; path: string }> {
  if (!storageWeb) {
    throw new Error('Firebase storage is not initialized.');
  }

  const blob = await uriToBlob(localUri);
  const fileRef = ref(storageWeb, path);

  try {
    await uploadBytes(fileRef, blob, metadata);
    const url = await getDownloadURL(fileRef);
    return { url, path };
  } finally {
    // libera memoria del blob en RN
    if (typeof (blob as any)?.close === 'function') {
      try {
        (blob as any).close();
      } catch {}
    }
  }
}

/** Sube la imagen del perfil */
export const uploadProfileImage = async (
  uid: string,
  uri: string,
): Promise<string> => {
  try {
    const ext = getExtensionFromUri(uri);
    const contentType = getContentTypeFromExtension(ext);
    const path = `users/${uid}/${uid}_${Date.now()}.${ext}`;

    const { url } = await uploadImageAndGetUrl(path, uri, {
      contentType,
    });

    return url;
  } catch (error) {
    if (__DEV__) {
      console.warn('uploadProfileImage error:', error);
      console.warn('uploadProfileImage uri:', uri);
      console.warn('uploadProfileImage storageWeb exists:', !!storageWeb);
    }
    throw error;
  }
};

/** Sube una imagen a la galería según el modo */
export async function uploadGalleryImage(
  uid: string,
  localUri: string,
  mode: 'personal' | 'professional',
): Promise<{ url: string; path: string }> {
  try {
    const ext = getExtensionFromUri(localUri);
    const contentType = getContentTypeFromExtension(ext);
    const path = `users/${uid}/gallery/${mode}/${Date.now()}.${ext}`;

    return await uploadImageAndGetUrl(path, localUri, {
      contentType,
    });
  } catch (error) {
    if (__DEV__) {
      console.warn('uploadGalleryImage error:', error);
      console.warn('uploadGalleryImage uri:', localUri);
      console.warn('uploadGalleryImage storageWeb exists:', !!storageWeb);
    }
    throw error;
  }
}

/** Best-effort Storage cleanup for a gallery object we own. */
export async function deleteGalleryStorageObject(path: string): Promise<void> {
  if (!path || path.startsWith('local-') || /^(file|content|ph|assets-library):/i.test(path)) {
    return;
  }
  if (!storageWeb) return;
  try {
    await deleteObject(ref(storageWeb, path));
  } catch (error) {
    if (__DEV__) {
      console.warn('deleteGalleryStorageObject error:', error);
    }
  }
}

/** Sube la imagen del top bar */
export async function uploadTopBarImage(
  uid: string,
  localUri: string,
): Promise<string> {
  try {
    const ext = getExtensionFromUri(localUri);
    const contentType = getContentTypeFromExtension(ext);
    const path = `users/${uid}/topbar/${Date.now()}.${ext}`;

    const { url } = await uploadImageAndGetUrl(path, localUri, {
      contentType,
    });

    return url;
  } catch (error) {
    if (__DEV__) {
      console.warn('uploadTopBarImage error:', error);
      console.warn('uploadTopBarImage uri:', localUri);
      console.warn('uploadTopBarImage storageWeb exists:', !!storageWeb);
    }
    throw error;
  }
}

/** Sube un logo personalizado para un interés */
export async function uploadInterestLogo(
  uid: string,
  scope: 'personal' | 'professional',
  interest: string,
  localUri: string,
): Promise<{ url: string; path: string }> {
  try {
    const safeInterest = safeSlug(interest);
    const ext = getExtensionFromUri(localUri);
    const contentType = getContentTypeFromExtension(ext);
    const path = `users/${uid}/interest_icons/${scope}/${safeInterest}/${Date.now()}.${ext}`;

    return await uploadImageAndGetUrl(path, localUri, {
      contentType,
    });
  } catch (error) {
    if (__DEV__) {
      console.warn('uploadInterestLogo error:', error);
      console.warn('uploadInterestLogo uri:', localUri);
      console.warn('uploadInterestLogo storageWeb exists:', !!storageWeb);
    }
    throw error;
  }
}

/** Sube una imagen para una afiliación */
export async function uploadAffiliationImage(
  uid: string,
  localUri: string,
  category: string,
): Promise<string> {
  try {
    const ext = getExtensionFromUri(localUri);
    const contentType = getContentTypeFromExtension(ext);
    const safeCategory = safeSlug(category);
    const path = `users/${uid}/affiliations/${safeCategory}_${Date.now()}.${ext}`;

    const { url } = await uploadImageAndGetUrl(path, localUri, {
      contentType,
    });

    return url;
  } catch (error) {
    if (__DEV__) {
      console.warn('uploadAffiliationImage error:', error);
      console.warn('uploadAffiliationImage uri:', localUri);
      console.warn('uploadAffiliationImage storageWeb exists:', !!storageWeb);
    }
    throw error;
  }
}

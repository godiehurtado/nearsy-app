import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../config/firebaseConfig';

export const uploadProfileImage = async (
  uid: string,
  uri: string,
): Promise<string> => {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();

    const filename = `users/${uid}/${uid}_${Date.now()}.jpg`;
    const storageRef = ref(storage, filename);
    await uploadBytes(storageRef, blob);

    const downloadURL = await getDownloadURL(storageRef);
    console.log('✅ Image uploaded:', downloadURL);
    return downloadURL;
  } catch (error) {
    console.error('❌ Error uploading image:', error);
    throw error;
  }
};

export async function uploadGalleryImage(
  uid: string,
  localUri: string,
  mode: string,
) {
  // nombre único
  const filename = `users/${uid}/gallery/${mode}/${Date.now()}.jpg`;

  // convertir la URI local a blob
  const res = await fetch(localUri);
  const blob = await res.blob();

  const r = ref(storage, filename);
  await uploadBytes(r, blob);
  const url = await getDownloadURL(r);

  return { url, path: filename };
}

export async function uploadTopBarImage(uid: string, localUri: string) {
  const resp = await fetch(localUri);
  const blob = await resp.blob();
  const path = `users/${uid}/topbar/${Date.now()}.jpg`;
  const fileRef = ref(storage, path);
  await uploadBytes(fileRef, blob, { contentType: 'image/jpeg' });
  const url = await getDownloadURL(fileRef);
  return url;
}

export async function uploadInterestLogo(
  uid: string,
  scope: 'personal' | 'professional',
  interest: string, // e.g. "Sports"
  localUri: string,
) {
  const safeInterest = interest.toLowerCase().replace(/\s+/g, '_');
  const filename = `users/${uid}/interest_icons/${scope}/${safeInterest}/${Date.now()}.png`;

  const res = await fetch(localUri);
  const blob = await res.blob();

  const r = ref(storage, filename);
  await uploadBytes(r, blob);
  const url = await getDownloadURL(r);

  return { url, path: filename };
}

export async function uploadAffiliationImage(
  uid: string,
  localUri: string,
  category: string,
): Promise<string> {
  const response = await fetch(localUri);
  const blob = await response.blob();

  const ext = localUri.split('.').pop() || 'jpg';
  const path = `users/${uid}/affiliations/${category}_${Date.now()}.${ext}`;
  const storageRef = ref(storage, path);

  await uploadBytes(storageRef, blob);
  const downloadUrl = await getDownloadURL(storageRef);
  return downloadUrl;
}

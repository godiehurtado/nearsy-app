// Android contacts sync backed by RNFirebase Firestore.
import * as Contacts from 'expo-contacts';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { firebaseAuth, firestoreDb } from '../config/firebaseConfig.android';

const CONTACTS_FLAG_KEY = 'NEARSY_CONTACTS_SYNC_ENABLED';
const CONTACTS_COLLECTION = 'contactHashes';

export async function isContactsSyncEnabled(): Promise<boolean> {
  const v = await AsyncStorage.getItem(CONTACTS_FLAG_KEY);
  return v === '1';
}

export async function setContactsSyncEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(CONTACTS_FLAG_KEY, enabled ? '1' : '0');
}

function normalizeId(value?: string | null): string | null {
  if (!value) return null;
  return value.replace(/\s+/g, '').toLowerCase();
}

function contactHashesCollection(uid: string) {
  return (firestoreDb as any)
    .collection('users')
    .doc(uid)
    .collection(CONTACTS_COLLECTION);
}

async function purgeContactHashes(uid: string): Promise<void> {
  const colRef = contactHashesCollection(uid);
  const snap = await colRef.get();

  if (snap.empty) return;

  let batch = (firestoreDb as any).batch();
  let ops = 0;

  for (const d of snap.docs ?? []) {
    batch.delete(d.ref);
    ops += 1;

    if (ops >= 450) {
      await batch.commit();
      batch = (firestoreDb as any).batch();
      ops = 0;
    }
  }

  if (ops > 0) await batch.commit();
}

export async function syncContactsSafe(): Promise<boolean> {
  const user = firebaseAuth.currentUser;
  if (!user) return false;

  const perm = await Contacts.getPermissionsAsync();
  let finalStatus = perm.status;

  if (finalStatus !== 'granted' && perm.canAskAgain) {
    const req = await Contacts.requestPermissionsAsync();
    finalStatus = req.status;
  }

  if (finalStatus !== 'granted') {
    return false;
  }

  (async () => {
    try {
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails],
      });

      const rawSet = new Set<string>();

      for (const c of data) {
        for (const p of c.phoneNumbers ?? []) {
          const norm = normalizeId(p.number);
          if (norm) rawSet.add(`tel:${norm}`);
        }
        for (const e of c.emails ?? []) {
          const norm = normalizeId(e.email);
          if (norm) rawSet.add(`mail:${norm}`);
        }
      }

      const colRef = contactHashesCollection(user.uid);

      try {
        await purgeContactHashes(user.uid);
      } catch {}

      let batch = (firestoreDb as any).batch();
      let ops = 0;

      for (const raw of rawSet) {
        const hash = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          raw,
        );

        const hashRef = colRef.doc(hash);

        batch.set(hashRef, { hash, createdAt: Date.now() }, { merge: true });

        ops += 1;
        if (ops >= 450) {
          await batch.commit();
          batch = (firestoreDb as any).batch();
          ops = 0;
        }
      }

      if (ops > 0) await batch.commit();
    } catch (err) {
      if (__DEV__)
        console.warn('[contactsSync] Background contacts sync failed', err);
    }
  })();

  return true;
}

export async function disableContactsSyncAndPurge(): Promise<void> {
  const user = firebaseAuth.currentUser;
  if (!user) return;

  await setContactsSyncEnabled(false);

  try {
    await purgeContactHashes(user.uid);
  } catch {
    // keep the existing best-effort behavior
  }
}

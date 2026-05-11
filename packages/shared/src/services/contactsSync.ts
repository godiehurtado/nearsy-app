// src/services/contactsSync.ts  ✅ Web Firestore + RNFirebase Auth
import * as Contacts from 'expo-contacts';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { firebaseAuth, firestoreDb } from '../config/firebaseConfig';
import {
  collection,
  doc,
  getDocs,
  writeBatch,
  setDoc,
} from 'firebase/firestore';

const CONTACTS_FLAG_KEY = 'NEARSY_CONTACTS_SYNC_ENABLED';
const CONTACTS_COLLECTION = 'contactHashes';

// ---- Flag local (para no volver a preguntar si ya dijo que sí/no) ----
export async function isContactsSyncEnabled(): Promise<boolean> {
  const v = await AsyncStorage.getItem(CONTACTS_FLAG_KEY);
  return v === '1';
}

export async function setContactsSyncEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(CONTACTS_FLAG_KEY, enabled ? '1' : '0');
}

// ---- Normalización básica de IDs de contacto ----
function normalizeId(value?: string | null): string | null {
  if (!value) return null;
  return value.replace(/\s+/g, '').toLowerCase();
}

/**
 * Sincroniza contactos de forma *no bloqueante*.
 *
 * - Pide permiso (si no está concedido) → esta parte sí se espera.
 * - Si el permiso se concede, lanza la sincronización pesada en background.
 * - Devuelve true = permiso concedido y sync lanzada, false = no hay permiso.
 */
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

  // 2) Sincronización pesada en background (no se espera)
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

      const colRef = collection(
        firestoreDb,
        'users',
        user.uid,
        CONTACTS_COLLECTION,
      );

      // borrar previos
      try {
        const snap = await getDocs(colRef);
        if (!snap.empty) {
          const batch = writeBatch(firestoreDb);
          snap.docs.forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
      } catch {}

      // guardar hashes en batch
      let batch = writeBatch(firestoreDb);
      let ops = 0;

      for (const raw of rawSet) {
        const hash = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          raw,
        );

        batch.set(
          doc(colRef, hash),
          { hash, createdAt: Date.now() },
          { merge: true },
        );

        ops += 1;
        if (ops >= 450) {
          await batch.commit();
          batch = writeBatch(firestoreDb);
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

/**
 * Llamar cuando el usuario desactive la sincronización desde MoreScreen:
 * - Se marca el flag en false
 * - Se borran hashes en Firestore
 */
export async function disableContactsSyncAndPurge(): Promise<void> {
  const user = firebaseAuth.currentUser;
  if (!user) return;

  await setContactsSyncEnabled(false);

  const colRef = collection(
    firestoreDb,
    'users',
    user.uid,
    CONTACTS_COLLECTION,
  );

  try {
    const snap = await getDocs(colRef);
    if (!snap.empty) {
      const batch = writeBatch(firestoreDb);
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  } catch {
    // ignoramos errores
  }
}

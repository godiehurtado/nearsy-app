// src/services/contactsSync.ts  ✅ RNFirebase-only
import * as Contacts from 'expo-contacts';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { firebaseAuth, firestoreDb } from '../config/firebaseConfig';

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

  // 1) Permisos (esto sí bloquea hasta que el usuario responda al diálogo)
  const perm = await Contacts.getPermissionsAsync();
  let finalStatus = perm.status;

  if (finalStatus !== 'granted' && perm.canAskAgain) {
    const req = await Contacts.requestPermissionsAsync();
    finalStatus = req.status;
  }

  if (finalStatus !== 'granted') {
    await setContactsSyncEnabled(false);
    return false;
  }

  // Tenemos permiso → marcamos flag local
  await setContactsSyncEnabled(true);

  // 2) Sincronización pesada en background (no se espera)
  (async () => {
    try {
      // Leer contactos
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails],
      });

      // Construimos set de IDs "raw" únicos (tel:xxx, mail:yyy)
      const rawSet = new Set<string>();

      for (const c of data) {
        for (const p of c.phoneNumbers ?? []) {
          const norm = normalizeId(p.number);
          if (!norm) continue;
          rawSet.add(`tel:${norm}`);
        }
        for (const e of c.emails ?? []) {
          const norm = normalizeId(e.email);
          if (!norm) continue;
          rawSet.add(`mail:${norm}`);
        }
      }

      const colRef = firestoreDb
        .collection('users')
        .doc(user.uid)
        .collection(CONTACTS_COLLECTION);

      // Limpiar colección anterior
      try {
        const snap = await colRef.get();
        await Promise.all(snap.docs.map((d) => d.ref.delete()));
      } catch {
        // ignoramos errores de limpieza
      }

      // Guardar hashes (1 doc por hash; id = hash)
      // Nota: digest es async; lo procesamos secuencial para no saturar CPU, pero si quieres lo paralelizamos.
      for (const raw of rawSet) {
        const hash = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          raw,
        );

        await colRef.doc(hash).set(
          {
            hash,
            createdAt: Date.now(),
            // Si prefieres timestamp server-side:
            // createdAt: firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }

      if (__DEV__) {
        console.log('[contactsSync] Background contacts sync completed');
      }
    } catch (err) {
      if (__DEV__) {
        console.warn('[contactsSync] Background contacts sync failed', err);
      }
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

  const colRef = firestoreDb
    .collection('users')
    .doc(user.uid)
    .collection(CONTACTS_COLLECTION);

  try {
    const snap = await colRef.get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  } catch {
    // ignoramos errores
  }
}

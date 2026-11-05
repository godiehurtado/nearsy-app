/**
 * iOS composition root for Identity Contacts HMAC callables.
 * Transport: Firebase callable HTTP with JS Auth ID token + RNFB App Check.
 */

import Constants from 'expo-constants';

import { createNativeAppCheckPort } from '../authentication/linkedinA3/appCheck/nativeAppCheckPort';
import { resolveNearsyFirebaseEnvironment } from '../authentication/linkedinA3/environment/nearsyFirebaseEnvironment';
import { firebaseAuth } from '../config/firebaseConfig';
import { createContactsClientComposer } from './contactsClientComposition';
import type { ContactsOperationTrace } from './contactsDiagnostics';
import { ContactsHmacClientError } from './errors';
import type { ContactsHmacClient } from './port';

type Extra = Record<string, unknown>;

function readExtra(): Extra {
  return (
    (Constants.expoConfig?.extra as Extra) ??
    ((Constants as { manifest2?: { extra?: Extra } }).manifest2?.extra as Extra) ??
    {}
  );
}

function pick(name: string): string | undefined {
  const extra = readExtra();
  const fromExtra = extra?.[name];
  if (typeof fromExtra === 'string' && fromExtra.length > 0) return fromExtra;
  const fromProcess = process.env[name];
  if (typeof fromProcess === 'string' && fromProcess.length > 0) {
    return fromProcess;
  }
  return undefined;
}

const DEFAULT_REGION = 'us-central1';

function readJsProjectId(): string {
  const fromAuth = (firebaseAuth as { app?: { options?: { projectId?: string } } })
    ?.app?.options?.projectId;
  if (typeof fromAuth === 'string' && fromAuth.trim()) {
    return fromAuth.trim();
  }
  const fromExtra = pick('EXPO_PUBLIC_FIREBASE_PROJECT_ID');
  if (typeof fromExtra === 'string' && fromExtra.trim()) {
    return fromExtra.trim();
  }
  throw new ContactsHmacClientError(
    'contacts-hmac-unavailable',
    'Contacts Identity Firebase projectId is missing.',
  );
}

const composer = createContactsClientComposer({
  resolveEnvironment() {
    const environment = resolveNearsyFirebaseEnvironment(
      pick('EXPO_PUBLIC_NEARSY_FIREBASE_ENV'),
    );
    const emulatorPortRaw = pick('EXPO_PUBLIC_FUNCTIONS_EMULATOR_PORT');
    return {
      environment: environment.environment,
      firebaseProjectId: environment.firebaseProjectId,
      region:
        pick('EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION') ??
        pick('EXPO_PUBLIC_FUNCTIONS_REGION') ??
        environment.functionsRegion ??
        DEFAULT_REGION,
      emulatorHost: pick('EXPO_PUBLIC_FUNCTIONS_EMULATOR_HOST'),
      emulatorPort: emulatorPortRaw ? Number(emulatorPortRaw) : 5001,
    };
  },
  readJsProjectId,
  createNativeAppCheckPort: () => createNativeAppCheckPort(),
  getCurrentUser: () => firebaseAuth.currentUser,
});

export function getContactsHmacClient(
  trace?: ContactsOperationTrace,
): Promise<ContactsHmacClient> {
  return composer.getClient(trace);
}

export function resetContactsHmacClientForTests(): void {
  composer.reset();
}

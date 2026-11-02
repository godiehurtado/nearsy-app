/**
 * iOS composition root for Identity Contacts HMAC callables.
 * Transport: Firebase callable HTTP with JS Auth ID token + RNFB App Check.
 */

import Constants from 'expo-constants';

import { createAppCheckBootstrap } from '../authentication/linkedinA3/appCheck/appCheckBootstrap';
import { createNativeAppCheckPort } from '../authentication/linkedinA3/appCheck/nativeAppCheckPort';
import { resolveNearsyFirebaseEnvironment } from '../authentication/linkedinA3/environment/nearsyFirebaseEnvironment';
import { firebaseAuth } from '../config/firebaseConfig';
import { createContactsHmacCallableClient } from './adapter';
import { invokeContactsHmacCallableHttp } from './contactsCallableHttp';
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

let clientPromise: Promise<ContactsHmacClient> | null = null;

export function getContactsHmacClient(): Promise<ContactsHmacClient> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const environment = resolveNearsyFirebaseEnvironment(
        pick('EXPO_PUBLIC_NEARSY_FIREBASE_ENV'),
      );
      const region =
        pick('EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION') ??
        pick('EXPO_PUBLIC_FUNCTIONS_REGION') ??
        environment.functionsRegion ??
        DEFAULT_REGION;
      const emulatorHost = pick('EXPO_PUBLIC_FUNCTIONS_EMULATOR_HOST');
      const emulatorPortRaw = pick('EXPO_PUBLIC_FUNCTIONS_EMULATOR_PORT');
      const emulatorPort = emulatorPortRaw ? Number(emulatorPortRaw) : 5001;

      const projectId = readJsProjectId();
      if (projectId !== environment.firebaseProjectId) {
        throw new ContactsHmacClientError(
          'contacts-hmac-unavailable',
          'Contacts Identity projectId does not match the configured Firebase environment.',
        );
      }

      const { port, getNativeProjectId } = await createNativeAppCheckPort();
      const nativeProjectId = getNativeProjectId();
      if (nativeProjectId && nativeProjectId !== projectId) {
        throw new ContactsHmacClientError(
          'contacts-hmac-unavailable',
          'Contacts Identity native projectId does not match JS Firebase project.',
        );
      }

      const appCheck = createAppCheckBootstrap({ port });
      await appCheck.initialize();

      return createContactsHmacCallableClient({
        invoke: async (name, data) => {
          const user = firebaseAuth.currentUser;
          if (!user) {
            throw new ContactsHmacClientError(
              'contacts-unauthenticated',
              'Contacts Identity requires sign-in.',
            );
          }
          appCheck.ensureReady();
          if (!port.withToken) {
            throw new ContactsHmacClientError(
              'contacts-hmac-unavailable',
              'Contacts Identity App Check is not ready.',
            );
          }
          const idToken = await user.getIdToken();
          return port.withToken((appCheckToken) =>
            invokeContactsHmacCallableHttp({
              projectId,
              region,
              environment: environment.environment,
              functionName: name,
              idToken,
              appCheckToken,
              data,
              emulatorHost,
              emulatorPort: emulatorHost ? emulatorPort : undefined,
            }),
          );
        },
      });
    })().catch((err) => {
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
}

export function resetContactsHmacClientForTests(): void {
  clientPromise = null;
}

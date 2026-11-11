/**
 * iOS composition root for Identity Contacts HMAC callables.
 * Transport: Firebase callable HTTP with JS Auth ID token + RNFB App Check.
 * Each operation may pass a trace that only records which step is running;
 * steps, checks, caching and errors are the same with or without it.
 */

import Constants from 'expo-constants';

import { createAppCheckBootstrap } from '../authentication/linkedinA3/appCheck/appCheckBootstrap';
import {
  createTracedFetch,
  NOOP_CONTACTS_TRACE,
  tagContactsFailureStage,
  traceAppCheckPort,
  type ContactsDiagnosticStage,
  type ContactsOperationTrace,
} from './contactsDiagnostics';
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

type Composition = {
  environment: 'development' | 'production';
  projectId: string;
  region: string;
  emulatorHost?: string;
  emulatorPort: number;
  port: Awaited<ReturnType<typeof createNativeAppCheckPort>>['port'];
  appCheck: ReturnType<typeof createAppCheckBootstrap>;
};

/** Shared by every operation; a failure clears it so the next one retries. */
let compositionPromise: Promise<Composition> | null = null;

function getComposition(): Promise<Composition> {
  if (!compositionPromise) {
    compositionPromise = (async () => {
      // The failing step travels on the error: operations that wait on this
      // shared composition all receive the same error.
      let stage: ContactsDiagnosticStage = 'env_config';
      try {
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

        stage = 'project_js';
        const projectId = readJsProjectId();
        if (projectId !== environment.firebaseProjectId) {
          throw new ContactsHmacClientError(
            'contacts-hmac-unavailable',
            'Contacts Identity projectId does not match the configured Firebase environment.',
          );
        }

        stage = 'native_port';
        const { port, getNativeProjectId } = await createNativeAppCheckPort();
        stage = 'project_native';
        const nativeProjectId = getNativeProjectId();
        if (nativeProjectId && nativeProjectId !== projectId) {
          throw new ContactsHmacClientError(
            'contacts-hmac-unavailable',
            'Contacts Identity native projectId does not match JS Firebase project.',
          );
        }

        // Same bootstrap as before; the wrapper only reports init vs forced refresh.
        const appCheck = createAppCheckBootstrap({
          port: traceAppCheckPort(port, (next) => {
            stage = next;
          }),
        });
        await appCheck.initialize();

        return {
          environment: environment.environment,
          projectId,
          region,
          emulatorHost,
          emulatorPort,
          port,
          appCheck,
        };
      } catch (err) {
        tagContactsFailureStage(err, stage);
        throw err;
      }
    })().catch((err) => {
      compositionPromise = null;
      throw err;
    });
  }
  return compositionPromise;
}

async function invokeTraced(
  composition: Composition,
  trace: ContactsOperationTrace,
  name: string,
  data: Record<string, unknown>,
): Promise<unknown> {
  const { appCheck, port } = composition;
  try {
    trace.enter('auth_token');
    const user = firebaseAuth.currentUser;
    if (!user) {
      throw new ContactsHmacClientError(
        'contacts-unauthenticated',
        'Contacts Identity requires sign-in.',
      );
    }
    trace.enter('app_check_token');
    appCheck.ensureReady();
    if (!port.withToken) {
      throw new ContactsHmacClientError(
        'contacts-hmac-unavailable',
        'Contacts Identity App Check is not ready.',
      );
    }
    trace.enter('auth_token');
    const idToken = await user.getIdToken();
    // Normal (cached) App Check token, as before.
    trace.enter('app_check_token');
    return await port.withToken((appCheckToken) => {
      trace.enter('endpoint');
      return invokeContactsHmacCallableHttp(
        {
          projectId: composition.projectId,
          region: composition.region,
          environment: composition.environment,
          functionName: name,
          idToken,
          appCheckToken,
          data,
          emulatorHost: composition.emulatorHost,
          emulatorPort: composition.emulatorHost ? composition.emulatorPort : undefined,
        },
        { fetchImpl: createTracedFetch(trace, (url, init) => fetch(url, init)) },
      );
    });
  } catch (err) {
    trace.fail(err);
    throw err;
  }
}

/** Each operation gets a client bound to its own trace; the composition is shared. */
export async function getContactsHmacClient(
  trace: ContactsOperationTrace = NOOP_CONTACTS_TRACE,
): Promise<ContactsHmacClient> {
  trace.enter('env_config');
  let composition: Composition;
  try {
    composition = await getComposition();
  } catch (err) {
    trace.fail(err);
    throw err;
  }
  return createContactsHmacCallableClient({
    invoke: (name, data) => invokeTraced(composition, trace, name, data),
  });
}

export function resetContactsHmacClientForTests(): void {
  compositionPromise = null;
}

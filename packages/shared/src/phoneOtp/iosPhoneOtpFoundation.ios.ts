/**
 * iOS composition root for Phone OTP callables.
 */

import Constants from 'expo-constants';

import { createAppCheckBootstrap } from '../authentication/linkedinA3/appCheck/appCheckBootstrap';
import { createNativeAppCheckPort } from '../authentication/linkedinA3/appCheck/nativeAppCheckPort';
import { resolveNearsyFirebaseEnvironment } from '../authentication/linkedinA3/environment/nearsyFirebaseEnvironment';
import { firebaseAuth } from '../config/firebaseConfig';
import {
  createPhoneOtpCallableClient,
  invokePhoneOtpCallableHttp,
  type PhoneOtpClient,
} from './callables';

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
  throw {
    code: 'functions/failed-precondition',
    message: 'Phone OTP callable Firebase projectId is missing.',
  };
}

let clientPromise: Promise<PhoneOtpClient> | null = null;

export function getPhoneOtpClient(): Promise<PhoneOtpClient> {
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
        throw {
          code: 'functions/failed-precondition',
          message:
            'Phone OTP callable projectId does not match the configured Firebase environment.',
        };
      }

      const { port, getNativeProjectId } = await createNativeAppCheckPort();
      const nativeProjectId = getNativeProjectId();
      if (nativeProjectId && nativeProjectId !== projectId) {
        throw {
          code: 'functions/failed-precondition',
          message:
            'Phone OTP callable native projectId does not match JS Firebase project.',
        };
      }

      const appCheck = createAppCheckBootstrap({ port });
      await appCheck.initialize();

      return createPhoneOtpCallableClient({
        invoke: async (name, data) => {
          const user = firebaseAuth.currentUser;
          if (!user) {
            throw {
              code: 'functions/unauthenticated',
              message: 'Phone OTP callable requires sign-in.',
            };
          }
          appCheck.ensureReady();
          if (!port.withToken) {
            throw {
              code: 'functions/failed-precondition',
              message: 'Phone OTP callable App Check is not ready.',
            };
          }
          const idToken = await user.getIdToken();
          return port.withToken((appCheckToken) =>
            invokePhoneOtpCallableHttp({
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

export function resetPhoneOtpClientForTests(): void {
  clientPromise = null;
}

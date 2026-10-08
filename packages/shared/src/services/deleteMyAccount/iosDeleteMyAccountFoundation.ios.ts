/**
 * iOS composition root for the `deleteMyAccount` callable.
 */

import Constants from 'expo-constants';

import { createAppCheckBootstrap } from '../../authentication/linkedinA3/appCheck/appCheckBootstrap';
import { createNativeAppCheckPort } from '../../authentication/linkedinA3/appCheck/nativeAppCheckPort';
import { resolveNearsyFirebaseEnvironment } from '../../authentication/linkedinA3/environment/nearsyFirebaseEnvironment';
import { firebaseAuth } from '../../config/firebaseConfig';
import { DELETE_MY_ACCOUNT_REGION, DeleteMyAccountError } from './contract';
import { createDeleteMyAccountAdapter } from './deleteMyAccountAdapter';
import type { DeleteMyAccountPort } from './port';

type Extra = Record<string, unknown>;

function readExtra(): Extra {
  return (
    (Constants.expoConfig?.extra as Extra) ??
    ((Constants as { manifest2?: { extra?: Extra } }).manifest2?.extra as Extra) ??
    {}
  );
}

function pick(name: string): string | undefined {
  const fromExtra = readExtra()?.[name];
  if (typeof fromExtra === 'string' && fromExtra.length > 0) return fromExtra;
  const fromProcess = process.env[name];
  if (typeof fromProcess === 'string' && fromProcess.length > 0) return fromProcess;
  return undefined;
}

function readJsProjectId(): string {
  const fromAuth = (firebaseAuth as { app?: { options?: { projectId?: string } } })
    ?.app?.options?.projectId;
  if (typeof fromAuth === 'string' && fromAuth.trim()) return fromAuth.trim();
  const fromExtra = pick('EXPO_PUBLIC_FIREBASE_PROJECT_ID');
  if (typeof fromExtra === 'string' && fromExtra.trim()) return fromExtra.trim();
  throw new DeleteMyAccountError('UNKNOWN', false);
}

let portPromise: Promise<DeleteMyAccountPort> | null = null;

export function getDeleteMyAccountPort(): Promise<DeleteMyAccountPort> {
  if (!portPromise) {
    portPromise = (async () => {
      const environment = resolveNearsyFirebaseEnvironment(
        pick('EXPO_PUBLIC_NEARSY_FIREBASE_ENV'),
      );
      const region =
        pick('EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION') ??
        pick('EXPO_PUBLIC_FUNCTIONS_REGION') ??
        environment.functionsRegion ??
        DELETE_MY_ACCOUNT_REGION;
      const emulatorHost = pick('EXPO_PUBLIC_FUNCTIONS_EMULATOR_HOST');
      const emulatorPortRaw = pick('EXPO_PUBLIC_FUNCTIONS_EMULATOR_PORT');
      const emulatorPort = emulatorPortRaw ? Number(emulatorPortRaw) : 5001;

      const projectId = readJsProjectId();
      if (projectId !== environment.firebaseProjectId) {
        throw new DeleteMyAccountError('UNKNOWN', false);
      }

      let port: Awaited<ReturnType<typeof createNativeAppCheckPort>>['port'];
      try {
        const native = await createNativeAppCheckPort();
        const nativeProjectId = native.getNativeProjectId();
        if (nativeProjectId && nativeProjectId !== projectId) {
          throw new DeleteMyAccountError('UNKNOWN', false);
        }
        port = native.port;
      } catch (err) {
        if (err instanceof DeleteMyAccountError) throw err;
        throw new DeleteMyAccountError('APP_CHECK', false);
      }

      const appCheck = createAppCheckBootstrap({ port });
      try {
        await appCheck.initialize();
      } catch {
        throw new DeleteMyAccountError('APP_CHECK', false);
      }

      return createDeleteMyAccountAdapter({
        getCurrentUser: () => firebaseAuth.currentUser,
        withAppCheckToken: (fn) => {
          appCheck.ensureReady();
          if (!port.withToken) {
            throw new DeleteMyAccountError('APP_CHECK', false);
          }
          return port.withToken(fn);
        },
        projectId,
        region,
        emulatorHost,
        emulatorPort: emulatorHost ? emulatorPort : undefined,
      });
    })().catch((err) => {
      portPromise = null;
      throw err;
    });
  }
  return portPromise;
}

export function resetDeleteMyAccountPortForTests(): void {
  portPromise = null;
}

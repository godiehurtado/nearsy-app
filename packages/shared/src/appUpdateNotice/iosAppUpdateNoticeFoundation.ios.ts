/**
 * iOS transport for `getAppUpdatePolicy` (Functions PR #34).
 * App Check required; Auth is not sent. Any error fail-softs.
 */

import Constants from 'expo-constants';

import { createAppCheckBootstrap } from '../authentication/linkedinA3/appCheck/appCheckBootstrap';
import { createNativeAppCheckPort } from '../authentication/linkedinA3/appCheck/nativeAppCheckPort';
import { resolveNearsyFirebaseEnvironment } from '../authentication/linkedinA3/environment/nearsyFirebaseEnvironment';
import { loadAppUpdatePolicy } from './callableHttp';
import { APP_UPDATE_NOTICE_REGION } from './contract';

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

let transportPromise: Promise<{
  projectId: string;
  port: Awaited<ReturnType<typeof createNativeAppCheckPort>>['port'];
  appCheck: ReturnType<typeof createAppCheckBootstrap>;
}> | null = null;

async function getTransport() {
  if (!transportPromise) {
    transportPromise = (async () => {
      const environment = resolveNearsyFirebaseEnvironment(
        pick('EXPO_PUBLIC_NEARSY_FIREBASE_ENV'),
      );
      const projectId = environment.firebaseProjectId;
      const { port, getNativeProjectId } = await createNativeAppCheckPort();
      const nativeProjectId = getNativeProjectId();
      if (nativeProjectId && nativeProjectId !== projectId) {
        throw new Error('getAppUpdatePolicy native project mismatch.');
      }
      const appCheck = createAppCheckBootstrap({ port });
      await appCheck.initialize();
      return { projectId, port, appCheck };
    })().catch((err) => {
      transportPromise = null;
      throw err;
    });
  }
  return transportPromise;
}

export async function loadAppUpdateNoticeFromFunctions(): Promise<unknown> {
  try {
    const { projectId, port, appCheck } = await getTransport();
    appCheck.ensureReady();
    if (!port.withToken) {
      throw new Error('App Check is not ready.');
    }
    return await port.withToken((appCheckToken) =>
      loadAppUpdatePolicy({
        projectId,
        region: APP_UPDATE_NOTICE_REGION,
        appCheckToken,
      }),
    );
  } catch {
    return undefined;
  }
}

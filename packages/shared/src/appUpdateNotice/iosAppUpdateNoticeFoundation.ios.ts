/**
 * iOS transport for the optional update notice. Does not invent a callable:
 * until Functions publishes `APP_UPDATE_NOTICE_CALLABLE_NAME`, this returns
 * undefined and the host fail-softs.
 */

import Constants from 'expo-constants';

import { resolveNearsyFirebaseEnvironment } from '../authentication/linkedinA3/environment/nearsyFirebaseEnvironment';
import { firebaseAuth } from '../config/firebaseConfig';
import { invokeFirebaseCallableHttp } from '../firebase/callableHttp';
import {
  APP_UPDATE_NOTICE_CALLABLE_NAME,
  APP_UPDATE_NOTICE_HTTP_TIMEOUT_MS,
  APP_UPDATE_NOTICE_REGION,
} from './contract';

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

export async function loadAppUpdateNoticeFromFunctions(): Promise<unknown> {
  const functionName = APP_UPDATE_NOTICE_CALLABLE_NAME.trim();
  if (!functionName) return undefined;

  try {
    const environment = resolveNearsyFirebaseEnvironment(
      pick('EXPO_PUBLIC_NEARSY_FIREBASE_ENV'),
    );
    const projectId =
      (firebaseAuth as { app?: { options?: { projectId?: string } } })?.app
        ?.options?.projectId ??
      pick('EXPO_PUBLIC_FIREBASE_PROJECT_ID') ??
      environment.firebaseProjectId;
    const region =
      pick('EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION') ??
      environment.functionsRegion ??
      APP_UPDATE_NOTICE_REGION;

    const auth = firebaseAuth as {
      currentUser?: {
        getIdToken?: (force?: boolean) => Promise<string>;
      } | null;
    };
    const idToken = await auth.currentUser?.getIdToken?.(false);
    if (!idToken?.trim()) return undefined;

    return await invokeFirebaseCallableHttp({
      url: `https://${region}-${projectId}.cloudfunctions.net/${functionName}`,
      idToken,
      appCheckToken: '',
      data: {},
      timeoutMs: APP_UPDATE_NOTICE_HTTP_TIMEOUT_MS,
    });
  } catch {
    return undefined;
  }
}

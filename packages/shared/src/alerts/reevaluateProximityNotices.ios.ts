/**
 * Functions #40 reevaluateProximityNotices — default codebase, us-central1.
 * Auth + App Check, caller uid only. Empty request body.
 */

import Constants from 'expo-constants';

import { createAppCheckBootstrap } from '../authentication/linkedinA3/appCheck/appCheckBootstrap';
import { createNativeAppCheckPort } from '../authentication/linkedinA3/appCheck/nativeAppCheckPort';
import { resolveNearsyFirebaseEnvironment } from '../authentication/linkedinA3/environment/nearsyFirebaseEnvironment';
import { firebaseAuth } from '../config/firebaseConfig';
import {
  buildCloudFunctionsCallableUrl,
  invokeFirebaseCallableHttp,
} from '../firebase/callableHttp';
import { ensureReevaluatePendingStoreRegistered } from './reevaluatePendingStore.ios';
import {
  createReevaluatePendingPort as createPendingPort,
  registerReevaluateProximityNoticesInvoker,
  reevaluateProximityNoticesNow as flushNow,
  resumePendingReevaluateProximityNotices as resumePending,
  scheduleReevaluateProximityNotices as scheduleDebounced,
} from './reevaluateProximityNotices.ts';

const NAME = 'reevaluateProximityNotices';
const DEFAULT_REGION = 'us-central1';

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

function readJsProjectId(): string | null {
  const fromAuth = (firebaseAuth as { app?: { options?: { projectId?: string } } })
    ?.app?.options?.projectId;
  if (typeof fromAuth === 'string' && fromAuth.trim()) return fromAuth.trim();
  const fromExtra = pick('EXPO_PUBLIC_FIREBASE_PROJECT_ID');
  if (typeof fromExtra === 'string' && fromExtra.trim()) return fromExtra.trim();
  return null;
}

function currentUid(): string | null {
  const uid = firebaseAuth.currentUser?.uid;
  return typeof uid === 'string' && uid.trim() ? uid.trim() : null;
}

let registered = false;

async function invoke(forUid: string): Promise<void> {
  // Throwing keeps the marker: returning would count as a completed reevaluate
  // and lose it, for example when the account changed before the debounce fired.
  const user = firebaseAuth.currentUser;
  if (!user || user.uid !== forUid) {
    throw new Error('reevaluate-uid-changed');
  }
  const environment = resolveNearsyFirebaseEnvironment(
    pick('EXPO_PUBLIC_NEARSY_FIREBASE_ENV'),
  );
  const projectId = readJsProjectId();
  if (!projectId || projectId !== environment.firebaseProjectId) {
    throw new Error('reevaluate-project-unavailable');
  }
  const region =
    pick('EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION') ??
    environment.functionsRegion ??
    DEFAULT_REGION;
  const { port } = await createNativeAppCheckPort();
  const appCheck = createAppCheckBootstrap({ port });
  await appCheck.initialize();
  appCheck.ensureReady();
  if (!port.withToken) throw new Error('reevaluate-app-check-unavailable');
  const idToken = await user.getIdToken();
  await port.withToken((appCheckToken) =>
    invokeFirebaseCallableHttp({
      url: buildCloudFunctionsCallableUrl(projectId, region, NAME),
      idToken,
      appCheckToken,
      data: {},
    }),
  );
}

function ensureRegistered(): void {
  if (registered) return;
  registered = true;
  ensureReevaluatePendingStoreRegistered();
  registerReevaluateProximityNoticesInvoker(
    (uid) => invoke(uid),
    () => currentUid(),
  );
}

export function createReevaluatePendingPort(uid: string) {
  ensureRegistered();
  return createPendingPort(uid);
}

export function scheduleReevaluateProximityNotices(): void {
  ensureRegistered();
  scheduleDebounced();
}

export async function reevaluateProximityNoticesNow(): Promise<void> {
  ensureRegistered();
  await flushNow();
}

export async function resumePendingReevaluateProximityNotices(): Promise<void> {
  ensureRegistered();
  await resumePending();
}

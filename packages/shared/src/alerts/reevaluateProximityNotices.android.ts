import { getApp } from '@react-native-firebase/app';
import { getFunctions } from '@react-native-firebase/functions';

import { firebaseAuth } from '../config/firebaseConfig.android';
import {
  ensureAppCheckInitialized,
  getAppCheckInitStatus,
} from '../config/appCheckBootstrap';
import {
  bindReevaluateSession,
  registerReevaluateProximityNoticesInvoker,
  scheduleReevaluateProximityNotices as scheduleDebounced,
  reevaluateProximityNoticesNow as flushNow,
} from './reevaluateProximityNotices.ts';

const REGION = 'us-central1' as const;
const NAME = 'reevaluateProximityNotices';

let registered = false;
let authUnsub: (() => void) | null = null;

async function invoke(): Promise<void> {
  const uid = firebaseAuth.currentUser?.uid;
  if (!uid) return;
  const status = await ensureAppCheckInitialized();
  if (status.status !== 'ready' && getAppCheckInitStatus().status !== 'ready') {
    return;
  }
  if (firebaseAuth.currentUser?.uid !== uid) return;
  const callable = getFunctions(getApp(), REGION).httpsCallable(NAME);
  await callable({});
}

function ensureRegistered(): void {
  if (registered) return;
  registered = true;
  bindReevaluateSession(firebaseAuth.currentUser?.uid ?? null);
  registerReevaluateProximityNoticesInvoker(invoke);
  authUnsub = firebaseAuth.onAuthStateChanged((user) => {
    bindReevaluateSession(user?.uid ?? null);
  });
}

export function scheduleReevaluateProximityNotices(): void {
  ensureRegistered();
  bindReevaluateSession(firebaseAuth.currentUser?.uid ?? null);
  scheduleDebounced();
}

export async function reevaluateProximityNoticesNow(): Promise<void> {
  ensureRegistered();
  bindReevaluateSession(firebaseAuth.currentUser?.uid ?? null);
  await flushNow();
}

export function resetReevaluateAndroidRegistrationForTests(): void {
  authUnsub?.();
  authUnsub = null;
  registered = false;
}

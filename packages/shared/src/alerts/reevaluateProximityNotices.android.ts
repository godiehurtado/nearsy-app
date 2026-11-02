import { getApp } from '@react-native-firebase/app';
import { getFunctions } from '@react-native-firebase/functions';

import { firebaseAuth } from '../config/firebaseConfig.android';
import {
  ensureAppCheckInitialized,
  getAppCheckInitStatus,
} from '../config/appCheckBootstrap';
import {
  registerReevaluateProximityNoticesInvoker,
  scheduleReevaluateProximityNotices as scheduleDebounced,
  reevaluateProximityNoticesNow as flushNow,
} from './reevaluateProximityNotices.ts';

const REGION = 'us-central1' as const;
const NAME = 'reevaluateProximityNotices';

let registered = false;

async function invoke(): Promise<void> {
  if (!firebaseAuth.currentUser) return;
  const status = await ensureAppCheckInitialized();
  if (status.status !== 'ready' && getAppCheckInitStatus().status !== 'ready') {
    return;
  }
  const callable = getFunctions(getApp(), REGION).httpsCallable(NAME);
  await callable({});
}

function ensureRegistered(): void {
  if (registered) return;
  registered = true;
  registerReevaluateProximityNoticesInvoker(invoke);
}

export function scheduleReevaluateProximityNotices(): void {
  ensureRegistered();
  scheduleDebounced();
}

export async function reevaluateProximityNoticesNow(): Promise<void> {
  ensureRegistered();
  await flushNow();
}

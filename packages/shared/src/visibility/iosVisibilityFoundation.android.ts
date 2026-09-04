/**
 * Android Visibility/Discovery callable client.
 * Uses J01 App Check + RNFirebase httpsCallable (us-central1).
 */

import { firebaseAuth } from '../config/firebaseConfig';
import {
  ensureAppCheckInitialized,
  getAppCheckInitStatus,
} from '../config/appCheckBootstrap';
import { getApp } from '@react-native-firebase/app';
import { getFunctions } from '@react-native-firebase/functions';
import {
  createVisibilityDiscoveryCallableClient,
  type VisibilityDiscoveryClient,
} from './callables';

const REGION = 'us-central1' as const;

let clientPromise: Promise<VisibilityDiscoveryClient> | null = null;

async function ensureAppCheckReady(): Promise<void> {
  const status = await ensureAppCheckInitialized();
  if (status.status === 'ready') return;
  if (status.status === 'error') {
    throw {
      code: 'functions/failed-precondition',
      message: 'App Check initialization failed.',
    };
  }
  if (getAppCheckInitStatus().status !== 'ready') {
    throw {
      code: 'functions/failed-precondition',
      message: 'App Check is not ready.',
    };
  }
}

export function getVisibilityDiscoveryClient(): Promise<VisibilityDiscoveryClient> {
  if (!clientPromise) {
    clientPromise = (async () => {
      await ensureAppCheckReady();
      const functions = getFunctions(getApp(), REGION);
      return createVisibilityDiscoveryCallableClient({
        functionsRegion: REGION,
        invoke: async (name, data) => {
          if (!firebaseAuth.currentUser) {
            throw {
              code: 'functions/unauthenticated',
              message: 'Visibility callable requires sign-in.',
            };
          }
          await ensureAppCheckReady();
          const callable = functions.httpsCallable(name);
          const result = await callable(data);
          return result.data;
        },
      });
    })().catch((err) => {
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
}

export function resetVisibilityDiscoveryClientForTests(): void {
  clientPromise = null;
}

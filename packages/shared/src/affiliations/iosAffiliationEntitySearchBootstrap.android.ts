/**
 * Android Affiliation entity search bootstrap.
 * Registers searchAffiliationEntities via App Check + RNFirebase httpsCallable.
 * No Logo.dev / fixture in production-capable env pairs.
 */

import Constants from 'expo-constants';

import { firebaseAuth } from '../config/firebaseConfig.ts';
import {
  ensureAppCheckInitialized,
  getAppCheckInitStatus,
} from '../config/appCheckBootstrap.ts';
import { getApp } from '@react-native-firebase/app';
import { getFunctions } from '@react-native-firebase/functions';
import {
  AffiliationEntitySearchClientError,
  SEARCH_AFFILIATION_ENTITIES_FUNCTION,
} from './affiliationEntitySearchContract.ts';
import {
  registerAffiliationEntitySearchCallable,
  resolveAffiliationEntitySearchProviderKindFromEnvironment,
} from './affiliationEntitySearchRuntime.ts';
import type { AffiliationEntitySearchCallable } from './firebaseAffiliationEntitySearchProvider.ts';

const REGION = 'us-central1' as const;

type Extra = Record<string, unknown>;

function readExtra(): Extra {
  return (Constants.expoConfig?.extra as Extra) ?? {};
}

function pick(name: string): string | undefined {
  const fromExtra = readExtra()?.[name];
  if (typeof fromExtra === 'string' && fromExtra.length > 0) return fromExtra;
  return undefined;
}

let started = false;

async function ensureAppCheckReady(): Promise<void> {
  const status = await ensureAppCheckInitialized();
  if (status.status === 'ready') return;
  if (status.status === 'error') {
    throw new AffiliationEntitySearchClientError(
      'FAILED_PRECONDITION',
      'App Check initialization failed.',
    );
  }
  if (getAppCheckInitStatus().status !== 'ready') {
    throw new AffiliationEntitySearchClientError(
      'FAILED_PRECONDITION',
      'App Check is not ready.',
    );
  }
}

export function startAffiliationEntitySearchBootstrap(): void {
  if (started) return;
  started = true;

  const kind = resolveAffiliationEntitySearchProviderKindFromEnvironment(
    pick('nearsyFirebaseEnv') ?? pick('EXPO_PUBLIC_NEARSY_FIREBASE_ENV'),
    pick('nearsyFirebaseProjectId') ?? pick('EXPO_PUBLIC_FIREBASE_PROJECT_ID'),
  );
  // Invalid pairs fail closed: do not register; runtime returns unavailable.
  if (kind !== 'firebase') return;

  const invoke: AffiliationEntitySearchCallable = async (name, data) => {
    if (name !== SEARCH_AFFILIATION_ENTITIES_FUNCTION) {
      throw new Error('Unsupported affiliation search function.');
    }
    const user = firebaseAuth.currentUser;
    if (!user) {
      throw new AffiliationEntitySearchClientError(
        'UNAUTHENTICATED',
        'Affiliation search requires sign-in.',
      );
    }
    await ensureAppCheckReady();
    const functions = getFunctions(getApp(), REGION);
    const callable = functions.httpsCallable(name);
    const result = await callable(data);
    return result.data;
  };

  registerAffiliationEntitySearchCallable(invoke);
}

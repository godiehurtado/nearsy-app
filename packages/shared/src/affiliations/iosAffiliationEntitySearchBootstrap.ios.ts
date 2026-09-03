/**
 * iOS composition: invoke searchAffiliationEntities with Firebase JS Auth
 * plus the existing RNFB App Check path used by LinkedIn A3.
 *
 * RNFB Auth is shimmed on iOS (Firebase JS owns sessions). RNFB
 * httpsCallable therefore cannot populate request.auth. Live search
 * uses the callable HTTP protocol on the allowlisted Firebase project.
 * Never talks to Logo.dev from the client. Never logs tokens.
 */

import Constants from 'expo-constants';

import { createAppCheckBootstrap } from '../authentication/linkedinA3/appCheck/appCheckBootstrap';
import { createNativeAppCheckPort } from '../authentication/linkedinA3/appCheck/nativeAppCheckPort';
import { resolveNearsyFirebaseEnvironment } from '../authentication/linkedinA3/environment/nearsyFirebaseEnvironment';
import { firebaseAuth } from '../config/firebaseConfig';
import {
  AffiliationEntitySearchClientError,
  SEARCH_AFFILIATION_ENTITIES_FUNCTION,
} from './affiliationEntitySearchContract';
import { invokeAffiliationSearchCallableHttp } from './affiliationCallableHttp';
import {
  registerAffiliationEntitySearchCallable,
  resolveAffiliationEntitySearchProviderKindFromEnvironment,
} from './affiliationEntitySearchRuntime';
import type { AffiliationEntitySearchCallable } from './firebaseAffiliationEntitySearchProvider';

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

let started = false;
let readyInvoke: AffiliationEntitySearchCallable | null = null;
let readyPromise: Promise<AffiliationEntitySearchCallable> | null = null;

async function buildInvoke(): Promise<AffiliationEntitySearchCallable> {
  const firebaseEnv = pick('EXPO_PUBLIC_NEARSY_FIREBASE_ENV');
  const projectId = pick('EXPO_PUBLIC_FIREBASE_PROJECT_ID');
  const kind = resolveAffiliationEntitySearchProviderKindFromEnvironment(
    firebaseEnv,
    projectId,
  );
  if (kind !== 'firebase') {
    throw new Error('Affiliation search live provider is disabled in this environment.');
  }

  const environment = resolveNearsyFirebaseEnvironment(firebaseEnv);
  const resolvedProjectId = environment.firebaseProjectId;
  if (resolvedProjectId !== 'nearsy-dev' && resolvedProjectId !== 'nearsy-pj') {
    throw new Error('Affiliation search live provider requires a known Firebase project.');
  }
  if (projectId && projectId !== resolvedProjectId) {
    throw new Error('Affiliation search live provider project mismatch.');
  }

  const { port, getNativeProjectId } = await createNativeAppCheckPort();
  const nativeProjectId = getNativeProjectId();
  if (nativeProjectId && nativeProjectId !== resolvedProjectId) {
    throw new Error('Affiliation search live provider project mismatch.');
  }

  const appCheck = createAppCheckBootstrap({ port });
  await appCheck.initialize();

  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.warn(
      `[AFFILIATION_SEARCH] bootstrap_ready provider=firebase project=${resolvedProjectId} region=us-central1 appCheck=ready`,
    );
  }

  return async (name, data) => {
    if (name !== SEARCH_AFFILIATION_ENTITIES_FUNCTION) {
      throw new Error('Unsupported affiliation search function.');
    }
    const user = firebaseAuth.currentUser;
    if (!user) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn('[AFFILIATION_SEARCH] js_session=missing');
      }
      throw new AffiliationEntitySearchClientError(
        'UNAUTHENTICATED',
        'Affiliation search requires sign-in.',
      );
    }
    appCheck.ensureReady();
    if (!port.withToken) {
      throw new AffiliationEntitySearchClientError(
        'FAILED_PRECONDITION',
        'Affiliation search is not ready.',
      );
    }
    const idToken = await user.getIdToken();
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn(
        '[AFFILIATION_SEARCH] request_start provider=firebase',
        `category=${data.categoryId}`,
        `queryLength=${String(data.query ?? '').length}`,
        `limit=${data.limit ?? 8}`,
        'jsAuth=present',
      );
    }
    const payload = await port.withToken((appCheckToken) =>
      invokeAffiliationSearchCallableHttp({
        projectId: resolvedProjectId,
        region: environment.functionsRegion,
        functionName: name,
        idToken,
        appCheckToken,
        data,
      }),
    );
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      const count = Array.isArray((payload as { results?: unknown })?.results)
        ? (payload as { results: unknown[] }).results.length
        : 0;
      console.warn(`[AFFILIATION_SEARCH] callable_ok resultsCount=${count}`);
    }
    return payload;
  };
}

async function getReadyInvoke(): Promise<AffiliationEntitySearchCallable> {
  if (readyInvoke) return readyInvoke;
  if (!readyPromise) {
    readyPromise = buildInvoke()
      .then((invoke) => {
        readyInvoke = invoke;
        return invoke;
      })
      .catch((err) => {
        readyPromise = null;
        throw err;
      });
  }
  return readyPromise;
}

/**
 * Registers a single-flight callable wrapper. Safe to call from App bootstrap
 * and from hot reload; App Check native init remains a process singleton.
 */
export function startAffiliationEntitySearchBootstrap(): void {
  if (started) return;
  started = true;

  const kind = resolveAffiliationEntitySearchProviderKindFromEnvironment(
    pick('EXPO_PUBLIC_NEARSY_FIREBASE_ENV'),
    pick('EXPO_PUBLIC_FIREBASE_PROJECT_ID'),
  );
  if (kind !== 'firebase') return;

  const invokeWhenReady: AffiliationEntitySearchCallable = async (name, data) => {
    const invoke = await getReadyInvoke();
    return invoke(name, data);
  };
  registerAffiliationEntitySearchCallable(invokeWhenReady);
}

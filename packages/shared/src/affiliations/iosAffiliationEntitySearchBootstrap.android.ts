/**
 * Android Affiliation entity search bootstrap.
 * Registers searchAffiliationEntities via explicit callable HTTP + App Check token
 * (same protocol as iOS). Avoids RNFB httpsCallable App Check attachment gaps.
 * No Logo.dev / fixture in production-capable env pairs.
 */

import Constants from 'expo-constants';

import { firebaseAuth } from '../config/firebaseConfig.ts';
import {
  ensureAppCheckInitialized,
  ensureAppCheckTokenFoundation,
  getAppCheckInitStatus,
} from '../config/appCheckBootstrap';
import {
  AffiliationEntitySearchClientError,
  SEARCH_AFFILIATION_ENTITIES_FUNCTION,
} from './affiliationEntitySearchContract.ts';
import { invokeAffiliationSearchCallableHttp } from './affiliationCallableHttp.ts';
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

function resolveProjectId(): string {
  const project =
    pick('nearsyFirebaseProjectId') ??
    pick('EXPO_PUBLIC_FIREBASE_PROJECT_ID') ??
    '';
  return project.trim().toLowerCase();
}

let started = false;

async function ensureAppCheckReady(): Promise<void> {
  const status = await ensureAppCheckInitialized();
  if (__DEV__) {
    console.warn('[AffiliationSearch.android] app_check_status', {
      status: status.status,
      cached: getAppCheckInitStatus().status,
    });
  }
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

async function getAppCheckTokenForced(): Promise<string> {
  await ensureAppCheckReady();
  await ensureAppCheckTokenFoundation();
  try {
    // Lazy require — keep Node tests free of RNFB App Check.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const appCheckModule = require('@react-native-firebase/app-check');
    const ac =
      typeof appCheckModule.getAppCheck === 'function'
        ? appCheckModule.getAppCheck()
        : appCheckModule.default();
    const getTokenFn =
      typeof ac?.getToken === 'function'
        ? (force?: boolean) => ac.getToken(force)
        : typeof appCheckModule.getToken === 'function'
          ? (force?: boolean) => appCheckModule.getToken(ac, force)
          : null;
    if (!getTokenFn) {
      if (__DEV__) {
        console.warn('[AffiliationSearch.android] app_check_getToken_missing');
      }
      throw new AffiliationEntitySearchClientError(
        'FAILED_PRECONDITION',
        'App Check getToken is unavailable.',
      );
    }
    if (typeof ac?.setTokenAutoRefreshEnabled === 'function') {
      ac.setTokenAutoRefreshEnabled(true);
    }
    let result: { token?: string } | undefined;
    try {
      result = await getTokenFn(true);
    } catch {
      if (__DEV__) {
        console.warn(
          '[AffiliationSearch.android] getToken(true) failed; retrying',
        );
      }
      result = await getTokenFn(false);
    }
    const token =
      typeof result?.token === 'string' ? result.token.trim() : '';
    if (!token) {
      if (__DEV__) {
        console.warn('[AffiliationSearch.android] app_check_token_empty');
      }
      throw new AffiliationEntitySearchClientError(
        'FAILED_PRECONDITION',
        'App Check token was empty.',
      );
    }
    if (__DEV__) {
      console.warn('[AffiliationSearch.android] app_check_token_ready', {
        tokenLength: token.length,
      });
    }
    return token;
  } catch (err) {
    if (err instanceof AffiliationEntitySearchClientError) throw err;
    if (__DEV__) {
      console.warn('[AffiliationSearch.android] app_check_token_unavailable');
    }
    throw new AffiliationEntitySearchClientError(
      'FAILED_PRECONDITION',
      'App Check token was unavailable.',
    );
  }
}

export function startAffiliationEntitySearchBootstrap(): void {
  // Always (re)register invoke so Fast Refresh replaces stale httpsCallable bindings.
  const kind = resolveAffiliationEntitySearchProviderKindFromEnvironment(
    pick('nearsyFirebaseEnv') ?? pick('EXPO_PUBLIC_NEARSY_FIREBASE_ENV'),
    pick('nearsyFirebaseProjectId') ?? pick('EXPO_PUBLIC_FIREBASE_PROJECT_ID'),
  );
  // Invalid pairs fail closed: do not register; runtime returns unavailable.
  if (kind !== 'firebase') return;

  const projectId = resolveProjectId();
  if (projectId !== 'nearsy-dev' && projectId !== 'nearsy-pj') return;

  if (__DEV__) {
    console.warn('[AffiliationSearch.android] bootstrap_register', {
      projectId,
      region: REGION,
    });
  }
  started = true;

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
    let idToken: string;
    try {
      idToken = await user.getIdToken(true);
    } catch {
      throw new AffiliationEntitySearchClientError(
        'UNAUTHENTICATED',
        'Affiliation search requires sign-in.',
      );
    }
    if (!idToken?.trim()) {
      throw new AffiliationEntitySearchClientError(
        'UNAUTHENTICATED',
        'Affiliation search requires sign-in.',
      );
    }

    if (__DEV__) {
      console.warn('[AffiliationSearch.android] id_token_ok_fetching_app_check');
    }
    const appCheckToken = await getAppCheckTokenForced();
    if (__DEV__) {
      console.warn('[AffiliationSearch.android] tokens_ready_invoking_http');
    }
    if (__DEV__) {
      console.warn('[AffiliationSearch.android] request_start', {
        projectId,
        region: REGION,
        categoryId: data.categoryId,
        queryLength: String(data.query ?? '').length,
        hasIdToken: true,
        hasAppCheckToken: true,
        appCheck: getAppCheckInitStatus().status,
      });
    }

    try {
      const payload = await invokeAffiliationSearchCallableHttp({
        projectId,
        region: REGION,
        functionName: name,
        idToken,
        appCheckToken,
        data,
      });
      if (__DEV__) {
        const count = Array.isArray((payload as { results?: unknown })?.results)
          ? (payload as { results: unknown[] }).results.length
          : 0;
        console.warn('[AffiliationSearch.android] callable_ok', {
          resultsCount: count,
        });
      }
      return payload;
    } catch (err: unknown) {
      const e = err as { code?: unknown; message?: unknown };
      if (__DEV__) {
        const msg =
          typeof e.message === 'string'
            ? e.message.replace(
                /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
                '[redacted]',
              )
            : undefined;
        console.warn('[AffiliationSearch.android] callable error', {
          name,
          code: typeof e.code === 'string' ? e.code : undefined,
          message: msg,
          hasCurrentUser: Boolean(firebaseAuth.currentUser),
          appCheck: getAppCheckInitStatus().status,
        });
      }
      throw err;
    }
  };

  registerAffiliationEntitySearchCallable(invoke);
}

// Re-register on module evaluation (covers Fast Refresh of this file).
startAffiliationEntitySearchBootstrap();

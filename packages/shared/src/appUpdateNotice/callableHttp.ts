/**
 * HTTP adapter for `getAppUpdatePolicy`.
 *
 * App Check is required. Auth is not sent (callable works on the login
 * screen). Request body is exactly `{ platform: "ios" }`.
 */

import {
  buildCloudFunctionsCallableUrl,
  FirebaseCallableHttpError,
  isFirebaseCallableHttpError,
  unwrapFirebaseCallableHttpBody,
  type InvokeFirebaseCallableHttpDeps,
} from '../firebase/callableHttp';
import {
  APP_UPDATE_NOTICE_HTTP_TIMEOUT_MS,
  APP_UPDATE_NOTICE_REGION,
  APP_UPDATE_NOTICE_REQUEST,
  GET_APP_UPDATE_POLICY,
  parseAppUpdateNoticeConfig,
  type AppUpdateNoticeConfig,
} from './contract';

export const APP_UPDATE_POLICY_PROJECTS = ['nearsy-dev', 'nearsy-pj'] as const;

export type InvokeGetAppUpdatePolicyInput = {
  projectId: string;
  region?: string;
  appCheckToken: string;
};

function isAllowedProject(
  project: string,
): project is (typeof APP_UPDATE_POLICY_PROJECTS)[number] {
  return (APP_UPDATE_POLICY_PROJECTS as readonly string[]).includes(project);
}

export function buildGetAppUpdatePolicyUrl(
  projectId: string,
  region: string,
): string {
  const project = projectId.trim().toLowerCase();
  const regionNorm = region.trim().toLowerCase();
  if (!isAllowedProject(project)) {
    throw new FirebaseCallableHttpError({
      code: 'functions/failed-precondition',
      message: 'getAppUpdatePolicy requires a known Firebase project.',
    });
  }
  if (regionNorm !== APP_UPDATE_NOTICE_REGION) {
    throw new FirebaseCallableHttpError({
      code: 'functions/failed-precondition',
      message: 'getAppUpdatePolicy requires us-central1.',
    });
  }
  return buildCloudFunctionsCallableUrl(
    project,
    regionNorm,
    GET_APP_UPDATE_POLICY,
  );
}

export async function invokeGetAppUpdatePolicyHttp(
  input: InvokeGetAppUpdatePolicyInput,
  deps: InvokeFirebaseCallableHttpDeps = {},
): Promise<unknown> {
  if (!input.appCheckToken.trim()) {
    throw new FirebaseCallableHttpError({
      code: 'functions/failed-precondition',
      message: 'App Check is not ready.',
    });
  }

  const region = (input.region?.trim() || APP_UPDATE_NOTICE_REGION).toLowerCase();
  const url = buildGetAppUpdatePolicyUrl(input.projectId, region);
  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = APP_UPDATE_NOTICE_HTTP_TIMEOUT_MS;
  const controller =
    typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer =
    controller &&
    setTimeout(() => {
      controller.abort();
    }, timeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Firebase-AppCheck': input.appCheckToken,
      },
      body: JSON.stringify({ data: { ...APP_UPDATE_NOTICE_REQUEST } }),
      signal: controller?.signal,
    });
  } catch (err) {
    if (
      err &&
      typeof err === 'object' &&
      (err as { name?: string }).name === 'AbortError'
    ) {
      throw new FirebaseCallableHttpError({
        code: 'functions/unavailable',
        message: 'Callable request timed out.',
      });
    }
    throw new FirebaseCallableHttpError({
      code: 'functions/unavailable',
      message: 'Callable network request failed.',
    });
  } finally {
    if (timer) clearTimeout(timer);
  }

  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const hasCallableError =
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      'error' in (parsed as object);
    if (hasCallableError) {
      try {
        unwrapFirebaseCallableHttpBody(parsed);
      } catch (err) {
        if (isFirebaseCallableHttpError(err)) {
          throw new FirebaseCallableHttpError({
            code: err.code,
            message: err.message,
            details: err.details,
            httpStatus: response.status,
          });
        }
      }
    }
    if (response.status === 401) {
      throw new FirebaseCallableHttpError({
        code: 'functions/unauthenticated',
        message: 'App Check is not ready.',
        httpStatus: 401,
      });
    }
    throw new FirebaseCallableHttpError({
      code: 'functions/unavailable',
      message: 'Callable is unavailable.',
      httpStatus: response.status,
    });
  }

  return unwrapFirebaseCallableHttpBody(parsed);
}

/**
 * Adapter: invoke + fail-closed parse. Throws on transport/App Check/invalid
 * payload (including unexpected store URLs) so the host omits the notice.
 */
export async function loadAppUpdatePolicy(
  input: InvokeGetAppUpdatePolicyInput,
  deps: InvokeFirebaseCallableHttpDeps = {},
): Promise<AppUpdateNoticeConfig> {
  const raw = await invokeGetAppUpdatePolicyHttp(input, deps);
  const parsed = parseAppUpdateNoticeConfig(raw);
  if (!parsed.ok) {
    throw new FirebaseCallableHttpError({
      code: 'functions/internal',
      message: 'Invalid app update policy response.',
    });
  }
  return parsed.config;
}

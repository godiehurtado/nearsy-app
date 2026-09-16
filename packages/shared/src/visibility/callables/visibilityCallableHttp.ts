/**
 * Visibility/Discovery callable HTTP protocol (pure transport helpers).
 * Composition roots attach Firebase JS Auth + App Check; domain stays unaware.
 */

import {
  buildCloudFunctionsCallableUrl,
  buildEmulatorFunctionsCallableUrl,
  invokeFirebaseCallableHttp,
  isFirebaseCallableHttpError,
  type InvokeFirebaseCallableHttpDeps,
} from '../../firebase/callableHttp';
import {
  VISIBILITY_CALLABLE_NAMES,
  type VisibilityCallableName,
} from './names';
import { VisibilityDiscoveryClientError } from './errors';

export const VISIBILITY_CALLABLE_HTTP_DEFAULT_REGION = 'us-central1' as const;

const VISIBILITY_NAME_SET = new Set<string>(
  Object.values(VISIBILITY_CALLABLE_NAMES),
);

export type VisibilityCallableHttpEndpoint = {
  url: string;
  projectId: string;
  region: string;
  functionName: VisibilityCallableName;
  mode: 'cloud' | 'emulator';
};

export type ResolveVisibilityCallableEndpointInput = {
  projectId: string;
  region?: string;
  /** development | production — must match projectId. */
  environment: 'development' | 'production';
  functionName: string;
  emulatorHost?: string;
  emulatorPort?: number;
};

export function isVisibilityCallableName(
  name: string,
): name is VisibilityCallableName {
  return VISIBILITY_NAME_SET.has(name);
}

/**
 * Build callable URL from effective config.
 * Rejects missing/inconsistent project (no silent nearsy-pj fallback).
 */
export function resolveVisibilityCallableEndpoint(
  input: ResolveVisibilityCallableEndpointInput,
): VisibilityCallableHttpEndpoint {
  const projectId = input.projectId.trim().toLowerCase();
  const region = (
    input.region?.trim() || VISIBILITY_CALLABLE_HTTP_DEFAULT_REGION
  ).toLowerCase();
  const functionName = input.functionName.trim();

  if (!projectId) {
    throw new VisibilityDiscoveryClientError({
      code: 'failed-precondition',
      reason: { kind: 'known', value: 'invalid-request' },
      retryable: false,
      message: 'Visibility callable projectId is required.',
    });
  }
  if (input.environment === 'development' && projectId !== 'nearsy-dev') {
    throw new VisibilityDiscoveryClientError({
      code: 'failed-precondition',
      reason: { kind: 'known', value: 'invalid-request' },
      retryable: false,
      message:
        'Development Visibility callables require Firebase project nearsy-dev.',
    });
  }
  if (input.environment === 'production' && projectId !== 'nearsy-pj') {
    throw new VisibilityDiscoveryClientError({
      code: 'failed-precondition',
      reason: { kind: 'known', value: 'invalid-request' },
      retryable: false,
      message:
        'Production Visibility callables require Firebase project nearsy-pj.',
    });
  }
  if (region !== VISIBILITY_CALLABLE_HTTP_DEFAULT_REGION) {
    throw new VisibilityDiscoveryClientError({
      code: 'failed-precondition',
      reason: { kind: 'known', value: 'invalid-request' },
      retryable: false,
      message: 'Visibility callables require us-central1.',
    });
  }
  if (!isVisibilityCallableName(functionName)) {
    throw new VisibilityDiscoveryClientError({
      code: 'invalid-argument',
      reason: { kind: 'known', value: 'invalid-request' },
      retryable: false,
      message: 'Unsupported Visibility callable name.',
    });
  }

  const emulatorHost = input.emulatorHost?.trim();
  const emulatorPort = input.emulatorPort;
  if (emulatorHost) {
    if (
      emulatorPort === undefined ||
      !Number.isFinite(emulatorPort) ||
      emulatorPort <= 0
    ) {
      throw new VisibilityDiscoveryClientError({
        code: 'failed-precondition',
        reason: { kind: 'known', value: 'invalid-request' },
        retryable: false,
        message: 'Visibility emulator host requires a valid port.',
      });
    }
    if (input.environment === 'production') {
      throw new VisibilityDiscoveryClientError({
        code: 'failed-precondition',
        reason: { kind: 'known', value: 'invalid-request' },
        retryable: false,
        message: 'Visibility emulator must not use production configuration.',
      });
    }
    return {
      url: buildEmulatorFunctionsCallableUrl(
        emulatorHost,
        emulatorPort,
        projectId,
        region,
        functionName,
      ),
      projectId,
      region,
      functionName,
      mode: 'emulator',
    };
  }

  return {
    url: buildCloudFunctionsCallableUrl(projectId, region, functionName),
    projectId,
    region,
    functionName,
    mode: 'cloud',
  };
}

export type InvokeVisibilityCallableHttpInput = {
  projectId: string;
  region?: string;
  environment: 'development' | 'production';
  functionName: string;
  idToken: string;
  appCheckToken: string;
  data: Record<string, unknown>;
  emulatorHost?: string;
  emulatorPort?: number;
  timeoutMs?: number;
};

export type InvokeVisibilityCallableHttpDeps = InvokeFirebaseCallableHttpDeps;

function toTransportError(err: unknown): never {
  if (err instanceof VisibilityDiscoveryClientError) throw err;
  if (isFirebaseCallableHttpError(err)) {
    throw {
      code: err.code,
      // Never forward raw server messages (may echo tokens).
      message: 'Visibility callable failed.',
      details: err.details,
    };
  }
  throw {
    code: 'functions/unavailable',
    message: 'Visibility callable network request failed.',
  };
}

/**
 * POST callable HTTP with JS Auth + App Check headers.
 * Returns the unwrapped `result` payload for the Visibility adapter/parsers.
 */
export async function invokeVisibilityCallableHttp(
  input: InvokeVisibilityCallableHttpInput,
  deps: InvokeVisibilityCallableHttpDeps = {},
): Promise<unknown> {
  if (!input.idToken.trim()) {
    throw {
      code: 'functions/unauthenticated',
      message: 'Visibility callable requires sign-in.',
    };
  }
  if (!input.appCheckToken.trim()) {
    throw {
      code: 'functions/failed-precondition',
      message: 'Visibility callable App Check is not ready.',
    };
  }

  const endpoint = resolveVisibilityCallableEndpoint({
    projectId: input.projectId,
    region: input.region,
    environment: input.environment,
    functionName: input.functionName,
    emulatorHost: input.emulatorHost,
    emulatorPort: input.emulatorPort,
  });

  try {
    return await invokeFirebaseCallableHttp(
      {
        url: endpoint.url,
        idToken: input.idToken,
        appCheckToken: input.appCheckToken,
        data: input.data,
        timeoutMs: input.timeoutMs,
      },
      deps,
    );
  } catch (err) {
    toTransportError(err);
  }
}

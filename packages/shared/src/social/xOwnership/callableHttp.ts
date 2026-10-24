import {
  buildCloudFunctionsCallableUrl,
  invokeFirebaseCallableHttp,
  isFirebaseCallableHttpError,
  type InvokeFirebaseCallableHttpDeps,
} from '../../firebase/callableHttp';
import { mapXOwnershipThrowable } from './errors';
import {
  X_OWNERSHIP_CALLABLE_NAMES,
  type XOwnershipCallableName,
} from './names';

export const X_OWNERSHIP_CALLABLE_HTTP_REGION = 'us-central1' as const;

const NAME_SET = new Set<string>(Object.values(X_OWNERSHIP_CALLABLE_NAMES));

export function isXOwnershipCallableName(
  name: string,
): name is XOwnershipCallableName {
  return NAME_SET.has(name);
}

export type InvokeXOwnershipCallableHttpInput = {
  projectId: string;
  region?: string;
  environment: 'development' | 'production';
  functionName: string;
  idToken: string;
  appCheckToken: string;
  data: Record<string, unknown>;
  timeoutMs?: number;
};

export async function invokeXOwnershipCallableHttp(
  input: InvokeXOwnershipCallableHttpInput,
  deps: InvokeFirebaseCallableHttpDeps = {},
): Promise<unknown> {
  if (!input.idToken.trim()) {
    throw mapXOwnershipThrowable({
      code: 'unauthenticated',
      message: 'Auth required.',
    });
  }
  if (!input.appCheckToken.trim()) {
    throw mapXOwnershipThrowable({
      code: 'functions/failed-precondition',
      message: 'App Check is not ready.',
    });
  }

  const projectId = input.projectId.trim().toLowerCase();
  const region = (
    input.region?.trim() || X_OWNERSHIP_CALLABLE_HTTP_REGION
  ).toLowerCase();
  const functionName = input.functionName.trim();

  if (input.environment === 'development' && projectId !== 'nearsy-dev') {
    throw mapXOwnershipThrowable({
      code: 'functions/failed-precondition',
      message: 'Development X ownership requires nearsy-dev.',
    });
  }
  if (input.environment === 'production' && projectId !== 'nearsy-pj') {
    throw mapXOwnershipThrowable({
      code: 'functions/failed-precondition',
      message: 'Production X ownership requires nearsy-pj.',
    });
  }
  if (region !== X_OWNERSHIP_CALLABLE_HTTP_REGION) {
    throw mapXOwnershipThrowable({
      code: 'functions/failed-precondition',
      message: 'us-central1 required.',
    });
  }
  if (!isXOwnershipCallableName(functionName)) {
    throw mapXOwnershipThrowable({
      code: 'functions/invalid-argument',
      message: 'Unsupported X ownership function.',
    });
  }

  try {
    return await invokeFirebaseCallableHttp(
      {
        url: buildCloudFunctionsCallableUrl(projectId, region, functionName),
        idToken: input.idToken,
        appCheckToken: input.appCheckToken,
        data: input.data,
        timeoutMs: input.timeoutMs,
      },
      deps,
    );
  } catch (err) {
    if (isFirebaseCallableHttpError(err)) {
      throw mapXOwnershipThrowable(err);
    }
    throw mapXOwnershipThrowable(err);
  }
}

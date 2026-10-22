import {
  buildCloudFunctionsCallableUrl,
  invokeFirebaseCallableHttp,
  isFirebaseCallableHttpError,
  type InvokeFirebaseCallableHttpDeps,
} from '../../firebase/callableHttp';
import { mapInstagramOwnershipThrowable } from './errors';
import {
  INSTAGRAM_OWNERSHIP_CALLABLE_NAMES,
  type InstagramOwnershipCallableName,
} from './names';

export const INSTAGRAM_OWNERSHIP_CALLABLE_HTTP_REGION = 'us-central1' as const;

const NAME_SET = new Set<string>(
  Object.values(INSTAGRAM_OWNERSHIP_CALLABLE_NAMES),
);

export function isInstagramOwnershipCallableName(
  name: string,
): name is InstagramOwnershipCallableName {
  return NAME_SET.has(name);
}

export type InvokeInstagramOwnershipCallableHttpInput = {
  projectId: string;
  region?: string;
  environment: 'development' | 'production';
  functionName: string;
  idToken: string;
  appCheckToken: string;
  data: Record<string, unknown>;
  timeoutMs?: number;
};

export async function invokeInstagramOwnershipCallableHttp(
  input: InvokeInstagramOwnershipCallableHttpInput,
  deps: InvokeFirebaseCallableHttpDeps = {},
): Promise<unknown> {
  if (!input.idToken.trim()) {
    throw mapInstagramOwnershipThrowable({
      code: 'unauthenticated',
      message: 'Auth required.',
    });
  }
  if (!input.appCheckToken.trim()) {
    throw mapInstagramOwnershipThrowable({
      code: 'functions/failed-precondition',
      message: 'App Check is not ready.',
    });
  }

  const projectId = input.projectId.trim().toLowerCase();
  const region = (
    input.region?.trim() || INSTAGRAM_OWNERSHIP_CALLABLE_HTTP_REGION
  ).toLowerCase();
  const functionName = input.functionName.trim();

  if (input.environment === 'development' && projectId !== 'nearsy-dev') {
    throw mapInstagramOwnershipThrowable({
      code: 'functions/failed-precondition',
      message: 'Development Instagram ownership requires nearsy-dev.',
    });
  }
  if (input.environment === 'production' && projectId !== 'nearsy-pj') {
    throw mapInstagramOwnershipThrowable({
      code: 'functions/failed-precondition',
      message: 'Production Instagram ownership requires nearsy-pj.',
    });
  }
  if (region !== INSTAGRAM_OWNERSHIP_CALLABLE_HTTP_REGION) {
    throw mapInstagramOwnershipThrowable({
      code: 'functions/failed-precondition',
      message: 'us-central1 required.',
    });
  }
  if (!isInstagramOwnershipCallableName(functionName)) {
    throw mapInstagramOwnershipThrowable({
      code: 'functions/invalid-argument',
      message: 'Unsupported Instagram ownership function.',
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
      throw mapInstagramOwnershipThrowable(err);
    }
    throw mapInstagramOwnershipThrowable(err);
  }
}

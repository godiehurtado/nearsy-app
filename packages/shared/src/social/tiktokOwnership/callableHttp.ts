import {
  buildCloudFunctionsCallableUrl,
  invokeFirebaseCallableHttp,
  isFirebaseCallableHttpError,
  type InvokeFirebaseCallableHttpDeps,
} from '../../firebase/callableHttp';
import { mapTiktokOwnershipThrowable } from './errors';
import {
  TIKTOK_OWNERSHIP_CALLABLE_NAMES,
  type TiktokOwnershipCallableName,
} from './names';

export const TIKTOK_OWNERSHIP_CALLABLE_HTTP_REGION = 'us-central1' as const;

const NAME_SET = new Set<string>(Object.values(TIKTOK_OWNERSHIP_CALLABLE_NAMES));

export function isTiktokOwnershipCallableName(
  name: string,
): name is TiktokOwnershipCallableName {
  return NAME_SET.has(name);
}

export type InvokeTiktokOwnershipCallableHttpInput = {
  projectId: string;
  region?: string;
  environment: 'development' | 'production';
  functionName: string;
  idToken: string;
  appCheckToken: string;
  data: Record<string, unknown>;
  timeoutMs?: number;
};

export async function invokeTiktokOwnershipCallableHttp(
  input: InvokeTiktokOwnershipCallableHttpInput,
  deps: InvokeFirebaseCallableHttpDeps = {},
): Promise<unknown> {
  if (!input.idToken.trim()) {
    throw mapTiktokOwnershipThrowable({
      code: 'unauthenticated',
      message: 'Auth required.',
    });
  }
  if (!input.appCheckToken.trim()) {
    throw mapTiktokOwnershipThrowable({
      code: 'functions/failed-precondition',
      message: 'App Check is not ready.',
    });
  }

  const projectId = input.projectId.trim().toLowerCase();
  const region = (
    input.region?.trim() || TIKTOK_OWNERSHIP_CALLABLE_HTTP_REGION
  ).toLowerCase();
  const functionName = input.functionName.trim();

  if (input.environment === 'development' && projectId !== 'nearsy-dev') {
    throw mapTiktokOwnershipThrowable({
      code: 'functions/failed-precondition',
      message: 'Development TikTok ownership requires nearsy-dev.',
    });
  }
  if (input.environment === 'production' && projectId !== 'nearsy-pj') {
    throw mapTiktokOwnershipThrowable({
      code: 'functions/failed-precondition',
      message: 'Production TikTok ownership requires nearsy-pj.',
    });
  }
  if (region !== TIKTOK_OWNERSHIP_CALLABLE_HTTP_REGION) {
    throw mapTiktokOwnershipThrowable({
      code: 'functions/failed-precondition',
      message: 'us-central1 required.',
    });
  }
  if (!isTiktokOwnershipCallableName(functionName)) {
    throw mapTiktokOwnershipThrowable({
      code: 'functions/invalid-argument',
      message: 'Unsupported TikTok ownership function.',
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
      throw mapTiktokOwnershipThrowable(err);
    }
    throw mapTiktokOwnershipThrowable(err);
  }
}

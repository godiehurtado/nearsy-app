import {
  buildCloudFunctionsCallableUrl,
  invokeFirebaseCallableHttp,
  isFirebaseCallableHttpError,
  type InvokeFirebaseCallableHttpDeps,
} from '../../firebase/callableHttp';
import { mapYoutubeOwnershipThrowable } from './errors';
import {
  YOUTUBE_OWNERSHIP_CALLABLE_NAMES,
  type YoutubeOwnershipCallableName,
} from './names';

export const YOUTUBE_OWNERSHIP_CALLABLE_HTTP_REGION = 'us-central1' as const;

const NAME_SET = new Set<string>(Object.values(YOUTUBE_OWNERSHIP_CALLABLE_NAMES));

export function isYoutubeOwnershipCallableName(
  name: string,
): name is YoutubeOwnershipCallableName {
  return NAME_SET.has(name);
}

export type InvokeYoutubeOwnershipCallableHttpInput = {
  projectId: string;
  region?: string;
  environment: 'development' | 'production';
  functionName: string;
  idToken: string;
  appCheckToken: string;
  data: Record<string, unknown>;
  timeoutMs?: number;
};

export async function invokeYoutubeOwnershipCallableHttp(
  input: InvokeYoutubeOwnershipCallableHttpInput,
  deps: InvokeFirebaseCallableHttpDeps = {},
): Promise<unknown> {
  if (!input.idToken.trim()) {
    throw mapYoutubeOwnershipThrowable({
      code: 'unauthenticated',
      message: 'Auth required.',
    });
  }
  if (!input.appCheckToken.trim()) {
    throw mapYoutubeOwnershipThrowable({
      code: 'functions/failed-precondition',
      message: 'App Check is not ready.',
    });
  }

  const projectId = input.projectId.trim().toLowerCase();
  const region = (
    input.region?.trim() || YOUTUBE_OWNERSHIP_CALLABLE_HTTP_REGION
  ).toLowerCase();
  const functionName = input.functionName.trim();

  if (input.environment === 'development' && projectId !== 'nearsy-dev') {
    throw mapYoutubeOwnershipThrowable({
      code: 'functions/failed-precondition',
      message: 'Development YouTube ownership requires nearsy-dev.',
    });
  }
  if (input.environment === 'production' && projectId !== 'nearsy-pj') {
    throw mapYoutubeOwnershipThrowable({
      code: 'functions/failed-precondition',
      message: 'Production YouTube ownership requires nearsy-pj.',
    });
  }
  if (region !== YOUTUBE_OWNERSHIP_CALLABLE_HTTP_REGION) {
    throw mapYoutubeOwnershipThrowable({
      code: 'functions/failed-precondition',
      message: 'us-central1 required.',
    });
  }
  if (!isYoutubeOwnershipCallableName(functionName)) {
    throw mapYoutubeOwnershipThrowable({
      code: 'functions/invalid-argument',
      message: 'Unsupported YouTube ownership function.',
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
      throw mapYoutubeOwnershipThrowable(err);
    }
    throw mapYoutubeOwnershipThrowable(err);
  }
}

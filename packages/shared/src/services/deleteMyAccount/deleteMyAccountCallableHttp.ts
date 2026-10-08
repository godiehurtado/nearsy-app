/**
 * `deleteMyAccount` callable HTTP transport (Firebase JS ID token + App Check).
 */

import {
  buildCloudFunctionsCallableUrl,
  buildEmulatorFunctionsCallableUrl,
  invokeFirebaseCallableHttp,
  type InvokeFirebaseCallableHttpDeps,
} from '../../firebase/callableHttp';
import {
  DELETE_MY_ACCOUNT_CALLABLE_NAME,
  DELETE_MY_ACCOUNT_HTTP_TIMEOUT_MS,
  DELETE_MY_ACCOUNT_REGION,
  DeleteMyAccountError,
  mapDeleteMyAccountFailure,
  parseDeleteMyAccountResponse,
  type DeleteMyAccountSuccess,
} from './contract';

export type ResolveDeleteMyAccountEndpointInput = {
  projectId: string;
  region?: string;
  emulatorHost?: string;
  emulatorPort?: number;
};

export function resolveDeleteMyAccountEndpoint(
  input: ResolveDeleteMyAccountEndpointInput,
): string {
  const projectId = input.projectId.trim().toLowerCase();
  const region = (input.region?.trim() || DELETE_MY_ACCOUNT_REGION).toLowerCase();
  if (!projectId || region !== DELETE_MY_ACCOUNT_REGION) {
    throw new DeleteMyAccountError('UNKNOWN', false);
  }
  const emulatorHost = input.emulatorHost?.trim();
  if (emulatorHost) {
    if (!input.emulatorPort || input.emulatorPort <= 0) {
      throw new DeleteMyAccountError('UNKNOWN', false);
    }
    return buildEmulatorFunctionsCallableUrl(
      emulatorHost,
      input.emulatorPort,
      projectId,
      region,
      DELETE_MY_ACCOUNT_CALLABLE_NAME,
    );
  }
  return buildCloudFunctionsCallableUrl(projectId, region, DELETE_MY_ACCOUNT_CALLABLE_NAME);
}

export type InvokeDeleteMyAccountHttpInput = ResolveDeleteMyAccountEndpointInput & {
  idToken: string;
  appCheckToken: string;
};

/** Sends exactly `{ "data": {} }`: the callable rejects any parameter. */
export async function invokeDeleteMyAccountHttp(
  input: InvokeDeleteMyAccountHttpInput,
  deps: InvokeFirebaseCallableHttpDeps = {},
): Promise<DeleteMyAccountSuccess> {
  if (!input.idToken.trim()) {
    throw new DeleteMyAccountError('UNAUTHENTICATED', false);
  }
  if (!input.appCheckToken.trim()) {
    throw new DeleteMyAccountError('APP_CHECK', false);
  }
  const url = resolveDeleteMyAccountEndpoint(input);

  let result: unknown;
  try {
    result = await invokeFirebaseCallableHttp(
      {
        url,
        idToken: input.idToken,
        appCheckToken: input.appCheckToken,
        data: {},
        timeoutMs: DELETE_MY_ACCOUNT_HTTP_TIMEOUT_MS,
      },
      deps,
    );
  } catch (err) {
    throw mapDeleteMyAccountFailure(err);
  }
  return parseDeleteMyAccountResponse(result);
}

/**
 * Phone OTP callable HTTP transport.
 */

import {
  buildCloudFunctionsCallableUrl,
  buildEmulatorFunctionsCallableUrl,
  invokeFirebaseCallableHttp,
  isFirebaseCallableHttpError,
  type InvokeFirebaseCallableHttpDeps,
} from '../../firebase/callableHttp';
import { PHONE_OTP_CALLABLE_NAMES, type PhoneOtpCallableName } from './names';
import { mapTransportThrowable } from './errors';

export const PHONE_OTP_CALLABLE_HTTP_REGION = 'us-central1' as const;

const NAME_SET = new Set<string>(Object.values(PHONE_OTP_CALLABLE_NAMES));

export function isPhoneOtpCallableName(name: string): name is PhoneOtpCallableName {
  return NAME_SET.has(name);
}

export type InvokePhoneOtpCallableHttpInput = {
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

export type PhoneOtpCallableHttpDeps = InvokeFirebaseCallableHttpDeps;

export function resolvePhoneOtpCallableEndpoint(input: {
  projectId: string;
  region?: string;
  environment: 'development' | 'production';
  functionName: string;
  emulatorHost?: string;
  emulatorPort?: number;
}): { url: string; mode: 'cloud' | 'emulator' } {
  const projectId = input.projectId.trim().toLowerCase();
  const region = (input.region?.trim() || PHONE_OTP_CALLABLE_HTTP_REGION).toLowerCase();
  const functionName = input.functionName.trim();

  if (!projectId) {
    throw { code: 'functions/failed-precondition', message: 'projectId required.' };
  }
  if (!isPhoneOtpCallableName(functionName)) {
    throw { code: 'functions/invalid-argument', message: 'Unsupported function.' };
  }
  if (region !== PHONE_OTP_CALLABLE_HTTP_REGION) {
    throw { code: 'functions/failed-precondition', message: 'us-central1 required.' };
  }

  const emulatorHost = input.emulatorHost?.trim();
  const emulatorPort = input.emulatorPort;
  if (emulatorHost) {
    if (!emulatorPort || emulatorPort <= 0) {
      throw { code: 'functions/failed-precondition', message: 'emulator port required.' };
    }
    return {
      url: buildEmulatorFunctionsCallableUrl(
        emulatorHost,
        emulatorPort,
        projectId,
        region,
        functionName,
      ),
      mode: 'emulator',
    };
  }

  return {
    url: buildCloudFunctionsCallableUrl(projectId, region, functionName),
    mode: 'cloud',
  };
}

export async function invokePhoneOtpCallableHttp(
  input: InvokePhoneOtpCallableHttpInput,
  deps: PhoneOtpCallableHttpDeps = {},
): Promise<unknown> {
  if (!input.idToken.trim()) {
    throw { code: 'functions/unauthenticated', message: 'Auth required.' };
  }
  if (!input.appCheckToken.trim()) {
    throw {
      code: 'functions/failed-precondition',
      message: 'App Check is not ready.',
    };
  }

  const endpoint = resolvePhoneOtpCallableEndpoint({
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
    if (isFirebaseCallableHttpError(err)) {
      mapTransportThrowable(err);
    }
    mapTransportThrowable(err);
  }
}

/**
 * Identity Contacts HMAC callable HTTP (codebase nearsy-identity, us-central1).
 * Same JS Auth + App Check transport as Visibility / Phone OTP.
 */

import {
  buildCloudFunctionsCallableUrl,
  buildEmulatorFunctionsCallableUrl,
  invokeFirebaseCallableHttp,
  isFirebaseCallableHttpError,
  type InvokeFirebaseCallableHttpDeps,
} from '../firebase/callableHttp';
import { CONTACTS_HMAC_CALLABLE_NAMES, type ContactsHmacCallableName } from './domain';
import {
  ContactsHmacClientError,
  parseContactsHmacFailReason,
} from './errors';

export const CONTACTS_HMAC_HTTP_DEFAULT_REGION = 'us-central1' as const;

const NAME_SET = new Set<string>(Object.values(CONTACTS_HMAC_CALLABLE_NAMES));

export function isContactsHmacCallableName(
  name: string,
): name is ContactsHmacCallableName {
  return NAME_SET.has(name);
}

export type ResolveContactsHmacEndpointInput = {
  projectId: string;
  region?: string;
  environment: 'development' | 'production';
  functionName: string;
  emulatorHost?: string;
  emulatorPort?: number;
};

export function resolveContactsHmacCallableEndpoint(
  input: ResolveContactsHmacEndpointInput,
): { url: string; projectId: string; region: string; functionName: string } {
  const projectId = input.projectId.trim().toLowerCase();
  const region = (
    input.region?.trim() || CONTACTS_HMAC_HTTP_DEFAULT_REGION
  ).toLowerCase();
  const functionName = input.functionName.trim();

  if (!projectId) {
    throw new ContactsHmacClientError(
      'contacts-invalid-response',
      'Contacts Identity projectId is required.',
    );
  }
  if (input.environment === 'development' && projectId !== 'nearsy-dev') {
    throw new ContactsHmacClientError(
      'contacts-invalid-response',
      'Development Contacts Identity requires Firebase project nearsy-dev.',
    );
  }
  if (input.environment === 'production' && projectId !== 'nearsy-pj') {
    throw new ContactsHmacClientError(
      'contacts-invalid-response',
      'Production Contacts Identity requires Firebase project nearsy-pj.',
    );
  }
  if (region !== CONTACTS_HMAC_HTTP_DEFAULT_REGION) {
    throw new ContactsHmacClientError(
      'contacts-invalid-response',
      'Contacts Identity callables require us-central1.',
    );
  }
  if (!isContactsHmacCallableName(functionName)) {
    throw new ContactsHmacClientError(
      'contacts-invalid-response',
      'Unsupported Contacts Identity callable name.',
    );
  }

  const emulatorHost = input.emulatorHost?.trim();
  if (emulatorHost) {
    const emulatorPort = input.emulatorPort;
    if (
      emulatorPort === undefined ||
      !Number.isFinite(emulatorPort) ||
      emulatorPort <= 0
    ) {
      throw new ContactsHmacClientError(
        'contacts-invalid-response',
        'Contacts Identity emulator host requires a valid port.',
      );
    }
    if (input.environment === 'production') {
      throw new ContactsHmacClientError(
        'contacts-invalid-response',
        'Contacts Identity emulator must not use production configuration.',
      );
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
    };
  }

  return {
    url: buildCloudFunctionsCallableUrl(projectId, region, functionName),
    projectId,
    region,
    functionName,
  };
}

export type InvokeContactsHmacCallableHttpInput = {
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

function toTransportError(err: unknown): never {
  if (err instanceof ContactsHmacClientError) throw err;
  const reason = parseContactsHmacFailReason(err);
  if (reason) {
    throw new ContactsHmacClientError(
      reason,
      'Contacts Identity callable failed.',
      reason === 'contacts-rate-limited' || reason === 'contacts-hmac-unavailable',
    );
  }
  if (isFirebaseCallableHttpError(err)) {
    throw new ContactsHmacClientError(
      parseContactsHmacFailReason(err) ?? 'contacts-invalid-response',
      'Contacts Identity callable failed.',
    );
  }
  throw new ContactsHmacClientError(
    'contacts-hmac-unavailable',
    'Contacts Identity network request failed.',
    true,
  );
}

export async function invokeContactsHmacCallableHttp(
  input: InvokeContactsHmacCallableHttpInput,
  deps: InvokeFirebaseCallableHttpDeps = {},
): Promise<unknown> {
  if (!input.idToken.trim()) {
    throw new ContactsHmacClientError(
      'contacts-unauthenticated',
      'Contacts Identity requires sign-in.',
    );
  }
  if (!input.appCheckToken.trim()) {
    throw new ContactsHmacClientError(
      'contacts-hmac-unavailable',
      'Contacts Identity App Check is not ready.',
    );
  }

  const endpoint = resolveContactsHmacCallableEndpoint({
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

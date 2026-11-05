/**
 * Composes the Identity Contacts client: JS Auth ID token + native App Check
 * over callable HTTP. Native and config dependencies are injected so failures
 * before the request can be tested without a device.
 */

import {
  createAppCheckBootstrap,
  type AppCheckBootstrapPort,
} from '../authentication/linkedinA3/appCheck/appCheckBootstrap';
import { createContactsHmacCallableClient } from './adapter';
import { invokeContactsHmacCallableHttp } from './contactsCallableHttp';
import {
  createTracedFetch,
  NOOP_CONTACTS_TRACE,
  tagContactsFailureStage,
  traceAppCheckPort,
  type ContactsDiagnosticStage,
  type ContactsOperationTrace,
} from './contactsDiagnostics';
import { ContactsHmacClientError } from './errors';
import type { ContactsHmacClient } from './port';

export type ContactsClientCompositionDeps = {
  resolveEnvironment: () => {
    environment: 'development' | 'production';
    firebaseProjectId: string;
    region: string;
    emulatorHost?: string;
    emulatorPort?: number;
  };
  readJsProjectId: () => string;
  createNativeAppCheckPort: () => Promise<{
    port: AppCheckBootstrapPort;
    getNativeProjectId: () => string;
  }>;
  getCurrentUser: () => { getIdToken: () => Promise<string> } | null;
  fetchImpl?: typeof fetch;
};

type Composition = {
  environment: 'development' | 'production';
  projectId: string;
  region: string;
  emulatorHost?: string;
  emulatorPort?: number;
  port: AppCheckBootstrapPort;
  appCheck: ReturnType<typeof createAppCheckBootstrap>;
};

export function createContactsClientComposer(deps: ContactsClientCompositionDeps) {
  let compositionPromise: Promise<Composition> | null = null;

  const compose = async (): Promise<Composition> => {
    let stage: ContactsDiagnosticStage = 'env_config';
    try {
      const environment = deps.resolveEnvironment();

      stage = 'project_js';
      const projectId = deps.readJsProjectId();
      if (projectId !== environment.firebaseProjectId) {
        throw new ContactsHmacClientError(
          'contacts-hmac-unavailable',
          'Contacts Identity projectId does not match the configured Firebase environment.',
        );
      }

      stage = 'native_port';
      const { port, getNativeProjectId } = await deps.createNativeAppCheckPort();

      stage = 'project_native';
      const nativeProjectId = getNativeProjectId();
      if (nativeProjectId && nativeProjectId !== projectId) {
        throw new ContactsHmacClientError(
          'contacts-hmac-unavailable',
          'Contacts Identity native projectId does not match JS Firebase project.',
        );
      }

      const appCheck = createAppCheckBootstrap({
        port: traceAppCheckPort(port, (next) => {
          stage = next;
        }),
      });
      await appCheck.initialize();

      return {
        environment: environment.environment,
        projectId,
        region: environment.region,
        emulatorHost: environment.emulatorHost,
        emulatorPort: environment.emulatorPort,
        port,
        appCheck,
      };
    } catch (err) {
      tagContactsFailureStage(err, stage);
      throw err;
    }
  };

  const getComposition = (): Promise<Composition> => {
    if (!compositionPromise) {
      compositionPromise = compose().catch((err) => {
        compositionPromise = null;
        throw err;
      });
    }
    return compositionPromise;
  };

  const invoke = async (
    composition: Composition,
    trace: ContactsOperationTrace,
    name: string,
    data: Record<string, unknown>,
  ): Promise<unknown> => {
    const { appCheck, port } = composition;
    trace.enter('auth_token');
    try {
      const user = deps.getCurrentUser();
      if (!user) {
        throw new ContactsHmacClientError(
          'contacts-unauthenticated',
          'Contacts Identity requires sign-in.',
        );
      }
      trace.enter('app_check_token');
      appCheck.ensureReady();
      if (!port.withToken) {
        throw new ContactsHmacClientError(
          'contacts-hmac-unavailable',
          'Contacts Identity App Check is not ready.',
        );
      }
      trace.enter('auth_token');
      const idToken = await user.getIdToken();
      trace.enter('app_check_token');
      return await port.withToken((appCheckToken) => {
        trace.enter('endpoint');
        return invokeContactsHmacCallableHttp(
          {
            projectId: composition.projectId,
            region: composition.region,
            environment: composition.environment,
            functionName: name,
            idToken,
            appCheckToken,
            data,
            emulatorHost: composition.emulatorHost,
            emulatorPort: composition.emulatorHost
              ? composition.emulatorPort
              : undefined,
          },
          {
            fetchImpl: createTracedFetch(trace, (url, init) =>
              (deps.fetchImpl ?? fetch)(url, init),
            ),
          },
        );
      });
    } catch (err) {
      trace.fail(err);
      throw err;
    }
  };

  return {
    /** Each operation gets its own client, so its trace never mixes with another's. */
    async getClient(
      trace: ContactsOperationTrace = NOOP_CONTACTS_TRACE,
    ): Promise<ContactsHmacClient> {
      trace.enter('env_config');
      let composition: Composition;
      try {
        composition = await getComposition();
      } catch (err) {
        trace.fail(err);
        throw err;
      }
      return createContactsHmacCallableClient({
        invoke: (name, data) => invoke(composition, trace, name, data),
      });
    },
    reset(): void {
      compositionPromise = null;
    },
  };
}

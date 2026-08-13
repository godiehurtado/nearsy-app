/**
 * iOS composition root for LinkedIn A3 I1 foundation.
 * Does not open OAuth, Exchange, or signInWithCustomToken.
 */

import Constants from 'expo-constants';

import { createAppCheckBootstrap } from './appCheck/appCheckBootstrap';
import { createNativeAppCheckPort } from './appCheck/nativeAppCheckPort';
import { resolveNearsyFirebaseEnvironment } from './environment/nearsyFirebaseEnvironment';
import { createLinkedInA3CallableClient } from './functions/linkedInA3CallableClient';
import { LinkedInA3ClientError } from './sanitize';

type Extra = Record<string, unknown>;

function readExtra(): Extra {
  return (
    (Constants.expoConfig?.extra as Extra) ??
    ((Constants as { manifest2?: { extra?: Extra } }).manifest2?.extra as Extra) ??
    {}
  );
}

function pick(name: string): string | undefined {
  const extra = readExtra();
  const fromExtra = extra?.[name];
  if (typeof fromExtra === 'string' && fromExtra.length > 0) return fromExtra;
  const fromProcess = process.env[name];
  if (typeof fromProcess === 'string' && fromProcess.length > 0) {
    return fromProcess;
  }
  return undefined;
}

let clientPromise: Promise<ReturnType<typeof createLinkedInA3CallableClient>> | null =
  null;
let appCheckBootstrap: ReturnType<typeof createAppCheckBootstrap> | null = null;

export function getLinkedInA3AppCheckState() {
  return appCheckBootstrap?.getState() ?? 'not_initialized';
}

/**
 * Lazily builds the A3 client after App Check is ready.
 * Safe to call multiple times (single-flight).
 */
export function getLinkedInA3CallableClient(): Promise<
  ReturnType<typeof createLinkedInA3CallableClient>
> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const environment = resolveNearsyFirebaseEnvironment(
        pick('EXPO_PUBLIC_NEARSY_FIREBASE_ENV'),
      );

      if (!environment.linkedInAuthEnabled) {
        throw new LinkedInA3ClientError(
          'LINKEDIN_DISABLED',
          'LinkedIn authentication is disabled in this environment.',
        );
      }

      const { port, getNativeProjectId } = await createNativeAppCheckPort();
      appCheckBootstrap = createAppCheckBootstrap({ port });
      await appCheckBootstrap.initialize();

      const functionsMod = await import('@react-native-firebase/functions');
      const appMod = await import('@react-native-firebase/app');
      const getApp = appMod.getApp as () => unknown;
      const getFunctions = functionsMod.getFunctions as (
        app: unknown,
        region: string,
      ) => unknown;
      const httpsCallable = functionsMod.httpsCallable as (
        functions: unknown,
        name: string,
      ) => (data: Record<string, unknown>) => Promise<{ data: unknown }>;

      const functions = getFunctions(
        getApp(),
        environment.functionsRegion,
      );

      return createLinkedInA3CallableClient({
        environment,
        appCheck: appCheckBootstrap,
        getNativeProjectId,
        getJsProjectId: () => pick('EXPO_PUBLIC_FIREBASE_PROJECT_ID') ?? '',
        invoke: async (name, data) => {
          const callable = httpsCallable(functions, name);
          const response = await callable(data);
          return response?.data;
        },
      });
    })().catch((err) => {
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
}

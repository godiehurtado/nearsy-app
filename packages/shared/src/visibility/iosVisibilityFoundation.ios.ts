/**
 * iOS composition root for Visibility/Discovery callables.
 * Mirrors LinkedIn A3 RNFB httpsCallable wiring (us-central1).
 * Emulator: set EXPO_PUBLIC_FUNCTIONS_EMULATOR_HOST (+ optional PORT).
 */

import Constants from 'expo-constants';

import {
  createVisibilityDiscoveryCallableClient,
  type VisibilityDiscoveryClient,
} from './callables';

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

const DEFAULT_REGION = 'us-central1';

let clientPromise: Promise<VisibilityDiscoveryClient> | null = null;

/**
 * Lazily builds the Visibility discovery client (single-flight).
 * Does not hit production unless Functions are deployed to the app's Firebase project.
 */
export function getVisibilityDiscoveryClient(): Promise<VisibilityDiscoveryClient> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const region = pick('EXPO_PUBLIC_FUNCTIONS_REGION') ?? DEFAULT_REGION;
      const emulatorHost = pick('EXPO_PUBLIC_FUNCTIONS_EMULATOR_HOST');
      const emulatorPortRaw = pick('EXPO_PUBLIC_FUNCTIONS_EMULATOR_PORT');
      const emulatorPort = emulatorPortRaw
        ? Number(emulatorPortRaw)
        : 5001;

      const functionsMod = await import('@react-native-firebase/functions');
      const appMod = await import('@react-native-firebase/app');
      const getApp = appMod.getApp as () => unknown;
      const getFunctions = functionsMod.getFunctions as (
        app: unknown,
        region: string,
      ) => {
        useEmulator?: (host: string, port: number) => void;
      };
      const httpsCallable = functionsMod.httpsCallable as (
        functions: unknown,
        name: string,
      ) => (data: Record<string, unknown>) => Promise<{ data: unknown }>;

      const functions = getFunctions(getApp(), region);

      if (emulatorHost && Number.isFinite(emulatorPort)) {
        functions.useEmulator?.(emulatorHost, emulatorPort);
      }

      return createVisibilityDiscoveryCallableClient({
        functionsRegion: region,
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

/** Test/reset hook — clears cached client (e.g. after env change). */
export function resetVisibilityDiscoveryClientForTests(): void {
  clientPromise = null;
}

/**
 * iOS composition for `searchCities`: Firebase JS ID token + native App Check
 * on the allowlisted project. Never calls GeoNames and never logs queries.
 */

import Constants from 'expo-constants';

import { createAppCheckBootstrap } from '../authentication/linkedinA3/appCheck/appCheckBootstrap';
import { createNativeAppCheckPort } from '../authentication/linkedinA3/appCheck/nativeAppCheckPort';
import { resolveNearsyFirebaseEnvironment } from '../authentication/linkedinA3/environment/nearsyFirebaseEnvironment';
import { firebaseAuth } from '../config/firebaseConfig';
import { invokeCitySearchCallable } from './citySearchCallable';
import {
  CitySearchClientError,
  type CitySearchRequest,
  type CurrentCity,
} from './currentCity';

type Extra = Record<string, unknown>;

function pick(name: string): string | undefined {
  const extra =
    (Constants.expoConfig?.extra as Extra | undefined) ??
    ((Constants as { manifest2?: { extra?: Extra } }).manifest2?.extra as
      | Extra
      | undefined);
  const fromExtra = extra?.[name];
  if (typeof fromExtra === 'string' && fromExtra.length > 0) return fromExtra;
  const fromProcess = process.env[name];
  if (typeof fromProcess === 'string' && fromProcess.length > 0) return fromProcess;
  return undefined;
}

type CityCallableContext = {
  projectId: string;
  region: string;
  withAppCheckToken: (
    fn: (token: string) => Promise<CurrentCity[]>,
  ) => Promise<CurrentCity[]>;
};

let contextPromise: Promise<CityCallableContext> | null = null;

function unavailable(): CitySearchClientError {
  return new CitySearchClientError('UNAVAILABLE', 'City search is unavailable.');
}

function getContext(): Promise<CityCallableContext> {
  if (!contextPromise) {
    contextPromise = (async () => {
      const environment = resolveNearsyFirebaseEnvironment(
        pick('EXPO_PUBLIC_NEARSY_FIREBASE_ENV'),
      );
      const projectId = environment.firebaseProjectId;
      const configured = pick('EXPO_PUBLIC_FIREBASE_PROJECT_ID');
      if (configured && configured !== projectId) throw unavailable();

      const native = await createNativeAppCheckPort();
      const nativeProjectId = native.getNativeProjectId();
      if (nativeProjectId && nativeProjectId !== projectId) throw unavailable();
      const port = native.port;
      const appCheck = createAppCheckBootstrap({ port });
      await appCheck.initialize();

      const context: CityCallableContext = {
        projectId,
        region: environment.functionsRegion,
        withAppCheckToken: (fn) => {
          appCheck.ensureReady();
          if (!port.withToken) throw unavailable();
          return port.withToken(fn);
        },
      };
      return context;
    })().catch((err) => {
      contextPromise = null;
      throw err instanceof CitySearchClientError ? err : unavailable();
    });
  }
  return contextPromise;
}

export async function searchCitiesRemote(
  request: CitySearchRequest,
  signal: AbortSignal,
): Promise<CurrentCity[]> {
  const user = firebaseAuth.currentUser;
  if (!user) {
    throw new CitySearchClientError(
      'UNAUTHENTICATED',
      'City search requires sign-in.',
    );
  }
  const context = await getContext();
  const idToken = await user.getIdToken();
  return context.withAppCheckToken((appCheckToken) =>
    invokeCitySearchCallable({
      projectId: context.projectId,
      region: context.region,
      idToken,
      appCheckToken,
      request,
      signal,
    }),
  );
}

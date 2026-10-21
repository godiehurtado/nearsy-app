/**
 * iOS composition root for TikTok ownership callables.
 * Transport: Firebase JS Auth ID token + RNFB App Check (Visibility pattern).
 * Start `platform` resolves from `Platform.OS` via resolveTiktokOwnershipClientPlatform().
 * Connect flows pass profile `mode` through the controller (Start/Get/Unlink).
 * Does not change Firebase Auth session or link sign-in methods.
 */

import Constants from 'expo-constants';

import { createAppCheckBootstrap } from '../../authentication/linkedinA3/appCheck/appCheckBootstrap';
import { createNativeAppCheckPort } from '../../authentication/linkedinA3/appCheck/nativeAppCheckPort';
import { createExpoClientProofCrypto } from '../../authentication/linkedinA3/clientProof';
import { resolveNearsyFirebaseEnvironment } from '../../authentication/linkedinA3/environment/nearsyFirebaseEnvironment';
import { firebaseAuth } from '../../config/firebaseConfig';
import { createExpoTiktokOwnershipBrowser } from './browserSession';
import { invokeTiktokOwnershipCallableHttp } from './callableHttp';
import { createTiktokOwnershipCallableClient } from './client';
import {
  createTiktokOwnershipController,
  type TiktokOwnershipController,
} from './controller';
import { logTiktokOwnershipDev } from './devLog';
import {
  TiktokOwnershipClientError,
  mapTiktokOwnershipThrowable,
} from './errors';

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

function readJsProjectId(): string {
  const fromAuth = (firebaseAuth as { app?: { options?: { projectId?: string } } })
    ?.app?.options?.projectId;
  if (typeof fromAuth === 'string' && fromAuth.trim()) {
    return fromAuth.trim();
  }
  const fromExtra = pick('EXPO_PUBLIC_FIREBASE_PROJECT_ID');
  if (typeof fromExtra === 'string' && fromExtra.trim()) {
    return fromExtra.trim();
  }
  throw new TiktokOwnershipClientError(
    'INVALID_ARGUMENT',
    'TikTok ownership Firebase projectId is missing.',
  );
}

let controllerPromise: Promise<TiktokOwnershipController> | null = null;
let clientPromise: Promise<
  ReturnType<typeof createTiktokOwnershipCallableClient>
> | null = null;

async function getTiktokOwnershipCallableClient() {
  if (!clientPromise) {
    clientPromise = (async () => {
      const environment = resolveNearsyFirebaseEnvironment(
        pick('EXPO_PUBLIC_NEARSY_FIREBASE_ENV'),
      );
      const region =
        pick('EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION') ??
        pick('EXPO_PUBLIC_FUNCTIONS_REGION') ??
        environment.functionsRegion ??
        DEFAULT_REGION;
      const projectId = readJsProjectId();
      if (projectId !== environment.firebaseProjectId) {
        throw new TiktokOwnershipClientError(
          'INVALID_ARGUMENT',
          'TikTok ownership projectId does not match Firebase environment.',
        );
      }

      const { port, getNativeProjectId } = await createNativeAppCheckPort();
      const nativeProjectId = getNativeProjectId();
      if (nativeProjectId && nativeProjectId !== projectId) {
        throw new TiktokOwnershipClientError(
          'INVALID_ARGUMENT',
          'TikTok ownership native projectId does not match JS Firebase project.',
        );
      }

      const appCheck = createAppCheckBootstrap({ port });
      await appCheck.initialize();

      return createTiktokOwnershipCallableClient(async (name, data) => {
        const user = firebaseAuth.currentUser;
        if (!user) {
          throw new TiktokOwnershipClientError(
            'UNAUTHENTICATED',
            'TikTok ownership requires sign-in.',
            { stage: 'foundation' },
          );
        }
        appCheck.ensureReady();
        if (!port.withToken) {
          throw new TiktokOwnershipClientError(
            'INVALID_ARGUMENT',
            'TikTok ownership App Check is not ready.',
            { stage: 'foundation', wireCode: 'app-check-not-ready' },
          );
        }
        const startedUid = user.uid;
        const idToken = await user.getIdToken();
        const current = firebaseAuth.currentUser;
        if (!current || current.uid !== startedUid) {
          throw new TiktokOwnershipClientError(
            'SESSION_CHANGED',
            'Signed-in user changed during TikTok ownership.',
            { stage: 'session' },
          );
        }
        try {
          const result = await port.withToken((appCheckToken) =>
            invokeTiktokOwnershipCallableHttp({
              projectId,
              region,
              environment: environment.environment,
              functionName: name,
              idToken,
              appCheckToken,
              data,
            }),
          );
          return result;
        } catch (err) {
          const mode =
            typeof data.mode === 'string' ? data.mode.slice(0, 32) : '';
          const payloadKeys = Object.keys(data).sort().join(',');
          const wireCodeFromErr =
            err &&
            typeof err === 'object' &&
            typeof (err as { code?: unknown }).code === 'string'
              ? String((err as { code: string }).code)
              : err instanceof TiktokOwnershipClientError
                ? (err.wireCode ?? '')
                : '';
          const rawMessage =
            err instanceof Error
              ? err.message
              : err &&
                  typeof err === 'object' &&
                  typeof (err as { message?: unknown }).message === 'string'
                ? String((err as { message: string }).message)
                : '';
          const rawReason =
            err &&
            typeof err === 'object' &&
            (err as { details?: { reason?: unknown } }).details &&
            typeof (err as { details: { reason?: unknown } }).details.reason ===
              'string'
              ? String(
                  (err as { details: { reason: string } }).details.reason,
                )
              : '';
          const httpStatus =
            err &&
            typeof err === 'object' &&
            typeof (err as { httpStatus?: unknown }).httpStatus === 'number'
              ? (err as { httpStatus: number }).httpStatus
              : undefined;
          const mapped = mapTiktokOwnershipThrowable(err, 'foundation');
          logTiktokOwnershipDev('callable_error', {
            stage: 'foundation',
            functionName: name,
            projectId,
            region,
            mode,
            payloadKeys,
            code: mapped.code,
            wireCode: mapped.wireCode ?? wireCodeFromErr,
            wireMessage: rawMessage.slice(0, 120),
            reason: rawReason.slice(0, 80),
            httpStatus: httpStatus ?? '',
          });
          throw mapped;
        }
      });
    })().catch((err) => {
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
}

export async function getTiktokOwnershipController(): Promise<TiktokOwnershipController> {
  if (!controllerPromise) {
    controllerPromise = (async () => {
      const client = await getTiktokOwnershipCallableClient();
      const WebBrowser = await import('expo-web-browser');
      const browser = createExpoTiktokOwnershipBrowser(WebBrowser);
      const crypto = await createExpoClientProofCrypto();
      return createTiktokOwnershipController({
        client,
        browser,
        crypto,
        getUid: () => firebaseAuth.currentUser?.uid ?? null,
      });
    })().catch((err) => {
      controllerPromise = null;
      throw err;
    });
  }
  return controllerPromise;
}

export async function getTiktokOwnershipClient() {
  return getTiktokOwnershipCallableClient();
}

/**
 * Android composition root for Phone OTP Identity callables.
 * Uses J01 App Check + regional RNFirebase Functions (us-central1).
 * App Check tokens attach automatically on httpsCallable after ready.
 */

import { firebaseAuth } from '../config/firebaseConfig';
import {
  ensureAppCheckInitialized,
  getAppCheckInitStatus,
} from '../config/appCheckBootstrap';
import {
  getIdentityFunctions,
  getIdentityFunctionsRegion,
} from '../config/identityFunctions';
import {
  createPhoneOtpCallableClient,
  type PhoneOtpClient,
} from './callables/index.ts';

let clientPromise: Promise<PhoneOtpClient> | null = null;

async function ensureAppCheckReady(): Promise<void> {
  const status = await ensureAppCheckInitialized();
  if (status.status === 'ready') return;
  if (status.status === 'error') {
    throw {
      code: 'functions/failed-precondition',
      message: 'App Check initialization failed.',
    };
  }
  const latest = getAppCheckInitStatus();
  if (latest.status !== 'ready') {
    throw {
      code: 'functions/failed-precondition',
      message: 'App Check is not ready.',
    };
  }
}

export function getPhoneOtpClient(): Promise<PhoneOtpClient> {
  if (!clientPromise) {
    clientPromise = (async () => {
      await ensureAppCheckReady();
      const functions = getIdentityFunctions();
      const region = getIdentityFunctionsRegion();

      return createPhoneOtpCallableClient({
        invoke: async (name, data) => {
          const user = firebaseAuth.currentUser;
          if (!user) {
            throw {
              code: 'functions/unauthenticated',
              message: 'Phone OTP callable requires sign-in.',
            };
          }
          // Fresh email/password sessions can race ahead of ID token attach on
          // Identity callables — force a token before httpsCallable.
          try {
            await user.getIdToken(true);
          } catch {
            throw {
              code: 'functions/unauthenticated',
              message: 'Phone OTP callable requires sign-in.',
            };
          }
          await ensureAppCheckReady();
          if (region !== 'us-central1') {
            throw {
              code: 'functions/failed-precondition',
              message: 'Phone OTP requires us-central1.',
            };
          }
          const callable = functions.httpsCallable(name);
          try {
            const result = await callable(data);
            return result.data;
          } catch (err: unknown) {
            const e = err as { code?: unknown; message?: unknown };
            const rawCode = typeof e.code === 'string' ? e.code : '';
            const normalized = rawCode.replace(/^functions\//, '').toLowerCase();
            // A3.4.1: App Check rejection commonly surfaces as UNAUTHENTICATED
            // even when a valid Firebase Auth session exists locally.
            if (
              normalized === 'unauthenticated' &&
              firebaseAuth.currentUser
            ) {
              if (__DEV__) {
                console.log('[phoneOtp.android] callable error', {
                  name,
                  code: 'failed-precondition',
                  message: 'App Check token was rejected by the backend.',
                  hasCurrentUser: true,
                  appCheck: getAppCheckInitStatus().status,
                });
              }
              throw {
                code: 'functions/failed-precondition',
                message: 'App Check token was rejected by the backend.',
              };
            }
            if (__DEV__) {
              const msg =
                typeof e.message === 'string'
                  ? e.message.replace(
                      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
                      '[redacted]',
                    )
                  : undefined;
              console.log('[phoneOtp.android] callable error', {
                name,
                code: typeof e.code === 'string' ? e.code : undefined,
                message: msg,
                hasCurrentUser: Boolean(firebaseAuth.currentUser),
                appCheck: getAppCheckInitStatus().status,
              });
            }
            throw err;
          }
        },
      });
    })().catch((err) => {
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
}

export function resetPhoneOtpClientForTests(): void {
  clientPromise = null;
}

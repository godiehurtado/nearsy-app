// Android background location task — gated contractual publication.
//
// PUBLICATION CHANNEL (ENH-LOC-01):
// Tick coordinates → publishLocation callable (confirmedAt for Discovery).
// Never client-merge users/{uid}.location. Runtime auth + OS gates at start;
// callbacks do not re-fetch the profile document.
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { firebaseAuth } from '../config/firebaseConfig';
import {
  ensureAppCheckInitialized,
  getAppCheckInitStatus,
} from '../config/appCheckBootstrap';
import {
  clearBackgroundRuntimeAuth,
  decideCallbackPublication,
  readBackgroundRuntimeAuth,
} from '../location/backgroundRuntimeAuth';
import {
  disposeBackgroundPublishFailure,
  isHeadlessPublishEnvironmentReady,
} from '../location/backgroundPublishDisposition';
import {
  acquireBackgroundPublicationTicket,
  isPublicationTicketCurrent,
} from '../location/publicationSession';
import { getVisibilityDiscoveryClient } from '../visibility/iosVisibilityFoundation';
import { publishLocationFlow } from '../visibility/orchestration';
import { locationAccuracyFromCoords } from '../utils/locationPayload';
import {
  isVisibilityDiscoveryClientError,
  type VisibilityErrorReason,
} from '../visibility/callables';
import {
  classifyAndroidCallbackStop,
  classifyCallableStop,
  recordPresenceEvent,
} from './presenceDiagnostics';

export const BG_LOCATION_TASK = 'nearsy-bg-location';

type LocationTaskData = {
  locations?: Location.LocationObject[];
};

function reasonToString(reason: VisibilityErrorReason | undefined): string {
  if (!reason || reason.kind === 'none') return '';
  return reason.value;
}

async function stopTaskCleanly(): Promise<void> {
  try {
    const hasStarted =
      await Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK);
    if (hasStarted) {
      await Location.stopLocationUpdatesAsync(BG_LOCATION_TASK);
    }
  } catch {
    // ignore
  } finally {
    try {
      await AsyncStorage.removeItem('NEARSY_BG_UID');
    } catch {
      // ignore
    }
    await clearBackgroundRuntimeAuth().catch(() => {});
  }
}

TaskManager.defineTask(BG_LOCATION_TASK, async ({ data, error }) => {
  try {
    if (error) {
      if (__DEV__) console.warn('[BG Task] error:', error);
      const message = String((error as { message?: string })?.message ?? error);
      if (
        /visibility-inactive|permission|denied|unauthorized|unauthenticated|app check/i.test(
          message,
        )
      ) {
        await recordPresenceEvent({
          event: 'stop',
          platform: 'android',
          stop: 'task_error',
          started: false,
        });
        await stopTaskCleanly();
      }
      return;
    }

    const { locations } = (data as LocationTaskData) ?? {};
    if (!locations?.length) {
      await recordPresenceEvent({
        event: 'skip',
        platform: 'android',
        skip: 'empty_batch',
      });
      return;
    }

    // Taken before any await: a callback that outlives its session (logout,
    // uid change, pending re-confirmation) can never publish.
    const authUidAtStart = firebaseAuth.currentUser?.uid ?? null;
    const ticket = acquireBackgroundPublicationTicket(authUidAtStart);
    // Signed out falls through to the runtime gate below, which stops the task.
    if (!ticket && authUidAtStart) {
      await recordPresenceEvent({
        event: 'skip',
        platform: 'android',
        skip: 'session_not_open',
      });
      return;
    }
    const sessionGuard = {
      isCurrent: () =>
        isPublicationTicketCurrent(ticket, firebaseAuth.currentUser?.uid ?? null),
    };

    const storedUid = await AsyncStorage.getItem('NEARSY_BG_UID');
    const authUid = firebaseAuth.currentUser?.uid ?? null;
    const runtimeAuth = await readBackgroundRuntimeAuth();

    const fg = await Location.getForegroundPermissionsAsync();
    const bg = await Location.getBackgroundPermissionsAsync();
    const foregroundGranted = fg.status === 'granted' || !!fg.granted;
    const backgroundGranted = bg.status === 'granted' || !!bg.granted;
    const androidAccuracy =
      ((fg as { android?: { accuracy?: string } }).android?.accuracy as
        | 'fine'
        | 'coarse'
        | 'none'
        | undefined) ?? null;
    const fineLocationGranted =
      androidAccuracy == null || androidAccuracy === 'fine';

    const decision = decideCallbackPublication({
      authUid,
      storedTaskUid: storedUid,
      runtimeAuth,
      foregroundGranted,
      fineLocationGranted,
      backgroundGranted,
    });

    if (decision === 'stop') {
      await recordPresenceEvent({
        event: 'stop',
        platform: 'android',
        stop: classifyAndroidCallbackStop({
          authUid,
          storedTaskUid: storedUid,
          hasRuntimeAuth: Boolean(runtimeAuth && runtimeAuth.uid === authUid),
          foregroundGranted,
          backgroundGranted,
          fineLocationGranted,
        }),
        started: false,
      });
      await stopTaskCleanly();
      return;
    }
    if (decision === 'skip' || !storedUid) {
      await recordPresenceEvent({
        event: 'skip',
        platform: 'android',
        skip: 'runtime_gate',
      });
      return;
    }
    if (!sessionGuard.isCurrent()) {
      await recordPresenceEvent({
        event: 'skip',
        platform: 'android',
        skip: 'session_stale',
      });
      return;
    }

    // Headless: Auth + App Check must be ready before contractual publish.
    const appCheck = await ensureAppCheckInitialized();
    const appCheckStatus =
      appCheck.status === 'ready'
        ? 'ready'
        : getAppCheckInitStatus().status;
    if (
      !isHeadlessPublishEnvironmentReady({
        hasCurrentUser: Boolean(firebaseAuth.currentUser),
        appCheckStatus,
      })
    ) {
      if (__DEV__) {
        console.warn('[BG Task] headless publish not ready', {
          appCheck: appCheckStatus,
          hasUser: Boolean(firebaseAuth.currentUser),
        });
      }
      await recordPresenceEvent({
        event: 'stop',
        platform: 'android',
        stop: 'headless_not_ready',
        started: false,
      });
      await stopTaskCleanly();
      return;
    }

    // Last fix in batch only — avoid multi-publish storms.
    const fix = locations[locations.length - 1];
    const { latitude, longitude } = fix.coords;
    const accuracyMeters =
      locationAccuracyFromCoords(fix.coords) ?? Number.POSITIVE_INFINITY;
    const observedAt =
      typeof fix.timestamp === 'number' && Number.isFinite(fix.timestamp)
        ? fix.timestamp
        : Date.now();

    await recordPresenceEvent({
      event: 'callback',
      platform: 'android',
      accuracyMeters,
    });

    try {
      const client = await getVisibilityDiscoveryClient();
      const outcome = await publishLocationFlow(
        client,
        {
          latitude,
          longitude,
          accuracyMeters,
          observedAt,
        },
        sessionGuard,
      );

      if (outcome.ok === true) {
        await recordPresenceEvent({
          event: 'publish_ok',
          platform: 'android',
          accuracyMeters,
        });
        return;
      }
      if (outcome.kind === 'session-closed') {
        await recordPresenceEvent({
          event: 'skip',
          platform: 'android',
          skip: 'session_stale',
        });
        return;
      }

      const err = outcome.error;
      const disposition = disposeBackgroundPublishFailure({
        kind: outcome.kind,
        code: err?.code,
        reason: reasonToString(err?.reason),
        message: err?.message,
        retryable: err?.retryable,
      });

      if (__DEV__) {
        console.warn('[BG Task] publish error:', {
          kind: outcome.kind,
          code: err?.code,
          disposition,
        });
      }

      if (outcome.kind === 'invalid-accuracy') {
        await recordPresenceEvent({
          event: 'skip',
          platform: 'android',
          skip: 'invalid_accuracy',
          accuracyMeters,
        });
        return;
      }

      await recordPresenceEvent({
        event: 'publish_fail',
        platform: 'android',
        skip: disposition === 'skip' ? 'callable_retryable' : undefined,
        stop:
          disposition === 'stop'
            ? classifyCallableStop({
                kind: outcome.kind,
                code: err?.code,
                reason: reasonToString(err?.reason),
              })
            : undefined,
        accuracyMeters,
      });

      if (disposition === 'stop') {
        await recordPresenceEvent({
          event: 'stop',
          platform: 'android',
          stop: classifyCallableStop({
            kind: outcome.kind,
            code: err?.code,
            reason: reasonToString(err?.reason),
          }),
          started: false,
        });
        await stopTaskCleanly();
      }
      // Transient: skip tick; OS timeInterval unchanged.
    } catch (publishErr) {
      if (!sessionGuard.isCurrent()) {
        await recordPresenceEvent({
          event: 'skip',
          platform: 'android',
          skip: 'session_stale',
        });
        return;
      }
      if (__DEV__) console.warn('[BG Task] publish error:', publishErr);
      if (isVisibilityDiscoveryClientError(publishErr)) {
        const disposition = disposeBackgroundPublishFailure({
          kind: 'callable',
          code: publishErr.code,
          reason: reasonToString(publishErr.reason),
          message: publishErr.message,
          retryable: publishErr.retryable,
        });
        const stopClass = classifyCallableStop({
          kind: 'callable',
          code: publishErr.code,
          reason: reasonToString(publishErr.reason),
        });
        await recordPresenceEvent({
          event: 'publish_fail',
          platform: 'android',
          skip: disposition === 'skip' ? 'callable_retryable' : undefined,
          stop: disposition === 'stop' ? stopClass : undefined,
          accuracyMeters,
        });
        if (disposition === 'stop') {
          await recordPresenceEvent({
            event: 'stop',
            platform: 'android',
            stop: stopClass,
            started: false,
          });
          await stopTaskCleanly();
        }
        return;
      }
      const message = String(
        (publishErr as { message?: string; code?: string })?.message ??
          publishErr,
      );
      const code = String(
        (publishErr as { code?: string })?.code ?? '',
      );
      if (
        disposeBackgroundPublishFailure({ message, code }) === 'stop'
      ) {
        await recordPresenceEvent({
          event: 'stop',
          platform: 'android',
          stop: classifyCallableStop({ code }),
          started: false,
        });
        await stopTaskCleanly();
      } else {
        await recordPresenceEvent({
          event: 'publish_fail',
          platform: 'android',
          skip: 'callable_retryable',
          accuracyMeters,
        });
      }
      // Transient network / unknown: skip tick.
    }
  } catch (e) {
    if (__DEV__) console.warn('[BG Task] handler error:', e);
  }
});

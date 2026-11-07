/**
 * Android analytics binding. Only `startAnalytics`, called from the mounted app,
 * and the explicit track calls create a session, so a background location task
 * never initializes analytics. The SDK loads only in remote mode.
 */
import { AppState } from 'react-native';

import { firebaseAuth } from '../config/firebaseConfig.android';
import { normalizeLanguageCodes } from '../profileContext/languageCatalog';
import type { AnalyticsApi } from './analyticsApi';
import { createAppOpenedTracker } from './appOpenedTracker';
import {
  resolveAnalyticsConfig,
  type AnalyticsConfig,
  type AnalyticsExtras,
} from './analyticsConfig';
import {
  describeForInspection,
  isAllowedOutgoingEvent,
  TRACKING_PLAN_VERSION,
  type AnalyticsProperties,
} from './analyticsContract';
import { createAnalyticsSession, type AnalyticsTransport } from './analyticsCore';
import {
  buildBasePersonProperties,
  buildPersonProperties,
} from './analyticsPersonProperties';

type Session = ReturnType<typeof createAnalyticsSession>;

function readExtras(): AnalyticsExtras {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Constants = require('expo-constants').default ?? require('expo-constants');
    return (Constants.expoConfig?.extra ?? {}) as AnalyticsExtras;
  } catch {
    return {};
  }
}

/** Real binary values; `app.json` versionCode is not the remote EAS build. */
function readAppVersions(): { appVersion?: string; appBuild?: string } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Application = require('expo-application');
    return {
      appVersion: Application.nativeApplicationVersion ?? undefined,
      appBuild: Application.nativeBuildVersion ?? undefined,
    };
  } catch {
    return {};
  }
}

function createInspectTransport(): AnalyticsTransport {
  const log = (action: string, properties?: AnalyticsProperties) => {
    console.log(`[analytics:inspect] ${action}`, describeForInspection(properties));
  };
  return {
    getIdentifiedDistinctId: () => null,
    getSessionId: () => undefined,
    identify: (_uid, properties) => log('identify', properties),
    setPersonProperties: (properties) => log('set_person', properties),
    reset: () => log('reset'),
    register: (properties) => log('register', properties),
    capture: (event, properties) => log(`capture ${event}`, properties),
  };
}

async function createRemoteTransport(
  config: Extract<AnalyticsConfig, { mode: 'remote' }>,
): Promise<AnalyticsTransport> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const PostHog = require('posthog-react-native')
    .default as typeof import('posthog-react-native').default;
  const client = new PostHog(config.token, {
    host: config.host,
    persistence: 'file',
    captureAppLifecycleEvents: false,
    enableSessionReplay: false,
    errorTracking: { autocapture: false },
    preloadFeatureFlags: false,
    disableRemoteFeatureFlags: true,
    disableRemoteConfig: true,
    disableSurveys: true,
    disableGeoip: true,
    before_send: (event) =>
      isAllowedOutgoingEvent(event?.event) ? event : null,
  });
  await client.ready();
  return {
    getIdentifiedDistinctId: () => {
      const distinctId = client.getDistinctId();
      return distinctId && distinctId !== client.getAnonymousId()
        ? distinctId
        : null;
    },
    getSessionId: () => client.getSessionId() || undefined,
    identify: (uid, properties) => client.identify(uid, { $set: properties }),
    setPersonProperties: (properties) => client.setPersonProperties(properties),
    reset: () => client.reset(),
    register: (properties) => client.register(properties),
    capture: (event, properties) => client.capture(event, properties),
  };
}

let sessionResolved = false;
let session: Session | null = null;

function getSession(): Session | null {
  if (sessionResolved) return session;
  sessionResolved = true;
  try {
    const config = resolveAnalyticsConfig({
      extras: readExtras(),
      isDev: typeof __DEV__ !== 'undefined' ? __DEV__ : false,
    });
    if (config.mode === 'off') return null;

    const { appVersion, appBuild } = readAppVersions();
    const superProperties: AnalyticsProperties = {
      platform: 'Android',
      environment: config.environment,
      tracking_plan_version: TRACKING_PLAN_VERSION,
      ...(appVersion ? { app_version: appVersion } : {}),
      ...(appBuild ? { app_build: appBuild } : {}),
    };

    session = createAnalyticsSession({
      loadTransport: async () =>
        config.mode === 'remote'
          ? createRemoteTransport(config)
          : createInspectTransport(),
      getAuthUser: () => {
        const user = firebaseAuth.currentUser;
        return user ? { uid: user.uid, email: user.email } : null;
      },
      readCreationTime: () => firebaseAuth.currentUser?.metadata?.creationTime,
      buildBaseProperties: (user) =>
        buildBasePersonProperties({ authEmail: user.email, appVersion }),
      buildProfileProperties: (user, doc) =>
        buildPersonProperties({
          doc,
          authEmail: user.email,
          appVersion,
          normalizeLanguages: normalizeLanguageCodes,
        }),
      superProperties,
      now: () => Date.now(),
    });
  } catch {
    session = null;
  }
  return session;
}

/** Survives a remount of the root component, so it cannot repeat the first open. */
let tracker: ReturnType<typeof createAppOpenedTracker> | null = null;

export const startAnalytics: AnalyticsApi['startAnalytics'] = () => {
  const active = getSession();
  if (!active) return () => {};
  const detachers: Array<() => void> = [];
  try {
    tracker ??= createAppOpenedTracker({
      now: () => Date.now(),
      emit: () => active.trackAppOpened(),
    });
    const openTracker = tracker;
    const appStateSub = AppState.addEventListener('change', (state) =>
      openTracker.noteAppState(state),
    );
    detachers.push(() => appStateSub.remove());
    openTracker.noteAppState(AppState.currentState);
    detachers.push(
      firebaseAuth.onAuthStateChanged(() => {
        active.noteAuthChange();
        openTracker.noteAuthReady();
      }),
    );
  } catch {
    // Analytics must not affect app startup.
  }
  return () => {
    for (const detach of detachers) {
      try {
        detach();
      } catch {
        // Nothing else to release.
      }
    }
  };
};

export const trackSignupCompleted: AnalyticsApi['trackSignupCompleted'] = (uid) => {
  getSession()?.trackSignupCompleted(uid);
};

export const trackProfileCompleted: AnalyticsApi['trackProfileCompleted'] = (uid) => {
  getSession()?.trackProfileCompleted(uid);
};

export const syncAnalyticsPersonProfile: AnalyticsApi['syncAnalyticsPersonProfile'] = (
  uid,
  doc,
) => {
  getSession()?.syncPersonProfile(uid, doc);
};

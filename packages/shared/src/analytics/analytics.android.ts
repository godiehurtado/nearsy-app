/**
 * Android analytics binding. Only `startAnalytics`, called from the mounted app,
 * and the explicit track calls create a session, so a background location task
 * never initializes analytics. The SDK loads only in the modes that use it.
 */
import { AppState, Linking } from 'react-native';

import { firebaseAuth } from '../config/firebaseConfig.android';
import { normalizeLanguageCodes } from '../profileContext/languageCatalog';
import type { AnalyticsApi } from './analyticsApi';
import {
  campaignAccessedProperties,
  createCampaignTouchStore,
  INSTALL_REFERRER_READ_KEY,
  isEstablishedAccount,
  parseCampaignLink,
  parseInstallReferrer,
  resolveAttributionSettings,
  signupAttributionProperties,
  type AttributionSettings,
  type CampaignTouch,
} from './analyticsAttribution';
import { createAppOpenedTracker } from './appOpenedTracker';
import {
  INTERCEPT_HOST,
  INTERCEPT_TOKEN,
  resolveAnalyticsConfig,
  resolveAppOpenedMinBackgroundMs,
  type AnalyticsConfig,
  type AnalyticsExtras,
} from './analyticsConfig';
import {
  describeForInspection,
  sanitizeOutgoingEvent,
  scoreProperties,
  TRACKING_PLAN_VERSION,
  type AnalyticsProperties,
} from './analyticsContract';
import { createAnalyticsSession, type AnalyticsTransport } from './analyticsCore';
import {
  createLocationPermissionObserver,
  createVisibilityObserver,
} from './analyticsObservers';
import {
  buildOnboardingStepProperties,
  createOnboardingMilestoneTracker,
} from './analyticsOnboarding';
import {
  buildBasePersonProperties,
  buildPersonProperties,
  createPersonModeMemory,
  personKeysToUnset,
} from './analyticsPersonProperties';
import {
  createSdkTransport,
  type InterceptedRequest,
  type TransportIssue,
} from './analyticsSdkTransport';
import {
  createPendingVerificationMarkers,
  createVerifiedSocialTracker,
  toSocialPlatformName,
} from './analyticsSocial';
import {
  isLocationRequestInFlight,
  setLocationRequestListener,
  setOwnExternalFlowListener,
} from './ownExternalFlow';

type Session = ReturnType<typeof createAnalyticsSession>;

/** A track call sits inside save and navigation flows: it must never throw there. */
function safely<Args extends unknown[]>(run: (...args: Args) => void) {
  return (...args: Args): void => {
    try {
      run(...args);
    } catch {
      // Analytics must never interrupt the product flow.
    }
  };
}

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

function readFirebaseProjectId(): unknown {
  try {
    return (firebaseAuth as unknown as { app?: { options?: { projectId?: unknown } } }).app
      ?.options?.projectId;
  } catch {
    return undefined;
  }
}

function createInspectTransport(): AnalyticsTransport {
  const log = (action: string, properties?: AnalyticsProperties) => {
    console.log(`[analytics:inspect] ${action}`, describeForInspection(properties));
  };
  return {
    getIdentifiedDistinctId: () => null,
    // A stand-in, so session-scoped rules behave; this is not an SDK session.
    getSessionId: () => 'inspect-process',
    identify: (_uid, properties) => log('identify', properties),
    setPersonProperties: (properties, once) => {
      log('set_person', properties);
      if (once) log('set_person_once', once);
    },
    unsetPersonProperties: (names) => console.log('[analytics:inspect] unset_person', names),
    reset: () => log('reset'),
    register: (properties) => log('register', properties),
    capture: (event, properties) => {
      const allowed = sanitizeOutgoingEvent({ event, properties });
      log(`capture ${event}`, allowed?.properties as AnalyticsProperties | undefined);
    },
  };
}

function logInterceptedRequest(request: InterceptedRequest): void {
  const events = request.events.map(
    (item) =>
      `${item.event} props=[${item.propertyKeys.join(',')}] person=[${item.personKeys.join(',')}] unset=[${(item.unsetKeys ?? []).join(',')}]`,
  );
  console.log(`[analytics:sdk_intercept] ${request.path}`, events);
}

/** Keeps ingestion failures visible; the kind and status hold no personal data. */
function logTransportIssue(issue: TransportIssue): void {
  console.warn('[analytics:transport]', issue);
}

async function createTransport(config: AnalyticsConfig): Promise<AnalyticsTransport> {
  if (config.mode === 'off' || config.mode === 'inspect') {
    return createInspectTransport();
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const PostHog = require('posthog-react-native').default;
  if (config.mode === 'sdk_intercept') {
    return createSdkTransport({
      PostHog,
      token: INTERCEPT_TOKEN,
      host: INTERCEPT_HOST,
      persistence: 'memory',
      onInterceptedRequest: logInterceptedRequest,
    });
  }
  return createSdkTransport({
    PostHog,
    token: config.token,
    host: config.host,
    persistence: 'file',
    onTransportIssue: logTransportIssue,
    ...(config.mode === 'beta'
      ? {
          installClassification: {
            is_test_user: true,
            distribution_channel: config.distributionChannel,
          },
        }
      : {}),
  });
}

let sessionResolved = false;
let session: Session | null = null;
let extras: AnalyticsExtras = {};
let lastProfileDoc: { uid: string; doc: unknown } | null = null;
const verifiedSocials = createVerifiedSocialTracker();
const onboardingMilestones = createOnboardingMilestoneTracker();
const linkedThisProcess = new Set<string>();
let verifiedOwnerUid: string | null = null;

function personModeMemory() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const storage = require('@react-native-async-storage/async-storage').default;
  return createPersonModeMemory(storage);
}

function pendingVerificationMarkers() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const storage = require('@react-native-async-storage/async-storage').default;
  return createPendingVerificationMarkers(storage);
}

function pendingVerificationKey(uid: string, mode: string, platform: string): string {
  return `${uid}:${mode}:${platform}`;
}

function alignSocialOwner(uid: string): void {
  if (verifiedOwnerUid === uid) return;
  verifiedOwnerUid = uid;
  verifiedSocials.clear();
  linkedThisProcess.clear();
}

function getSession(): Session | null {
  if (sessionResolved) return session;
  sessionResolved = true;
  try {
    extras = readExtras();
    const config = resolveAnalyticsConfig({
      extras,
      isDev: typeof __DEV__ !== 'undefined' ? __DEV__ : false,
      runtimeFirebaseProjectId: readFirebaseProjectId(),
    });
    if (config.mode === 'off') {
      // A build that asked for sending should say why it does not.
      if (config.reason !== 'not_enabled') console.warn('[analytics] off:', config.reason);
      return null;
    }

    const { appVersion, appBuild } = readAppVersions();
    const superProperties: AnalyticsProperties = {
      platform: 'Android',
      environment: config.environment,
      tracking_plan_version: TRACKING_PLAN_VERSION,
      ...(appVersion ? { app_version: appVersion } : {}),
      ...(appBuild ? { app_build: appBuild } : {}),
    };

    session = createAnalyticsSession({
      loadTransport: () => createTransport(config),
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
          verifiedSocialsFor: (mode) =>
            verifiedOwnerUid === user.uid ? verifiedSocials.verifiedFor(mode) : undefined,
        }),
      profileKeysToUnset: async (user, doc, properties) =>
        personKeysToUnset({
          doc,
          properties,
          previousMode: await personModeMemory().read(user.uid),
        }),
      onProfileSynced: (user, doc) =>
        personModeMemory().write(user.uid, (doc as { mode?: unknown } | null)?.mode),
      superProperties,
      now: () => Date.now(),
      ...(config.mode === 'beta' ? { accountClassification: { is_test_user: true } } : {}),
    });
  } catch {
    session = null;
  }
  return session;
}

function currentUid(): string | null {
  return firebaseAuth.currentUser?.uid ?? null;
}

const locationPermissions = createLocationPermissionObserver({
  emit: (kind, granted, trigger) => {
    getSession()?.trackForCurrent(() => ({
      event: kind === 'foreground' ? 'foreground_location' : 'background_location',
      properties: { granted, trigger },
    }));
  },
  setPerson: (kind, granted) => {
    const uid = currentUid();
    if (!uid) return;
    getSession()?.setPersonForUser(uid, {
      [kind === 'foreground'
        ? 'foreground_location_granted'
        : 'background_location_granted']: granted,
    });
  },
});

/** Reads the permission state only: no dialog and no location sample. */
async function readLocationPermissions(): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Location = require('expo-location');
    const [foreground, background] = await Promise.all([
      Location.getForegroundPermissionsAsync(),
      Location.getBackgroundPermissionsAsync(),
    ]);
    // An open request reports its own result, as a request.
    if (!isLocationRequestInFlight('foreground')) {
      locationPermissions.noteState('foreground', foreground?.status === 'granted');
    }
    if (!isLocationRequestInFlight('background')) {
      locationPermissions.noteState('background', background?.status === 'granted');
    }
  } catch {
    // Analytics must never interrupt the product flow.
  }
}

function attributionSettings(): AttributionSettings {
  return resolveAttributionSettings(extras?.nearsyAnalytics?.attribution);
}

function campaignStore() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const storage = require('@react-native-async-storage/async-storage').default;
  return createCampaignTouchStore({
    storage,
    now: () => Date.now(),
    expiryMs: attributionSettings().expiryMs,
  });
}

function readEstablishedAccount(): boolean {
  try {
    return isEstablishedAccount(
      firebaseAuth.currentUser?.metadata?.creationTime,
      Date.now(),
    );
  } catch {
    return false;
  }
}

function sendCampaignAccessed(touch: CampaignTouch): void {
  getSession()?.trackForCurrent(() => ({
    event: 'campaign_accessed',
    properties: campaignAccessedProperties(touch),
  }));
}

async function noteCampaignLink(url: unknown): Promise<void> {
  try {
    const touch = parseCampaignLink(url, attributionSettings());
    if (!touch) return;
    if (currentUid() && readEstablishedAccount()) {
      sendCampaignAccessed(touch);
      return;
    }
    await campaignStore().save(touch);
  } catch {
    // Analytics must never interrupt the product flow.
  }
}

/** A touch held from before login, for an account it cannot have created. */
async function settleHeldCampaignTouch(): Promise<void> {
  try {
    if (!currentUid() || !readEstablishedAccount()) return;
    const touch = await campaignStore().consume();
    // The referrer describes the install, not a visit by this existing account.
    if (touch && touch.method !== 'install_referrer') sendCampaignAccessed(touch);
  } catch {
    // Analytics must never interrupt the product flow.
  }
}

async function applySignupAttribution(uid: string): Promise<void> {
  try {
    const touch = await campaignStore().consume();
    if (touch) {
      getSession()?.setPersonForUser(uid, {}, signupAttributionProperties(touch));
    }
  } catch {
    // Analytics must never interrupt the product flow.
  }
}

async function readInstallReferrerOnce(): Promise<void> {
  if (!attributionSettings().installReferrerEnabled) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const storage = require('@react-native-async-storage/async-storage').default;
    if (await storage.getItem(INSTALL_REFERRER_READ_KEY)) return;
    await storage.setItem(INSTALL_REFERRER_READ_KEY, '1');
    // An account already here was not acquired by this read.
    if (currentUid()) return;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Application = require('expo-application');
    const touch = parseInstallReferrer(await Application.getInstallReferrerAsync());
    if (touch) await campaignStore().save(touch);
  } catch {
    // Not installed from Play, or the service is unavailable: no evidence.
  }
}

/** Survives a remount of the root component, so it cannot repeat the first open. */
let tracker: ReturnType<typeof createAppOpenedTracker> | null = null;
let attributionStarted = false;

export const startAnalytics: AnalyticsApi['startAnalytics'] = () => {
  const active = getSession();
  if (!active) return () => {};
  const detachers: Array<() => void> = [];
  try {
    tracker ??= createAppOpenedTracker({
      now: () => Date.now(),
      emit: () => active.trackAppOpened(),
      minBackgroundMs: resolveAppOpenedMinBackgroundMs(extras),
    });
    const openTracker = tracker;
    setOwnExternalFlowListener(() => openTracker.beginOwnFlow());
    setLocationRequestListener((kind, granted) =>
      locationPermissions.noteRequest(kind, granted),
    );
    detachers.push(() => {
      setOwnExternalFlowListener(null);
      setLocationRequestListener(null);
    });

    const appStateSub = AppState.addEventListener('change', (state) => {
      openTracker.noteAppState(state);
      if (state === 'active') void readLocationPermissions();
    });
    detachers.push(() => appStateSub.remove());
    openTracker.noteAppState(AppState.currentState);
    detachers.push(
      firebaseAuth.onAuthStateChanged(() => {
        active.noteAuthChange();
        openTracker.noteAuthReady();
        locationPermissions.replayPerson();
        void settleHeldCampaignTouch();
      }),
    );
    void readLocationPermissions();

    const linkSub = Linking.addEventListener('url', ({ url }) => {
      void noteCampaignLink(url);
    });
    detachers.push(() => linkSub.remove());
    if (!attributionStarted) {
      attributionStarted = true;
      void Linking.getInitialURL()
        .then(noteCampaignLink)
        .catch(() => {});
      void readInstallReferrerOnce();
    }
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

export const trackSignupCompleted: AnalyticsApi['trackSignupCompleted'] = safely((uid) => {
  const active = getSession();
  if (!active) return;
  active.trackSignupCompleted(uid);
  void applySignupAttribution(uid);
});

export const trackProfileCompleted: AnalyticsApi['trackProfileCompleted'] = safely((uid) => {
  getSession()?.trackProfileCompleted(uid);
});

export const syncAnalyticsPersonProfile: AnalyticsApi['syncAnalyticsPersonProfile'] = safely((
  uid,
  doc,
) => {
  lastProfileDoc = { uid, doc };
  getSession()?.syncPersonProfile(uid, doc);
});

export const noteOnboardingResume: AnalyticsApi['noteOnboardingResume'] = safely((
  uid,
  stepKind,
) => {
  onboardingMilestones.noteResumeAt(uid, stepKind);
});

export const trackOnboardingStep: AnalyticsApi['trackOnboardingStep'] = safely((uid, input) => {
  const active = getSession();
  if (!active || !onboardingMilestones.claim(uid, input.step)) return;
  const mode =
    input.step === 'socials' && verifiedOwnerUid === uid
      ? (lastProfileDoc?.doc as { mode?: unknown } | undefined)?.mode
      : undefined;
  const verified =
    typeof mode === 'string' ? verifiedSocials.verifiedFor(mode) : undefined;
  const properties = buildOnboardingStepProperties(input, verified?.length);
  active.trackForUser(uid, () => ({
    event: 'onboarding_step_completed',
    properties,
  }));
});

export const noteSocialOwnership: AnalyticsApi['noteSocialOwnership'] = safely((
  mode,
  platform,
  connected,
) => {
  const active = getSession();
  const uid = currentUid();
  if (!active || !uid) return;
  alignSocialOwner(uid);
  if (!connected) linkedThisProcess.delete(`${mode}:${platform}`);
  const changed = verifiedSocials.note(mode, platform, connected);
  if (changed && lastProfileDoc?.uid === uid) {
    active.syncPersonProfile(uid, lastProfileDoc.doc);
  }
  if (connected) {
    void pendingVerificationMarkers()
      .consume(pendingVerificationKey(uid, mode, platform))
      .then((wasPending) => {
        if (wasPending) trackSocialLinked(platform, 'verified', mode);
      })
      .catch(() => {});
  }
});

export const noteSocialVerificationPending: AnalyticsApi['noteSocialVerificationPending'] = safely((
  mode,
  platform,
) => {
  const uid = currentUid();
  if (!getSession() || !uid) return;
  void pendingVerificationMarkers()
    .mark(pendingVerificationKey(uid, mode, platform))
    .catch(() => {});
});

export const trackSocialLinked: AnalyticsApi['trackSocialLinked'] = safely((
  platform,
  connectionType,
  mode,
) => {
  const active = getSession();
  const uid = currentUid();
  const name = toSocialPlatformName(platform);
  if (!active || !uid || !name) return;
  alignSocialOwner(uid);
  if (connectionType === 'verified') {
    const key = `${mode}:${name}`;
    if (linkedThisProcess.has(key)) return;
    linkedThisProcess.add(key);
  }
  active.trackForUser(uid, () => ({
    event: 'social_linked',
    properties: {
      social_platform: name,
      connection_type: connectionType,
      profile_type: mode,
    },
  }));
});

export const trackMatchSocialTapped: AnalyticsApi['trackMatchSocialTapped'] = safely(({
  platform,
  score,
  openResult,
}) => {
  const name = toSocialPlatformName(platform);
  if (!name) return;
  getSession()?.trackForCurrent(() => ({
    event: 'match_social_tapped',
    properties: {
      social_platform: name,
      ...scoreProperties(score),
      ...(typeof openResult === 'string' ? { open_result: openResult } : {}),
    },
  }));
});

const visibilityByUid = new Map<string, ReturnType<typeof createVisibilityObserver>>();

export const trackVisibilityChanged: AnalyticsApi['trackVisibilityChanged'] = safely((
  uid,
  enabled,
) => {
  const active = getSession();
  if (!active) return;
  let observer = visibilityByUid.get(uid);
  if (!observer) {
    observer = createVisibilityObserver((value) =>
      active.trackForUser(uid, () => ({
        event: 'visibility_changed',
        properties: { enabled: value },
      })),
    );
    visibilityByUid.set(uid, observer);
  }
  observer.note(enabled);
});

export const trackDiscoveryOpened: AnalyticsApi['trackDiscoveryOpened'] = safely((
  uid,
  properties,
) => {
  getSession()?.trackForUser(uid, () => ({
    event: 'discovery_opened',
    properties,
  }));
});

export const trackProfileViewed: AnalyticsApi['trackProfileViewed'] = safely((uid, score) => {
  getSession()?.trackForUser(uid, () => ({
    event: 'profile_viewed',
    properties: scoreProperties(score),
  }));
});

export const trackMatchPresented: AnalyticsApi['trackMatchPresented'] = safely((
  uid,
  peerUid,
  score,
  presentedIn,
) => {
  // Compatibility is what this event measures: unknown is not zero, and not a match.
  if (toKnownScore(score) === undefined || !peerUid) return;
  getSession()?.trackForUser(uid, ({ sessionId }) => ({
    event: 'match_made',
    onceKey: `match_made:${sessionId ?? 'no-session'}:${peerUid}`,
    properties: {
      ...scoreProperties(score),
      presented_in: presentedIn,
      ...(sessionId ? { session_id: sessionId } : {}),
    },
  }));
});

export const trackAlertOpened: AnalyticsApi['trackAlertOpened'] = safely((source, alertId) => {
  getSession()?.trackForCurrent(() => ({
    event: 'alert_opened',
    properties: { source, ...(alertId ? { alert_id: alertId } : {}) },
  }));
});

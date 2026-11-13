/**
 * Wires the analytics client to the running app. Only App.tsx imports this.
 *
 * Off by default. While off, no SDK module is loaded, AppState is not observed,
 * local storage is not used and nothing is queued. While on, nothing starts until
 * the app is really in foreground, so a location task launch never initializes it.
 */
import { AppState, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

import { firebaseAuth } from '../config/firebaseConfig';
import {
  getAccountDeletionClosure,
  isAccountDeletionSessionActive,
  subscribeAccountDeletionClosure,
  subscribeAccountDeletionSession,
} from '../services/accountDeletionSession';
import {
  getPendingAccountDeletionState,
  subscribePendingAccountDeletion,
} from '../services/accountDeletionReconciliation';
import { getUserProfile } from '../services/firestoreService';
import {
  isBackgroundPermissionEffectivelyGranted,
  readBackgroundPermissionSnapshot,
} from '../visibility/backgroundLocationRuntime';
import { createPendingAttributionStore } from './attribution';
import { createAnalyticsClient, type AuthSnapshot } from './client';
import { resolveAnalyticsConfig } from './config';
import type { AnalyticsSocialPlatform } from './contract';
import {
  bindAnalyticsServices,
  handleCampaignLink,
  markAnalyticsConfigured,
  resolvePendingAttribution,
  type AnalyticsServices,
} from './index';
import { createDeletionRecords } from './deletionRecords';
import { createEventLedger } from './ledger';
import {
  createForegroundTracker,
  type AppOpenType,
  type StringStore,
} from './lifecycle';
import {
  createLocationPermissionObserver,
  type LocationPermissionReadings,
} from './locationPermissions';
import { createPostHogTransport } from './postHogTransport';
import {
  buildPersonProperties,
  diffPersonProperties,
  type VerifiedSocialState,
} from './profileProperties';
import type { AnalyticsLogger } from './transport';
import {
  combineVerifiedSocialReads,
  createVerifiedSocialMemory,
} from './verifiedSocialRead';

const PROFILE_SYNC_DEBOUNCE_MS = 1500;
/** Lets signup claim a pending link first; then it counts as access. */
const ATTRIBUTION_RESOLVE_DELAY_MS = 5000;

const log: AnalyticsLogger = (code, details) => {
  // Codes and contract names only, never values.
  if (__DEV__) console.log('[analytics]', code, details ?? '');
};

function readBinaryInfo() {
  // Lazy: the native module exists only in binaries built with this dependency.
  const Application =
    require('expo-application') as typeof import('expo-application');
  return {
    appVersion: Application.nativeApplicationVersion,
    appBuild: Application.nativeBuildVersion,
  };
}

function readLiveSession(): AuthSnapshot | null {
  return toSnapshot(firebaseAuth.currentUser);
}

function toSnapshot(user: any | null | undefined): AuthSnapshot | null {
  if (!user?.uid) return null;
  return {
    uid: user.uid,
    email: user.email ?? null,
    creationTime: user.metadata?.creationTime ?? null,
  };
}

async function readLocationPermissions(): Promise<LocationPermissionReadings> {
  const [foreground, background] = await Promise.all([
    Location.getForegroundPermissionsAsync(),
    readBackgroundPermissionSnapshot(),
  ]);
  return {
    foreground: {
      granted: foreground.status === 'granted',
      decided: foreground.status !== 'undetermined',
    },
    background: {
      granted: isBackgroundPermissionEffectivelyGranted(background),
      decided: background.status !== 'undetermined',
    },
  };
}

/** Verified state lives behind callables, so it is read once per account and mode. */
async function readVerifiedSocials(
  mode: 'personal' | 'professional',
): Promise<VerifiedSocialState> {
  const [youtube, tiktok, instagram, x] = await Promise.allSettled([
    import('../social/youtubeOwnership').then(async (m) =>
      (await m.getYoutubeOwnershipClient()).get(mode),
    ),
    import('../social/tiktokOwnership').then(async (m) =>
      (await m.getTiktokOwnershipClient()).get(mode),
    ),
    import('../social/instagramOwnership').then(async (m) =>
      (await m.getInstagramOwnershipClient()).get(mode),
    ),
    import('../social/xOwnership').then(async (m) =>
      (await m.getXOwnershipClient()).get(mode),
    ),
  ]);
  return combineVerifiedSocialReads({ youtube, tiktok, instagram, x });
}

let started = false;

export function startAnalyticsRuntime(): void {
  if (started) return;
  started = true;

  const config = resolveAnalyticsConfig({
    enabledFlag: process.env.EXPO_PUBLIC_POSTHOG_ENABLED,
    distributionChannel: process.env.EXPO_PUBLIC_POSTHOG_DISTRIBUTION_CHANNEL,
    allowDevelopmentFlag: process.env.EXPO_PUBLIC_POSTHOG_ALLOW_DEVELOPMENT,
    token: process.env.EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN,
    firebaseEnv: process.env.EXPO_PUBLIC_NEARSY_FIREBASE_ENV,
    isDevBundle: __DEV__,
    attributionHosts: process.env.EXPO_PUBLIC_ATTRIBUTION_LINK_HOSTS,
    generationIdSince: process.env.EXPO_PUBLIC_POSTHOG_GENERATION_ID_SINCE_MS,
  });
  if (config.generationIdSinceInvalid) log('generation_id_since_invalid');
  if (!config.enabled) return;
  markAnalyticsConfigured();

  const store: StringStore = AsyncStorage;
  const deletionRecords = createDeletionRecords(store);
  const verifiedMemory = createVerifiedSocialMemory(store);
  const client = createAnalyticsClient({
    config,
    createTransport: async () => {
      const transport = await createPostHogTransport(config, log);
      // Before any queued operation, so nothing recorded as deleted can leave.
      if (transport) await deletionRecords.purgeQueued(transport);
      return transport;
    },
    binary: readBinaryInfo,
    readSession: readLiveSession,
    logger: log,
  });

  const lastSentByUid = new Map<string, Record<string, string>>();
  /** uid|mode whose verified state was sent in this process. */
  const verifiedSentFor = new Set<string>();
  const verifiedByKey = new Map<string, VerifiedSocialState>();
  const lastModeByUid = new Map<string, string | null>();
  let syncTimer: ReturnType<typeof setTimeout> | null = null;
  let attributionTimer: ReturnType<typeof setTimeout> | null = null;
  let lastPermissionPerson: string | null = null;
  let lastSeenUid: string | null = null;
  let verifiedGeneration = 0;
  let syncChain: Promise<void> = Promise.resolve();

  async function syncProfile(uid: string): Promise<void> {
    const doc = (await getUserProfile(uid)) as Record<string, unknown> | null;
    if (!doc || client.currentAuth()?.uid !== uid) return;
    const mode =
      doc.mode === 'personal' || doc.mode === 'professional' ? doc.mode : null;
    let verified: VerifiedSocialState = null;
    if (mode) {
      const key = `${uid}|${mode}`;
      const cached = verifiedByKey.get(key);
      if (cached) {
        verified = cached;
      } else {
        const generation = verifiedGeneration;
        const read = await readVerifiedSocials(mode);
        if (generation !== verifiedGeneration) {
          // A connection changed during the read: treat this result as unknown.
          verified = null;
        } else if (client.currentAuth()?.uid === uid) {
          // Platforms this read could not prove keep their last proved value.
          verified = await verifiedMemory.merge(uid, mode, read);
          if (verified) verifiedByKey.set(key, verified);
        }
      }
    }
    if (client.currentAuth()?.uid !== uid) return;
    const verifiedKey = `${uid}|${mode}`;
    const previousMode = lastModeByUid.get(uid);
    const { patch, next } = diffPersonProperties(
      lastSentByUid.get(uid) ?? {},
      buildPersonProperties(doc, verified, new Date(), {
        verifiedConfirmedForMode:
          previousMode === mode && verifiedSentFor.has(verifiedKey),
      }),
    );
    lastModeByUid.set(uid, mode);
    if (verified) verifiedSentFor.add(verifiedKey);
    lastSentByUid.set(uid, next);
    client.setPersonProperties(uid, patch.set, {}, patch.unset);
  }

  function scheduleProfileSync(uid: string): void {
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      syncTimer = null;
      // One at a time, so an older read can never finish after a newer one.
      syncChain = syncChain
        .then(() => syncProfile(uid))
        .catch(() => {
          log('profile_sync_failed');
        });
    }, PROFILE_SYNC_DEBOUNCE_MS);
  }

  const permissions = createLocationPermissionObserver({
    store,
    read: readLocationPermissions,
    onChange: (kind, granted) => {
      client.captureForCurrentUser(
        kind === 'foreground' ? 'foreground_location' : 'background_location',
        { granted },
      );
    },
    onState: (readings) => {
      const user = client.currentAuth();
      if (!user) return;
      const key = `${user.uid}|${readings.foreground.granted}|${readings.background.granted}`;
      if (key === lastPermissionPerson) return;
      lastPermissionPerson = key;
      client.setPersonProperties(user.uid, {
        foreground_location_granted: readings.foreground.granted,
        background_location_granted: readings.background.granted,
      });
    },
  });

  const foreground = createForegroundTracker();
  const services: AnalyticsServices = {
    client,
    noteExternalAuthFlow: (active) => {
      if (active) foreground.beginExternalFlow();
      else foreground.endExternalFlow();
    },
    ledger: createEventLedger(store),
    attribution: createPendingAttributionStore(store),
    attributionHosts: config.attributionHosts,
    now: () => Date.now(),
    sha256Hex: async (input) => {
      const Crypto = require('expo-crypto') as typeof import('expo-crypto');
      return Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        input,
      );
    },
    scheduleProfileSync,
    noteVerifiedSocialsChanged: (uid) => {
      verifiedGeneration += 1;
      for (const key of [...verifiedByKey.keys()]) {
        if (key.startsWith(`${uid}|`)) verifiedByKey.delete(key);
      }
      scheduleProfileSync(uid);
    },
    observeLocationPermissions: (kind) => {
      if (client.currentAuth()) void permissions.observe(kind);
    },
  };

  function onAuthChanged(next: AuthSnapshot | null): void {
    client.reportAuthState(next);
    if (attributionTimer) {
      clearTimeout(attributionTimer);
      attributionTimer = null;
    }
    if (!next) {
      lastPermissionPerson = null;
      verifiedByKey.clear();
      lastSentByUid.clear();
      lastModeByUid.clear();
      verifiedSentFor.clear();
      lastSeenUid = null;
      return;
    }
    if (lastSeenUid !== next.uid) {
      lastSeenUid = next.uid;
      scheduleProfileSync(next.uid);
      void permissions.observe(null);
    }
    attributionTimer = setTimeout(() => {
      attributionTimer = null;
      if (client.currentAuth()?.uid !== next.uid) return;
      void resolvePendingAttribution(services, next).catch(() => {});
    }, ATTRIBUTION_RESOLVE_DELAY_MS);
  }

  let foregroundReady = false;
  function ensureForegroundStarted(): void {
    if (foregroundReady) return;
    foregroundReady = true;
    bindAnalyticsServices(services);
    void client.start();
    // Before the Auth listener, so a closure already set wins over its first report.
    // Intent (request in flight or uncertain), cancellation and confirmed deletion
    // come from the deletion modules, which never wait on analytics.
    let sessionHoldUid: string | null = null;
    let recordedIntentUid: string | null = null;
    const syncAccountDeletion = () => {
      const closure = getAccountDeletionClosure();
      if (closure) {
        void deletionRecords
          .record(closure.uid, 'confirmed', Date.now(), client.distinctIdsFor(closure.uid))
          .catch(() => {});
        void verifiedMemory.forget(closure.uid).catch(() => {});
        recordedIntentUid = null;
        client.holdAccount(null);
        client.discardAccount(closure.uid);
        return;
      }
      if (client.clearClosedAccount()) {
        // The Auth listener may have reported this sign-in while it was blocked.
        lastSeenUid = null;
        onAuthChanged(readLiveSession());
      }
      if (!isAccountDeletionSessionActive()) sessionHoldUid = null;
      else sessionHoldUid ??= client.currentAuth()?.uid ?? null;
      const holdUid = getPendingAccountDeletionState().pending?.uid ?? sessionHoldUid;
      client.holdAccount(holdUid);
      if (holdUid && holdUid !== recordedIntentUid) {
        recordedIntentUid = holdUid;
        void deletionRecords
          .record(holdUid, 'intent', Date.now(), client.distinctIdsFor(holdUid))
          .catch(() => {});
      } else if (!holdUid && recordedIntentUid) {
        void deletionRecords.cancelIntent(recordedIntentUid).catch(() => {});
        recordedIntentUid = null;
      }
    };
    subscribeAccountDeletionClosure(syncAccountDeletion);
    subscribeAccountDeletionSession(syncAccountDeletion);
    subscribePendingAccountDeletion(syncAccountDeletion);
    syncAccountDeletion();
    firebaseAuth.onAuthStateChanged((user: unknown) => {
      onAuthChanged(toSnapshot(user));
    });
    if (config.attributionHosts.length > 0) {
      void Linking.getInitialURL()
        .then((url) => handleCampaignLink(url))
        .catch(() => {});
      Linking.addEventListener('url', ({ url }) => handleCampaignLink(url));
    }
  }

  async function captureAppOpened(openType: AppOpenType): Promise<void> {
    await client.start();
    client.runWhenAuthKnown(() => {
      client.captureDeviceEvent('app_opened', {
        open_type: openType,
        session_id: client.getSessionId() ?? undefined,
      });
    });
  }

  function onAppState(state: string): void {
    const openType = foreground.onAppState(state);
    if (state === 'active') ensureForegroundStarted();
    if (openType) {
      void captureAppOpened(openType).catch(() => {
        log('app_opened_failed');
      });
      const user = client.currentAuth();
      if (user) scheduleProfileSync(user.uid);
    }
    // Includes inactive → active, which is how Settings and dialogs come back.
    if (state === 'active') services.observeLocationPermissions(null);
  }

  AppState.addEventListener('change', onAppState);
  onAppState(AppState.currentState);
}

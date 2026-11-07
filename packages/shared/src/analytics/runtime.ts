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
import { HAS_SEEN_WELCOME_STORAGE_KEY } from '../onboarding/welcomeStorage';
import { getUserProfile } from '../services/firestoreService';
import { APPEARANCE_STORAGE_KEY } from '../theme/themeStorage';
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
import { createEventLedger } from './ledger';
import {
  createForegroundTracker,
  FIRST_OPEN_MARKER_KEY,
  resolveIsFirstOpen,
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
  try {
    const [youtube, tiktok, instagram, x] = await Promise.all([
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
    const state: Partial<Record<AnalyticsSocialPlatform, boolean>> = {
      youtube: youtube.result === 'verified',
      tiktok: tiktok.result === 'verified',
      instagram: instagram.result === 'verified',
      x: x.result === 'verified',
    };
    return state;
  } catch {
    // Unknown never erases a connection already reported.
    return null;
  }
}

let started = false;

export function startAnalyticsRuntime(): void {
  if (started) return;
  started = true;

  const config = resolveAnalyticsConfig({
    enabledFlag: process.env.EXPO_PUBLIC_POSTHOG_ENABLED,
    allowDevelopmentFlag: process.env.EXPO_PUBLIC_POSTHOG_ALLOW_DEVELOPMENT,
    token: process.env.EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN,
    firebaseEnv: process.env.EXPO_PUBLIC_NEARSY_FIREBASE_ENV,
    isDevBundle: __DEV__,
    attributionHosts: process.env.EXPO_PUBLIC_ATTRIBUTION_LINK_HOSTS,
  });
  if (!config.enabled) return;
  markAnalyticsConfigured();

  const store: StringStore = AsyncStorage;
  const client = createAnalyticsClient({
    config,
    createTransport: () => createPostHogTransport(config, log),
    binary: readBinaryInfo,
    readSession: readLiveSession,
    logger: log,
  });

  const lastSentByUid = new Map<string, Record<string, string>>();
  const verifiedByKey = new Map<string, VerifiedSocialState>();
  let syncTimer: ReturnType<typeof setTimeout> | null = null;
  let attributionTimer: ReturnType<typeof setTimeout> | null = null;
  let lastPermissionPerson: string | null = null;
  let lastSeenUid: string | null = null;

  async function syncProfile(uid: string): Promise<void> {
    const doc = (await getUserProfile(uid)) as Record<string, unknown> | null;
    if (!doc || client.currentAuth()?.uid !== uid) return;
    const mode =
      doc.mode === 'personal' || doc.mode === 'professional' ? doc.mode : null;
    let verified: VerifiedSocialState = null;
    if (mode) {
      const key = `${uid}|${mode}`;
      if (!verifiedByKey.has(key) || verifiedByKey.get(key) === null) {
        verifiedByKey.set(key, await readVerifiedSocials(mode));
      }
      verified = verifiedByKey.get(key) ?? null;
    }
    if (client.currentAuth()?.uid !== uid) return;
    const { patch, next } = diffPersonProperties(
      lastSentByUid.get(uid) ?? {},
      buildPersonProperties(doc, verified, new Date()),
    );
    lastSentByUid.set(uid, next);
    client.setPersonProperties(uid, patch.set, {}, patch.unset);
  }

  function scheduleProfileSync(uid: string): void {
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      syncTimer = null;
      void syncProfile(uid).catch(() => {
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
        foreground_location: readings.foreground.granted,
        background_location: readings.background.granted,
      });
    },
  });

  const services: AnalyticsServices = {
    client,
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

  let firstOpenPending = true;
  async function captureAppOpened(openType: AppOpenType): Promise<void> {
    await client.start();
    let markerRecorded = true;
    let legacyUseEvidence = true;
    let firstOpenKnown = true;
    if (firstOpenPending) {
      firstOpenPending = false;
      try {
        const [marker, welcome, appearance] = await Promise.all([
          store.getItem(FIRST_OPEN_MARKER_KEY),
          store.getItem(HAS_SEEN_WELCOME_STORAGE_KEY),
          store.getItem(APPEARANCE_STORAGE_KEY),
        ]);
        markerRecorded = marker !== null;
        legacyUseEvidence = welcome !== null || appearance !== null;
        if (!markerRecorded) await store.setItem(FIRST_OPEN_MARKER_KEY, '1');
      } catch {
        // Unreadable storage: is_first_open is omitted rather than guessed.
        firstOpenKnown = false;
      }
    }
    client.runWhenAuthKnown(() => {
      client.captureDeviceEvent('app_opened', {
        open_type: openType,
        is_first_open: firstOpenKnown
          ? resolveIsFirstOpen({
              markerRecorded,
              legacyUseEvidence,
              hasSession: client.currentAuth() !== null,
            })
          : undefined,
        session_id: client.getSessionId() ?? undefined,
      });
    });
  }

  const foreground = createForegroundTracker();
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

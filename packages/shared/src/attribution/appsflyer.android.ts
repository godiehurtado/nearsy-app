/**
 * AppsFlyer on Android (react-native-appsflyer 7, New Architecture). Contract
 * nc1 lives in oneLinkContract.ts; this file only wires the SDK.
 *
 * - Off unless the build enables it with a dev key (extra.nearsyAppsFlyer).
 * - OAuth and every other non-OneLink URL never reach the SDK: a cold start whose
 *   launch URL is not a OneLink skips AppsFlyer for the whole process, and the
 *   native MainActivity only calls setIntent() for OneLink (withNearsyAppsFlyer).
 * - Privacy before start(): no advertising ids (AD_ID is also removed from the
 *   manifest), no Android ID, no network data, no App Set ID, no partner sharing.
 *   No customer user id, no in-app events, no S2S. The settings are runtime-only,
 *   so they are applied on every launch.
 * - Order required by v7: deep-link listener, init, conversion and session-ready
 *   listeners, then start() inside the session-ready callback.
 */
import { Linking } from 'react-native';

import { noteOneLinkTouch } from '../analytics/analytics';
import { firebaseAuth } from '../config/firebaseConfig.android';
import {
  createDestinationStore,
  isOneLinkUrl,
  readConversionFallback,
  readUnifiedDeepLink,
  resolveAppsFlyerSettings,
  type OneLinkDestination,
  type OneLinkReading,
} from './oneLinkContract';

let started = false;
/** UDL found a deferred link on this launch: conversion data must not act again. */
let deferredHandled = false;
const listeners = new Set<() => void>();

function readSettings() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Constants = require('expo-constants').default ?? require('expo-constants');
    return resolveAppsFlyerSettings(Constants.expoConfig?.extra?.nearsyAppsFlyer);
  } catch {
    return resolveAppsFlyerSettings(null);
  }
}

function destinations() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const storage = require('@react-native-async-storage/async-storage').default;
  return createDestinationStore({ storage, now: () => Date.now() });
}

async function readInstallTime(): Promise<number | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Application = require('expo-application');
    const value = (await Application.getInstallationTimeAsync())?.getTime?.();
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

async function handleReading(reading: OneLinkReading, observedAt: number): Promise<void> {
  if (reading.touch) {
    // A deferred result describes the install, which precedes any signup made with it.
    const at = reading.deferred ? ((await readInstallTime()) ?? observedAt) : observedAt;
    noteOneLinkTouch(reading.touch, at);
  }
  if (reading.destination) {
    const offered = await destinations().offer(reading.destination, {
      deferred: reading.deferred,
      uid: firebaseAuth.currentUser?.uid ?? null,
    });
    if (offered) for (const listener of listeners) listener();
  }
}

function onDeepLinking(result: unknown): void {
  try {
    const reading = readUnifiedDeepLink(result);
    if (!reading) return;
    if (reading.deferred) deferredHandled = true;
    void handleReading(reading, Date.now()).catch(() => {});
  } catch {
    // Attribution must never interrupt the product flow.
  }
}

function onConversionData(result: unknown): void {
  try {
    if (deferredHandled) return;
    const reading = readConversionFallback(result);
    if (!reading) return;
    deferredHandled = true;
    void handleReading(reading, Date.now()).catch(() => {});
  } catch {
    // Attribution must never interrupt the product flow.
  }
}

async function run(devKey: string): Promise<void> {
  const initialUrl = await Linking.getInitialURL().catch(() => null);
  // Launched by an OAuth return or any other non-OneLink address: AppsFlyer stays
  // off for this process so it never reads that intent. Costs one session.
  if (initialUrl && !isOneLinkUrl(initialUrl)) return;

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AppsFlyer } = require('react-native-appsflyer');
  await AppsFlyer.registerDeepLinkListener({ onDeepLinking });
  await AppsFlyer.init({ devKey });
  void AppsFlyer.registerConversionListener({
    onConversionDataSuccess: onConversionData,
    onConversionDataFail: () => {},
  });
  void AppsFlyer.registerSessionReadyListener(() => {
    void (async () => {
      await AppsFlyer.setDisableAdvertisingIdentifiers({ disable: true });
      await AppsFlyer.setCollectAndroidID({ isCollect: false });
      await AppsFlyer.setDisableNetworkData({ isDisable: true });
      await AppsFlyer.disableAppSetId();
      await AppsFlyer.setSharingFilterForPartners({ partners: ['all'] });
      await AppsFlyer.start();
      // The SDK reads the launch intent only after init; resolve the OneLink
      // that opened the app. A second delivery is dropped by the 10-minute dedupe.
      if (isOneLinkUrl(initialUrl)) {
        await AppsFlyer.performDeepLinking({ url: initialUrl, shouldTriggerSession: false });
      }
    })().catch(() => {});
  });
}

/** Once per process, from the mounted app. */
export function startAppsFlyer(): void {
  if (started) return;
  started = true;
  try {
    const settings = readSettings();
    if (!settings.enabled) return;
    // Sign-out clears the pending destination (C6).
    let lastUid = firebaseAuth.currentUser?.uid ?? null;
    firebaseAuth.onAuthStateChanged((user) => {
      const uid = user?.uid ?? null;
      if (lastUid !== null && uid === null) void destinations().clear().catch(() => {});
      lastUid = uid;
    });
    void run(settings.devKey).catch(() => {});
  } catch {
    // Attribution must never interrupt app startup.
  }
}

export async function takeOneLinkDestination(uid: string): Promise<OneLinkDestination | null> {
  try {
    return await destinations().take(uid);
  } catch {
    return null;
  }
}

export function onOneLinkDestination(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}


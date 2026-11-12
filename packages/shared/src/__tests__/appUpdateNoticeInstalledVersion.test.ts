/**
 * 2.0.11 — the optional update notice reads the installed binary version from
 * expo-application.
 *
 * Reproduces the 2.0.9 / 2.0.10 defect from the installed packages themselves:
 * the iOS Constants object is rebuilt from the constants dictionary that the
 * installed expo-constants native module exports, so nothing invents
 * `nativeAppVersion`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseAppUpdateNoticeConfig } from '../appUpdateNotice/contract';
import { createAppUpdateNoticeController } from '../appUpdateNotice/controller';
import { decideAppUpdateNotice } from '../appUpdateNotice/decision';
import {
  readInstalledNativeVersion,
  readInstalledNativeVersionFromApplication,
  type InstalledVersionSource,
} from '../appUpdateNotice/nativeVersion';
import {
  APP_UPDATE_NOTICE_SNOOZE_MS,
  type AppUpdateNoticeSnoozeRecord,
} from '../appUpdateNotice/snooze';
import { IOS_APP_STORE_LISTING_URL } from '../appUpdateNotice/storeListing';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..', '..');
// Resolve the packages exactly as the iOS app does.
const iosRequire = createRequire(join(repoRoot, 'apps', 'nearsy-ios', 'package.json'));

function installedPackageDir(name: string): string {
  return dirname(iosRequire.resolve(`${name}/package.json`));
}

function readInstalled(name: string, relative: string): string {
  return readFileSync(join(installedPackageDir(name), relative), 'utf8');
}

/** Keys of the dictionary returned by EXConstantsService `constants`. */
function installedIosConstantKeys(): string[] {
  const source = readInstalled('expo-constants', 'ios/EXConstantsService.m');
  const start = source.indexOf('return @{');
  assert.ok(start > 0, 'EXConstantsService constants dictionary not found');
  const end = source.indexOf('};', start);
  const body = source.slice(start, end);
  // Top-level keys only: lines with exactly 11 spaces of indentation.
  return [...body.matchAll(/^ {11}@"(\w+)":/gm)].map((m) => m[1]);
}

/**
 * The iOS `Constants` object as expo-constants 18 builds it in Constants.js:
 * `{ ...nativeConstants, appOwnership: null }` plus the expoConfig getter.
 */
function installedIosConstantsObject(): Record<string, unknown> {
  const native: Record<string, unknown> = {};
  for (const key of installedIosConstantKeys()) native[key] = `<${key}>`;
  const { name: _name, appOwnership, ...nativeConstants } = native;
  return {
    ...nativeConstants,
    appOwnership: appOwnership ?? null,
    expoConfig: { version: '2.0.9' },
  };
}

/** The 2.0.9 / 2.0.10 reader, verbatim (nativeVersion.ts at 3f248cc). */
function legacyReadInstalledNativeVersionFromConstants(constants: {
  nativeAppVersion?: unknown;
  expoConfig?: { version?: unknown } | null;
}): string | null {
  const native = constants.nativeAppVersion;
  if (typeof native === 'string' && native.trim()) return native.trim();
  return null;
}

/** Live getAppUpdatePolicy v2 body (Functions, getappupdatepolicy-00003-cav). */
const LIVE_POLICY = {
  platform: 'ios',
  channel: 'production',
  appId: '6759302206',
  softEnabled: true,
  recommended: { marketingVersion: '2.0.10', build: '0' },
  forceEnabled: false,
  minimum: { marketingVersion: '', build: '' },
  updateUrl: IOS_APP_STORE_LISTING_URL,
  cacheTtlSeconds: 3600,
  enabled: true,
  latestVersion: '2.0.10',
  storeUrl: IOS_APP_STORE_LISTING_URL,
};

function liveConfig() {
  const parsed = parseAppUpdateNoticeConfig(LIVE_POLICY);
  assert.ok(parsed.ok);
  return parsed.config;
}

function memorySnooze() {
  let record: AppUpdateNoticeSnoozeRecord | null = null;
  return {
    store: {
      read: async () => record,
      write: async (next: AppUpdateNoticeSnoozeRecord) => {
        record = next;
      },
    },
    get: () => record,
  };
}

describe('defect in 2.0.9 / 2.0.10: Constants.nativeAppVersion does not exist', () => {
  it('the installed expo-constants iOS module exports no nativeAppVersion', () => {
    const keys = installedIosConstantKeys();
    assert.ok(keys.includes('sessionId') && keys.includes('platform'), keys.join(','));
    assert.equal(keys.includes('nativeAppVersion'), false);
    const types = readInstalled('expo-constants', 'build/Constants.types.d.ts');
    assert.doesNotMatch(types, /^\s*nativeAppVersion\??\s*:/m);
    const changelog = readInstalled('expo-constants', 'CHANGELOG.md');
    assert.match(changelog, /Remove deprecated[^\n]*nativeAppVersion/);
  });

  it('the old reader gets null on the real Constants shape, so the notice is skipped', () => {
    const constants = installedIosConstantsObject();
    assert.equal('nativeAppVersion' in constants, false);
    const installed = legacyReadInstalledNativeVersionFromConstants(constants);
    assert.equal(installed, null);
    assert.equal(
      decideAppUpdateNotice({
        config: liveConfig(),
        installedNativeVersion: installed,
        platform: 'ios',
        nowMs: 1_000,
        snooze: null,
      }),
      'skip',
    );
  });
});

describe('fix: expo-application nativeApplicationVersion', () => {
  it('the installed expo-application reads CFBundleShortVersionString', () => {
    const swift = readInstalled('expo-application', 'ios/ApplicationModule.swift');
    assert.match(
      swift,
      /Constant\("nativeApplicationVersion"\)\s*\{\s*infoPlist\?\["CFBundleShortVersionString"\]/,
    );
    const js = readInstalled('expo-application', 'build/Application.js');
    assert.match(js, /export const nativeApplicationVersion = ExpoApplication/);
  });

  it('reads 2.0.9, decides show and presents the optional notice for 2.0.10', async () => {
    const application: InstalledVersionSource = {
      nativeApplicationVersion: '2.0.9',
    };
    const installed = readInstalledNativeVersion(() => application);
    assert.equal(installed, '2.0.9');
    assert.equal(
      decideAppUpdateNotice({
        config: liveConfig(),
        installedNativeVersion: installed,
        platform: 'ios',
        nowMs: 1_000,
        snooze: null,
      }),
      'show',
    );

    const presented: string[] = [];
    const opened: string[] = [];
    const controller = createAppUpdateNoticeController({
      nowMs: () => 1_000,
      platform: 'ios',
      readInstalledNativeVersion: () => readInstalledNativeVersion(() => application),
      loadNotice: async () => LIVE_POLICY,
      snoozeStore: memorySnooze().store,
      isSensitiveSession: () => false,
      present: async (version) => {
        presented.push(version);
        return 'update';
      },
      openStoreListing: (url) => {
        opened.push(url);
      },
    });
    await controller.consult('open');
    assert.deepEqual(presented, ['2.0.10']);
    assert.deepEqual(opened, [IOS_APP_STORE_LISTING_URL]);
  });

  it('"Later" still snoozes 2.0.10 for 24 hours', async () => {
    let now = 1_000;
    const snooze = memorySnooze();
    let presents = 0;
    const controller = createAppUpdateNoticeController({
      nowMs: () => now,
      platform: 'ios',
      readInstalledNativeVersion: () =>
        readInstalledNativeVersion(() => ({ nativeApplicationVersion: '2.0.9' })),
      loadNotice: async () => LIVE_POLICY,
      snoozeStore: snooze.store,
      isSensitiveSession: () => false,
      present: async () => {
        presents += 1;
        return 'later';
      },
      openStoreListing: () => {
        throw new Error('should not open');
      },
      fetchThrottleMs: 0,
    });
    await controller.consult('open');
    assert.deepEqual(snooze.get(), {
      platform: 'ios',
      latestVersion: '2.0.10',
      untilMs: 1_000 + APP_UPDATE_NOTICE_SNOOZE_MS,
    });
    now += APP_UPDATE_NOTICE_SNOOZE_MS - 1;
    await controller.consult('foreground');
    assert.equal(presents, 1);
    now += 2;
    await controller.consult('foreground');
    assert.equal(presents, 2);
  });

  it('2.0.10 installed does not see a notice for 2.0.10', () => {
    assert.equal(
      decideAppUpdateNotice({
        config: liveConfig(),
        installedNativeVersion: readInstalledNativeVersionFromApplication({
          nativeApplicationVersion: '2.0.10',
        }),
        platform: 'ios',
        nowMs: 1_000,
        snooze: null,
      }),
      'skip',
    );
  });
});

describe('missing or invalid installed version never blocks the app', () => {
  const invalid: Array<[string, () => InstalledVersionSource | null | undefined]> = [
    ['module throws on load', () => {
      throw new Error('Cannot find native module ExpoApplication');
    }],
    ['module is null', () => null],
    ['value is null', () => ({ nativeApplicationVersion: null })],
    ['value is empty', () => ({ nativeApplicationVersion: '   ' })],
    ['value has a build suffix', () => ({ nativeApplicationVersion: '2.0.9 (70)' })],
    ['value is a prerelease', () => ({ nativeApplicationVersion: '2.0.9-beta' })],
    ['value is a number', () => ({ nativeApplicationVersion: 209 })],
  ];

  for (const [label, load] of invalid) {
    it(`${label}: null version, notice skipped, consult completes`, async () => {
      assert.equal(readInstalledNativeVersion(load), null);
      let presents = 0;
      const controller = createAppUpdateNoticeController({
        nowMs: () => 1_000,
        platform: 'ios',
        readInstalledNativeVersion: () => readInstalledNativeVersion(load),
        loadNotice: async () => LIVE_POLICY,
        snoozeStore: memorySnooze().store,
        isSensitiveSession: () => false,
        present: async () => {
          presents += 1;
          return 'later';
        },
        openStoreListing: () => {},
      });
      await assert.doesNotReject(controller.consult('open'));
      assert.equal(presents, 0);
      assert.equal(controller.isModalOpen(), false);
    });
  }

  it('trims surrounding whitespace from a valid version', () => {
    assert.equal(
      readInstalledNativeVersionFromApplication({ nativeApplicationVersion: ' 2.0.9 ' }),
      '2.0.9',
    );
  });
});

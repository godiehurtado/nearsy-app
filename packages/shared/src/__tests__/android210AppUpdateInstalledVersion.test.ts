/**
 * 2.1.0 audit of the Android optional update notice. The installed version
 * came from `Constants.nativeAppVersion`, which expo-constants 18 no longer
 * provides, so the notice could never show. It now comes from expo-application
 * (versionName), the same source as More > About.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createAppUpdateNoticeSession } from '../appUpdate/noticeSession.ts';
import { storeVersionFromApplication } from '../appUpdate/parsePolicy.ts';
import { ANDROID_PLAY_STORE_URL } from '../appUpdate/contract.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const requireFromApp = createRequire(path.resolve(here, '../../../../apps/nearsy-android/package.json'));

function installedTypes(pkg: string, file: string): string {
  const dir = path.dirname(requireFromApp.resolve(`${pkg}/package.json`));
  return readFileSync(path.join(dir, file), 'utf8');
}

async function runSession(installedVersion: string | null, latestVersion: string) {
  const presented: string[] = [];
  const session = createAppUpdateNoticeSession({
    platform: 'android',
    now: () => 1_000_000,
    fetchPolicy: async () => ({
      platform: 'android',
      channel: 'production',
      enabled: true,
      latestVersion,
      storeUrl: ANDROID_PLAY_STORE_URL,
    }),
    getInstalledVersion: () => installedVersion,
    readPostpone: async () => null,
    writePostpone: async () => {},
    presentNotice: ({ latestVersion: shown }) => void presented.push(shown),
    openStoreUrl: () => {},
    getCopy: () => ({ title: 't', message: 'm', update: 'u', later: 'l' }),
    isAppActive: () => true,
    delay: async () => {},
    settleMs: 0,
  });
  await session.consult('start');
  await new Promise((resolve) => setTimeout(resolve, 10));
  session.dispose();
  return presented;
}

describe('installed version source', () => {
  it('the installed expo-constants has no nativeAppVersion; expo-application has nativeApplicationVersion', () => {
    assert.doesNotMatch(installedTypes('expo-constants', 'build/Constants.types.d.ts'), /nativeAppVersion/);
    assert.match(installedTypes('expo-application', 'build/Application.d.ts'), /nativeApplicationVersion/);
  });

  it('reads versionName from expo-application and rejects anything else', () => {
    assert.equal(storeVersionFromApplication({ nativeApplicationVersion: '2.0.10' }), '2.0.10');
    assert.equal(storeVersionFromApplication({ nativeApplicationVersion: ' 2.1.0 ' }), '2.1.0');
    assert.equal(storeVersionFromApplication({ nativeApplicationVersion: '2.1' }), null);
    assert.equal(storeVersionFromApplication({ nativeApplicationVersion: null }), null);
    assert.equal(storeVersionFromApplication(null), null);
  });

  it('the Android service no longer reads Constants', () => {
    const android = readFileSync(path.join(here, '..', 'appUpdate', 'appUpdate.android.ts'), 'utf8');
    assert.doesNotMatch(android, /expo-constants|nativeAppVersion/);
    assert.match(android, /storeVersionFromApplication\(require\('expo-application'\)\)/);
  });
});

describe('the real notice session', () => {
  it('shows the optional notice when an older version is installed', async () => {
    const installed = storeVersionFromApplication({ nativeApplicationVersion: '2.0.10' });
    assert.deepEqual(await runSession(installed, '2.1.0'), ['2.1.0']);
  });

  it('stays silent when up to date, and when the version is unknown (the old defect)', async () => {
    assert.deepEqual(await runSession('2.1.0', '2.1.0'), []);
    // What Constants.nativeAppVersion gave on expo-constants 18: nothing.
    assert.deepEqual(await runSession(null, '2.1.0'), []);
  });
});

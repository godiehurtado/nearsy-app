/**
 * Android 2.0.9 optional update notice — wiring guards.
 * Simulated policy only; production `enabled` stays a Functions env flag.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function read(relativeFromSharedSrc: string): string {
  return readFileSync(join(here, '..', relativeFromSharedSrc), 'utf8');
}

describe('209 optional Play update notice wiring', () => {
  it('Android client consumes getAppUpdatePolicy on visibility Functions', () => {
    const android = read('appUpdate/appUpdate.android.ts');
    assert.match(android, /APP_UPDATE_CALLABLE_NAME/);
    assert.match(android, /getAppUpdatePolicy/);
    assert.match(android, /us-central1/);
    assert.match(android, /nativeAppVersion/);
    assert.match(android, /ensureAppCheckInitialized/);
    assert.doesNotMatch(android, /getIdentityFunctions/);
    assert.doesNotMatch(android, /currentUser/);
    assert.doesNotMatch(android, /firebaseAuth/);
    assert.doesNotMatch(android, /getIdToken/);
    assert.doesNotMatch(android, /APP_UPDATE_ANDROID_ENABLED/);
    assert.match(android, /ANDROID_APP_UPDATE_POLICY_REQUEST/);
    assert.match(android, /callable\(ANDROID_APP_UPDATE_POLICY_REQUEST\)/);
  });

  it('request/response stay on the canonical contract', () => {
    const contract = read('appUpdate/contract.ts');
    assert.match(contract, /enabled: boolean/);
    assert.match(contract, /latestVersion: string/);
    assert.match(contract, /storeUrl: string/);
    assert.match(
      contract,
      /https:\/\/play\.google\.com\/store\/apps\/details\?id=com\.nearsy\.app/,
    );
    assert.doesNotMatch(contract, /minVersion:/);
    assert.match(contract, /intentionally absent/);
  });

  it('session consults start + foreground without stacking modals', () => {
    const session = read('appUpdate/noticeSession.ts');
    assert.match(session, /reason: AppUpdateNoticeConsultReason/);
    assert.match(session, /'start' \| 'foreground'/);
    assert.match(session, /modalVisible/);
    assert.match(session, /FOREGROUND_SETTLE_MS/);
    assert.match(session, /POSTPONE_DURATION_MS = 24 \* 60 \* 60 \* 1000/);
  });

  it('Android host uses Alert + Play URL and is a no-op on other platforms', () => {
    const hook = read('appUpdate/useAppUpdateNotice.android.ts');
    const stub = read('appUpdate/useAppUpdateNotice.ts');
    const app = read('App.tsx');
    assert.match(hook, /Alert\.alert/);
    assert.match(hook, /AppState\.addEventListener/);
    assert.match(hook, /officialAndroidStoreUrl/);
    assert.match(hook, /Linking\.openURL/);
    assert.match(hook, /consult\('start'\)/);
    assert.match(hook, /consult\('foreground'\)/);
    assert.match(stub, /function useAppUpdateNotice\(\): void \{\}/);
    assert.match(app, /AppUpdateNoticeHost/);
    assert.match(app, /useAppUpdateNotice/);
  });

  it('keeps the validated Alerts silent-refresh wiring', () => {
    const screen = read('screens/AlertsScreen.tsx');
    const hook = read('hooks/useNearbyAlerts.ts');
    assert.match(screen, /shouldShowAlertsFullScreenLoading/);
    assert.doesNotMatch(screen, /if \(loading\) \{/);
    assert.match(hook, /buildAlerts\(false\)/);
    assert.match(hook, /\[useNearbyAlerts\] silent refresh/);
  });
});

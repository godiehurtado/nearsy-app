/**
 * Android 2.0.9 app-update policy v2 — wiring guards.
 * Behavior is covered in appUpdate/__tests__/appUpdateNotice.test.ts.
 * Simulated policy only; production flags stay Functions env.
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

describe('209 Play update policy v2 wiring', () => {
  it('Android client consumes getAppUpdatePolicy on visibility Functions', () => {
    const android = read('appUpdate/appUpdate.android.ts');
    assert.match(android, /APP_UPDATE_CALLABLE_NAME/);
    assert.match(android, /us-central1|APP_UPDATE_FUNCTIONS_REGION/);
    assert.match(android, /nativeAppVersion/);
    assert.match(android, /nativeBuildVersion/);
    assert.match(android, /ensureAppCheckInitialized/);
    assert.match(android, /callable\(request\)/);
    assert.doesNotMatch(android, /getIdentityFunctions/);
    assert.doesNotMatch(android, /currentUser/);
    assert.doesNotMatch(android, /firebaseAuth/);
    assert.doesNotMatch(android, /getIdToken/);
    assert.doesNotMatch(android, /APP_UPDATE_ANDROID_ENABLED/);
  });

  it('contract copy tracks Functions PR #43 and invents no alternate fields', () => {
    const contract = read('appUpdate/contract.ts');
    assert.match(contract, /5e524d1cd2cfa7b3d58137bd5d07cda71e927a45/);
    for (const field of [
      'softEnabled',
      'recommended',
      'forceEnabled',
      'minimum',
      'updateUrl',
      'cacheTtlSeconds',
      'enabled: boolean',
      'latestVersion: string',
      'storeUrl: string',
    ]) {
      assert.ok(contract.includes(field), field);
    }
    assert.match(contract, /playInternal/);
    assert.doesNotMatch(contract, /minVersion:/);
    assert.doesNotMatch(contract, /required:/);
  });

  it('channel comes from the explicit build-time extra, wired through app.config + EAS', () => {
    const channel = read('appUpdate/channel.ts');
    const android = read('appUpdate/appUpdate.android.ts');
    assert.match(channel, /nearsyAppUpdateChannel/);
    assert.match(channel, /CONTRACT\.md/);
    assert.doesNotMatch(channel, /extras\??\.nearsyFirebase/);
    assert.match(android, /expoConfig\?\.extra/);
    const appConfig = readFileSync(
      join(here, '..', '..', '..', '..', 'apps', 'nearsy-android', 'app.config.js'),
      'utf8',
    );
    assert.match(appConfig, /NEARSY_APP_UPDATE_CHANNEL/);
    assert.match(appConfig, /nearsyAppUpdateChannel/);
    const eas = JSON.parse(
      readFileSync(
        join(here, '..', '..', '..', '..', 'apps', 'nearsy-android', 'eas.json'),
        'utf8',
      ),
    );
    assert.equal(
      eas.build.production.env.NEARSY_APP_UPDATE_CHANNEL,
      'production',
    );
    assert.equal(
      eas.build['production-play-internal'].env.NEARSY_APP_UPDATE_CHANNEL,
      'playInternal',
    );
    // No submit/activation wiring was added for the Internal profile.
    assert.equal(eas.submit['production-play-internal'], undefined);
  });

  it('session sends channel, falls back only for invalid-argument, fails open', () => {
    const session = read('appUpdate/noticeSession.ts');
    assert.match(session, /buildAppUpdatePolicyRequest\(activeChannel\)/);
    assert.match(session, /isInvalidArgumentError/);
    assert.match(session, /ANDROID_LEGACY_APP_UPDATE_REQUEST/);
    assert.match(session, /'start' \| 'foreground' \| 'expiry'/);
    assert.match(session, /FOREGROUND_SETTLE_MS/);
    assert.match(session, /POSTPONE_DURATION_MS = 24 \* 60 \* 60 \* 1000/);
  });

  it('Android host renders mandatory state via a Modal and is inert elsewhere', () => {
    const hook = read('appUpdate/useAppUpdateNotice.android.ts');
    const stub = read('appUpdate/useAppUpdateNotice.ts');
    const modal = read('appUpdate/AppUpdateMandatoryModal.tsx');
    const app = read('App.tsx');
    assert.match(hook, /Alert\.alert/);
    assert.match(hook, /AppState\.addEventListener/);
    assert.match(hook, /allowlistedAndroidUpdateUrl/);
    assert.match(hook, /Linking\.openURL/);
    assert.match(hook, /consult\('start'\)/);
    assert.match(hook, /consult\('foreground'\)/);
    assert.match(hook, /dismissMandatory/);
    assert.match(stub, /mandatory: null/);
    assert.match(modal, /onRequestClose=\{\(\) => \{\}\}/);
    assert.match(app, /AppUpdateNoticeHost/);
    assert.match(app, /AppUpdateMandatoryModal/);
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

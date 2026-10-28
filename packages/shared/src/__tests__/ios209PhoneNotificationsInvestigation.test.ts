/**
 * Investigation only — do not add notification infrastructure from this file.
 *
 * Phone OS notifications (this report) are not the in-app Alerts tab.
 * Contacts matching is a separate 2.0.9 debt (see iosNoContactsAccess.test.ts).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SHARED_SRC = join(here, '..');
const REPO_ROOT = join(SHARED_SRC, '..', '..', '..');

function readShared(rel: string): string {
  return readFileSync(join(SHARED_SRC, rel), 'utf8');
}

function readIosAppJson(): string {
  return readFileSync(join(REPO_ROOT, 'apps', 'nearsy-ios', 'app.json'), 'utf8');
}

describe('iOS 2.0.9 phone notifications — current evidence (no new infra)', () => {
  it('remote push path exists: CRJ permission prompt + Expo token register', () => {
    const crj = readShared('screens/ProfileCompletionScreen.tsx');
    const tokens = readShared('services/pushTokens.ts');
    const app = readShared('App.tsx');
    assert.match(crj, /async function requestNotifications/);
    assert.match(crj, /Notifications\.requestPermissionsAsync/);
    assert.match(tokens, /getPermissionsAsync/);
    assert.doesNotMatch(tokens, /requestPermissionsAsync/);
    assert.match(tokens, /getExpoPushTokenAsync/);
    assert.match(tokens, /pushTokens/);
    assert.match(app, /registerPushToken/);
    assert.match(app, /setNotificationHandler/);
    assert.match(app, /addNotificationResponseReceivedListener/);
    assert.match(app, /actorUid/);
  });

  it('does not schedule local notifications and does not confuse Alerts with OS push', () => {
    const tokens = readShared('services/pushTokens.ts');
    const alerts = readShared('screens/AlertsScreen.tsx');
    const nearby = readShared('hooks/useNearbyAlerts.ts');
    const appJson = readIosAppJson();
    assert.doesNotMatch(tokens, /scheduleNotificationAsync/);
    assert.doesNotMatch(alerts, /scheduleNotificationAsync/);
    assert.match(alerts, /useNearbyAlerts/);
    assert.match(nearby, /discoverNearby/);
    assert.match(nearby, /contact_nearby/);
    assert.match(appJson, /expo-notifications/);
    assert.doesNotMatch(appJson, /remote-notification/);
    assert.match(appJson, /"location"/);
  });

  it('this CRJ branch does not add notification packages or Contacts access', () => {
    const pkg = readFileSync(
      join(REPO_ROOT, 'apps', 'nearsy-ios', 'package.json'),
      'utf8',
    );
    const appJson = readIosAppJson();
    assert.match(pkg, /expo-notifications/);
    assert.doesNotMatch(pkg, /expo-contacts/);
    assert.doesNotMatch(appJson, /NSContactsUsageDescription/);
  });
});

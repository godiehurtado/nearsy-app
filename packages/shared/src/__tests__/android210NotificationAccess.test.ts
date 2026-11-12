/**
 * 2.1.0 More row: real Android notification access. Runtime permission
 * (Android 13+), notifications off for the app, and the push channel are told
 * apart, and More never prompts by itself.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  notificationAccessAction,
  resolveNotificationAccess,
  settingsIntentFor,
  shouldRegisterAfter,
} from '../notifications/notificationAccessCore.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NONE = 2;
const DEFAULT = 5;

const read = (apiLevel: number, status: string, granted: boolean, canAskAgain: boolean, channel: number | null = DEFAULT) =>
  resolveNotificationAccess({ apiLevel, permission: { status, granted, canAskAgain }, channelImportance: channel });

describe('Android 13 and later', () => {
  it('never asked: the row offers the system prompt', () => {
    assert.equal(read(34, 'undetermined', false, true), 'not_requested');
    assert.equal(notificationAccessAction('not_requested'), 'request');
  });

  it('denied for good: Settings, never another prompt', () => {
    assert.equal(read(34, 'denied', false, false), 'denied');
    assert.equal(notificationAccessAction('denied'), 'open_app_notification_settings');
  });

  it('dismissed but still askable: the prompt again', () => {
    assert.equal(read(33, 'denied', false, true), 'not_requested');
  });

  it('runtime permission granted but notifications off for the app: Settings, not a prompt', () => {
    assert.equal(read(34, 'denied', true, true), 'app_off');
    assert.equal(notificationAccessAction('app_off'), 'open_app_notification_settings');
  });

  it('granted with the push channel turned off: the channel screen', () => {
    assert.equal(read(34, 'granted', true, true, NONE), 'channel_off');
    assert.equal(notificationAccessAction('channel_off'), 'open_channel_settings');
    assert.equal(read(34, 'granted', true, true, DEFAULT), 'enabled');
    assert.equal(read(34, 'granted', true, true, null), 'enabled');
  });
});

describe('before Android 13', () => {
  it('there is no prompt: off always means Settings', () => {
    for (const apiLevel of [24, 28, 32]) {
      assert.equal(read(apiLevel, 'denied', false, false), 'app_off');
      assert.equal(read(apiLevel, 'denied', false, true), 'app_off');
      assert.equal(read(apiLevel, 'granted', true, true), 'enabled');
    }
  });

  it('API 24-25 have no channels and open App info', () => {
    assert.equal(read(25, 'granted', true, true, NONE), 'enabled');
    assert.deepEqual(settingsIntentFor('open_app_notification_settings', 25, 'com.nearsy.app'), { kind: 'app_details' });
  });
});

describe('settings screens and token', () => {
  it('opens the app notification screen or the default channel screen from API 26', () => {
    assert.deepEqual(settingsIntentFor('open_app_notification_settings', 30, 'com.nearsy.app'), {
      kind: 'intent',
      action: 'android.settings.APP_NOTIFICATION_SETTINGS',
      extras: [{ key: 'android.provider.extra.APP_PACKAGE', value: 'com.nearsy.app' }],
    });
    const channel = settingsIntentFor('open_channel_settings', 34, 'com.nearsy.app');
    assert.equal(channel.kind === 'intent' && channel.action, 'android.settings.CHANNEL_NOTIFICATION_SETTINGS');
    assert.ok(
      channel.kind === 'intent' &&
        channel.extras.some((e) => e.key === 'android.provider.extra.CHANNEL_ID' && e.value === 'default'),
    );
    assert.deepEqual(settingsIntentFor('open_channel_settings', 34, null), { kind: 'app_details' });
  });

  it('registers the token only when access became enabled through the row', () => {
    assert.equal(shouldRegisterAfter('not_requested', 'enabled', true), true);
    assert.equal(shouldRegisterAfter('app_off', 'enabled', true), true);
    assert.equal(shouldRegisterAfter('enabled', 'enabled', true), false);
    assert.equal(shouldRegisterAfter('app_off', 'enabled', false), false, 'a plain foreground read does not');
    assert.equal(shouldRegisterAfter(null, 'app_off', true), false);
  });

  it('a read failure is shown and retried, not hidden', () => {
    assert.equal(resolveNotificationAccess({ apiLevel: 34, permission: null, channelImportance: null }), 'unknown');
    assert.equal(notificationAccessAction('unknown'), 'refresh');
  });
});

describe('More screen', () => {
  const hook = readFileSync(path.join(root, 'notifications/useAndroidNotificationAccess.ts'), 'utf8');
  const screen = readFileSync(path.join(root, 'screens/MoreScreen.tsx'), 'utf8');

  it('prompts only from the row action, never on mount or on return', () => {
    const effect = hook.slice(hook.indexOf('useEffect('), hook.indexOf('const action'));
    assert.doesNotMatch(effect, /requestPermissionsAsync/);
    assert.equal(hook.match(/requestPermissionsAsync/g)?.length, 1);
    assert.match(hook.slice(hook.indexOf('const run')), /current === 'request'/);
    assert.doesNotMatch(screen, /Notifications\.requestPermissionsAsync/);
  });

  it('does not touch visibility or notice preferences', () => {
    assert.doesNotMatch(hook, /notifyNearby|visibility|updateUserProfile|setDoc|firestore/i);
  });

  it('the row is Android only, and a failed action shows an error', () => {
    assert.match(screen, /Platform\.OS === 'android' && notificationAccess\.state/);
    assert.match(screen, /settings\.notificationAccess\.error/);
  });

  it('EN and ES have every state', async () => {
    const { default: settingsEn } = await import('../i18n/resources/settings.ts');
    const esText = readFileSync(path.join(root, 'i18n/locales/es.ts'), 'utf8');
    const start = esText.indexOf('notificationAccess: {');
    const block = esText.slice(start, esText.indexOf('error:', start));
    for (const state of ['enabled', 'not_requested', 'denied', 'app_off', 'channel_off', 'unknown']) {
      const en = (settingsEn as { notificationAccess: { status: Record<string, string>; description: Record<string, string> } })
        .notificationAccess;
      assert.ok(en.status[state] && en.description[state], state);
      assert.equal(block.match(new RegExp(`\\n\\s+${state}:`, 'g'))?.length, 2, `es ${state}`);
    }
  });
});

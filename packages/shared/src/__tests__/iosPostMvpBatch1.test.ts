import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function readSharedSource(relativeFromSharedSrc: string): string {
  return readFileSync(join(here, '..', relativeFromSharedSrc), 'utf8');
}

describe('iOS post-MVP batch 1 — notification permission timing', () => {
  it('registerPushToken never requests native notification authorization', () => {
    const push = readSharedSource('services/pushTokens.ts');
    assert.match(push, /getPermissionsAsync/);
    assert.doesNotMatch(push, /requestPermissionsAsync/);
    assert.match(push, /permission-not-granted/);
  });

  it('App auth bootstrap may register token but uses non-prompting helper', () => {
    const app = readSharedSource('App.tsx');
    assert.match(app, /registerPushToken/);
    assert.doesNotMatch(app, /requestPermissionsAsync/);
  });

  it('dedicated CRJ notifications step owns requestPermissionsAsync', () => {
    const crj = readSharedSource('screens/ProfileCompletionScreen.tsx');
    assert.match(crj, /async function requestNotifications/);
    assert.match(crj, /Notifications\.requestPermissionsAsync/);
    assert.match(crj, /registerPushToken/);
  });

  it('no other shared services request notification permission', () => {
    const contacts = readSharedSource('services/contactsSync.ts');
    // Contacts may request Contacts permission — not notifications
    assert.doesNotMatch(contacts, /Notifications\.requestPermissionsAsync/);
    const alerts = readSharedSource('screens/AlertsScreen.tsx');
    assert.match(alerts, /registerPushToken/);
    assert.doesNotMatch(alerts, /requestPermissionsAsync/);
  });
});

describe('iOS post-MVP batch 1 — copy and greeting', () => {
  it('CRJ identity label is First Name (UI copy only)', () => {
    const en = readSharedSource('i18n/resources/onboarding.ts');
    assert.match(en, /nameLabel:\s*'First Name'/);
    assert.match(en, /namePlaceholder:\s*'First Name'/);
    assert.doesNotMatch(en, /nameLabel:\s*'Name'/);
    const es = readSharedSource('i18n/locales/es.ts');
    assert.match(es, /nameLabel:\s*'Nombre'/);
  });

  it('Home greeting Hello name is removed', () => {
    const home = readSharedSource('screens/MainHomeScreen.tsx');
    assert.doesNotMatch(home, /home\.greeting/);
    assert.doesNotMatch(home, /greetingSubtle/);
    const en = readSharedSource('i18n/resources/home.ts');
    assert.doesNotMatch(en, /greeting:/);
    const es = readSharedSource('i18n/locales/es.ts');
    assert.doesNotMatch(es, /greeting:\s*'Hola/);
  });
});

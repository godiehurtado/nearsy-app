import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  formatInstalledAppVersion,
  resolveInstalledAppVersion,
} from '../settings/installedAppVersion.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(root, '..', '..', '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('More: installed version', () => {
  it('shows versionName and versionCode of the native package', () => {
    const installed = resolveInstalledAppVersion({
      nativeApplicationVersion: '2.0.10',
      nativeBuildVersion: '48',
    });
    assert.deepEqual(installed, { version: '2.0.10', build: '48' });
    assert.equal(formatInstalledAppVersion(installed!), '2.0.10 (48)');
  });

  it('a half-known or missing version is not shown', () => {
    assert.equal(resolveInstalledAppVersion(null), null);
    assert.equal(resolveInstalledAppVersion({ nativeApplicationVersion: '2.0.10' }), null);
    assert.equal(
      resolveInstalledAppVersion({ nativeApplicationVersion: ' ', nativeBuildVersion: '48' }),
      null,
    );
  });

  it('More reads it at runtime, with no version written in the screen', () => {
    const more = src('screens/MoreScreen.tsx');
    assert.ok(more.includes('readInstalledAppVersion()'));
    assert.ok(!/['"]\d+\.\d+\.\d+['"]/.test(more), 'no hard-coded version');
    const reader = src('settings/installedAppVersion.ts');
    assert.ok(reader.includes("require('expo-application')"));
  });

  it('both languages have the label', () => {
    assert.ok(src('i18n/resources/settings.ts').includes("versionTitle: 'Version'"));
    assert.ok(src('i18n/locales/es.ts').includes("versionTitle: 'Versión'"));
  });
});

describe('Affiliations: add own logo button', () => {
  const panel = src('components/registration/OnboardingAffiliationCategoryPanel.tsx');
  const button = panel.slice(
    panel.indexOf('uploadOwnImageA11y'),
    panel.indexOf('</Pressable>', panel.indexOf('uploadOwnImageA11y')),
  );

  it('has the filled primary background and white text of enabled buttons', () => {
    assert.ok(button.includes('backgroundColor: palette.primary'));
    assert.ok(button.includes("color: '#FFFFFF'"));
    assert.ok(!button.includes('palette.textSecondary'));
  });

  it('keeps its action and shows the real busy state while the picker is open', () => {
    assert.ok(button.includes('void pickOwnLogo()'));
    assert.ok(button.includes('disabled={pickingLogo}'));
    assert.ok(button.includes('busy: pickingLogo'));
    const pick = panel.slice(panel.indexOf('async function pickOwnLogo()'));
    assert.ok(pick.slice(0, 300).includes('if (pickingLogoRef.current) return;'));
    assert.ok(pick.slice(0, 1200).includes('finally'));
  });

  it('one panel serves both CRJ and profile editing', () => {
    for (const screen of ['screens/ProfileCompletionScreen.tsx', 'screens/AffiliationsScreen.tsx']) {
      assert.ok(src(screen).includes('OnboardingAffiliationCategoryPanel'), screen);
    }
  });
});

describe('2.0.10 release config', () => {
  const appDir = path.join(repo, 'apps', 'nearsy-android');

  it('versionName is 2.0.10; versionCode stays with the EAS remote counter', () => {
    const app = JSON.parse(readFileSync(path.join(appDir, 'app.json'), 'utf8'));
    assert.equal(app.expo.version, '2.0.10');
    const eas = JSON.parse(readFileSync(path.join(appDir, 'eas.json'), 'utf8'));
    assert.equal(eas.cli.appVersionSource, 'remote');
    assert.equal(eas.build.production.autoIncrement, true);
  });

  it('production declares no Beta and no general capture', () => {
    const eas = JSON.parse(readFileSync(path.join(appDir, 'eas.json'), 'utf8'));
    const env = eas.build.production.env as Record<string, string>;
    for (const key of Object.keys(env)) assert.ok(!key.startsWith('NEARSY_ANALYTICS_'), key);
    assert.equal(env.NEARSY_FIREBASE_ENV, 'production');
  });
});

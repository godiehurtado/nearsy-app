import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import es from '../i18n/locales/es';
import enSettings from '../i18n/resources/settings';
import { formatBinaryVersion, readBinaryVersion } from '../settings/binaryVersion';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path: string) => readFileSync(join(here, '..', path), 'utf8');

describe('More shows the installed binary version', () => {
  it('formats native values and refuses anything else', () => {
    assert.deepEqual(formatBinaryVersion('2.0.10', '75'), { version: '2.0.10', build: '75' });
    assert.deepEqual(formatBinaryVersion(' 2.0.10 ', ' 75 '), { version: '2.0.10', build: '75' });
    for (const [v, b] of [
      [null, '75'],
      ['2.0.10', null],
      ['', '75'],
      ['2.0.10-beta', '75'],
      ['2.0.10', ''],
      ['2.0.10', '75 (update)'],
    ] as const) {
      assert.equal(formatBinaryVersion(v, b), null, `${v} ${b}`);
    }
  });

  it('platforms without the native module show nothing', () => {
    assert.equal(readBinaryVersion(), null);
  });

  it('iOS reads CFBundleShortVersionString and CFBundleVersion, never config or an update', () => {
    const ios = read('settings/binaryVersion.ios.ts');
    assert.match(ios, /Application\.nativeApplicationVersion/);
    assert.match(ios, /Application\.nativeBuildVersion/);
    for (const source of [ios, read('settings/binaryVersion.ts'), read('screens/MoreScreen.tsx')]) {
      assert.equal(/expoConfig\??\.version|expo-updates|runtimeVersion|manifest2?\??\.version/.test(source), false);
    }
    const more = read('screens/MoreScreen.tsx');
    assert.match(more, /readBinaryVersion\(\)/);
    assert.match(more, /t\('settings\.about\.binaryVersion', binaryVersion\)/);
    assert.equal(/\d+\.\d+\.\d+ \(\d+\)/.test(more), false, 'no hard-coded version');
  });

  it('has copy in both languages', () => {
    assert.equal(enSettings.about.binaryVersion, 'Version {{version}} ({{build}})');
    assert.equal((es as any).settings.about.binaryVersion, 'Versión {{version}} ({{build}})');
  });
});

describe('Affiliations: the custom logo button is an enabled Nearsy action', () => {
  const panel = read('components/registration/OnboardingAffiliationCategoryPanel.tsx');

  it('uses the shared primary button with the real busy state', () => {
    assert.match(panel, /import \{ PrimaryButton \} from '\.\.\/PrimaryButton';/);
    assert.match(panel, /<PrimaryButton[\s\S]{0,400}loading=\{pickingLogo\}/);
    assert.match(panel, /void pickOwnLogo\(\);/);
    assert.equal(/uploadBtn: \{[^}]*dashed/.test(panel), false, 'no disabled-looking outline');
  });

  it('opens one picker at a time and always clears the busy state', () => {
    assert.match(panel, /if \(pickingLogoRef\.current\) return;/);
    assert.match(panel, /finally \{\s*pickingLogoRef\.current = false;\s*setPickingLogo\(false\);/);
  });

  it('the same panel serves the CRJ and profile editing', () => {
    assert.match(read('screens/ProfileCompletionScreen.tsx'), /OnboardingAffiliationCategoryPanel/);
    assert.match(read('components/registration/AffiliationCategoryAccordionList.tsx'), /OnboardingAffiliationCategoryPanel/);
    assert.match(read('screens/AffiliationsScreen.tsx'), /AffiliationCategoryAccordionList/);
  });
});

describe('More: Contacts copy and states', () => {
  const more = read('screens/MoreScreen.tsx');
  const lookup = (root: any, key: string) => key.split('.').reduce((cur, part) => cur?.[part], root);

  it('every literal translation key used in More exists in English and Spanish', async () => {
    const en = (await import('../i18n/locales/en')).default as any;
    const keys = [...new Set([...more.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)].map((m) => m[1]))];
    assert.ok(keys.length > 20);
    for (const key of keys) {
      assert.equal(typeof lookup(en, key), 'string', `en: ${key}`);
      assert.equal(typeof lookup(es, key), 'string', `es: ${key}`);
    }
    assert.equal(more.includes("t('common.ok')"), false);
  });

  it('the address-book limit never asks to delete contacts', () => {
    for (const text of [enSettings.contacts.errors.capAction, (es as any).settings.contacts.errors.capAction]) {
      assert.equal(/remove contacts|quita contactos|delete|borra/i.test(text), false, text);
    }
  });

  it('an error with Contacts on says the address book is not synced; success only when synced', () => {
    assert.match(
      more,
      /view\.enabled === true\s*\?\s*`\$\{t\('settings\.contacts\.enabledNotSynced'\)\} \$\{base\}`/,
    );
    assert.match(more, /contactsSyncPhase === 'synced'\s*\?\s*t\('settings\.contacts\.syncSuccess'\)/);
  });
});

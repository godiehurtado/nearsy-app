/**
 * Nearsy 2.0.8 — iOS ships without Contacts access.
 * No Contacts purpose string, no expo-contacts native module, and no shared
 * iOS source that reads the address book or asks for Contacts permission.
 * Contacts matching returns in 2.0.9 as a new, reviewed feature.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import enSettings from '../i18n/resources/settings';
import es from '../i18n/locales/es';

const here = dirname(fileURLToPath(import.meta.url));
const SHARED_SRC = join(here, '..');
const REPO_ROOT = join(SHARED_SRC, '..', '..', '..');
const IOS_APP = join(REPO_ROOT, 'apps', 'nearsy-ios');

const readJson = (path: string) =>
  JSON.parse(readFileSync(path, 'utf8')) as Record<string, any>;

/** Every iOS permission prompt Nearsy 2.0.8 is allowed to declare. */
const ALLOWED_IOS_USAGE_DESCRIPTIONS = [
  'NSCameraUsageDescription',
  'NSLocationAlwaysAndWhenInUseUsageDescription',
  'NSLocationAlwaysUsageDescription',
  'NSLocationWhenInUseUsageDescription',
  'NSPhotoLibraryAddUsageDescription',
  'NSPhotoLibraryUsageDescription',
];

function listIosSources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue;
      out.push(...listIosSources(full));
    } else if (/\.(ts|tsx|js)$/.test(name) && !/\.android\.(ts|tsx|js)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

/** The `apps/nearsy-ios:` importer block of pnpm-lock.yaml. */
function iosLockImporter(): string {
  const lock = readFileSync(join(REPO_ROOT, 'pnpm-lock.yaml'), 'utf8');
  const start = lock.search(/^ {2}apps\/nearsy-ios:\s*$/m);
  assert.ok(start >= 0, 'iOS importer present in pnpm-lock.yaml');
  const rest = lock.slice(start + 1);
  const next = rest.search(/^ {2}\S/m);
  return next >= 0 ? rest.slice(0, next) : rest;
}

describe('iOS 2.0.8 — no Contacts permission or access', () => {
  it('Info.plist config has no Contacts purpose string', () => {
    const appJson = readJson(join(IOS_APP, 'app.json'));
    const infoPlist = appJson.expo.ios.infoPlist as Record<string, unknown>;
    assert.equal('NSContactsUsageDescription' in infoPlist, false);
    assert.doesNotMatch(
      readFileSync(join(IOS_APP, 'app.json'), 'utf8'),
      /NSContacts|your contacts/i,
    );
  });

  it('declares only the approved iOS permission prompts', () => {
    const appJson = readJson(join(IOS_APP, 'app.json'));
    const usageKeys = Object.keys(appJson.expo.ios.infoPlist)
      .filter((key) => /UsageDescription$/.test(key))
      .sort();
    assert.deepEqual(usageKeys, ALLOWED_IOS_USAGE_DESCRIPTIONS);
  });

  it('expo-contacts is not an iOS dependency, plugin, or lockfile entry', () => {
    const pkg = readJson(join(IOS_APP, 'package.json'));
    assert.equal('expo-contacts' in (pkg.dependencies ?? {}), false);
    assert.equal('expo-contacts' in (pkg.devDependencies ?? {}), false);

    const sharedPkg = readJson(join(SHARED_SRC, '..', 'package.json'));
    assert.equal('expo-contacts' in (sharedPkg.dependencies ?? {}), false);
    assert.equal('expo-contacts' in (sharedPkg.peerDependencies ?? {}), false);

    assert.doesNotMatch(
      readFileSync(join(IOS_APP, 'app.config.js'), 'utf8'),
      /expo-contacts/,
    );
    assert.doesNotMatch(iosLockImporter(), /expo-contacts/);
  });

  it('no shared iOS source reads contacts or requests Contacts permission', () => {
    const offenders = listIosSources(SHARED_SRC).filter((file) =>
      /expo-contacts|contactsSync|getContactsAsync|CNContactStore|ContactsUI|NSContactsUsageDescription/.test(
        readFileSync(file, 'utf8'),
      ),
    );
    assert.deepEqual(
      offenders.map((file) => relative(SHARED_SRC, file).replace(/\\/g, '/')),
      [],
    );
    assert.equal(existsSync(join(SHARED_SRC, 'services', 'contactsSync.ts')), false);
  });

  it('orphan contacts settings copy is gone in EN and ES', () => {
    assert.equal('contacts' in enSettings, false);
    assert.equal('contacts' in es.settings, false);
  });
});

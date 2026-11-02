/**
 * Nearsy 2.0.9 — iOS Contacts is a reviewed feature.
 * Identity PR #23 is the only Contacts schema. Functions draft names are gone.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SHARED_SRC = join(here, '..');
const REPO_ROOT = join(SHARED_SRC, '..', '..', '..');
const IOS_APP = join(REPO_ROOT, 'apps', 'nearsy-ios');

const readJson = (path: string) =>
  JSON.parse(readFileSync(path, 'utf8')) as Record<string, any>;

const ALLOWED_IOS_USAGE_DESCRIPTIONS = [
  'NSCameraUsageDescription',
  'NSContactsUsageDescription',
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

describe('iOS 2.0.9 — Identity Contacts access', () => {
  it('Info.plist declares a Contacts purpose string', () => {
    const appJson = readJson(join(IOS_APP, 'app.json'));
    const infoPlist = appJson.expo.ios.infoPlist as Record<string, unknown>;
    assert.equal(typeof infoPlist.NSContactsUsageDescription, 'string');
    assert.match(
      String(infoPlist.NSContactsUsageDescription),
      /contacts/i,
    );
  });

  it('declares the approved iOS permission prompts including Contacts', () => {
    const appJson = readJson(join(IOS_APP, 'app.json'));
    const usageKeys = Object.keys(appJson.expo.ios.infoPlist)
      .filter((key) => /UsageDescription$/.test(key))
      .sort();
    assert.deepEqual(usageKeys, ALLOWED_IOS_USAGE_DESCRIPTIONS);
  });

  it('expo-contacts is an iOS dependency and plugin', () => {
    const pkg = readJson(join(IOS_APP, 'package.json'));
    assert.equal('expo-contacts' in (pkg.dependencies ?? {}), true);
    assert.match(
      readFileSync(join(IOS_APP, 'app.config.js'), 'utf8'),
      /expo-contacts/,
    );
  });

  it('does not keep the 2.0.8 contactsSync.ts helper', () => {
    assert.equal(existsSync(join(SHARED_SRC, 'services', 'contactsSync.ts')), false);
  });

  it('Identity callables are the only Contacts API names', () => {
    const sources = listIosSources(join(SHARED_SRC, 'contacts'));
    const joined = sources.map((file) => readFileSync(file, 'utf8')).join('\n');
    assert.match(joined, /enableContactsSync/);
    assert.match(joined, /disableContactsSync/);
    assert.match(joined, /removeContactSource/);
    assert.match(joined, /syncContactHashes/);
    assert.match(joined, /refreshVerifiedActorKeys/);
    assert.match(joined, /contactsEpoch/);
    assert.match(joined, /BANNED_CONTACTS_WIRE_FIELDS/);
    assert.doesNotMatch(
      readFileSync(join(SHARED_SRC, 'contacts', 'wireTypes.ts'), 'utf8'),
      /expectedEpoch/,
    );
    assert.doesNotMatch(joined, /contacts\/epoch-stale/);
    assert.doesNotMatch(joined, /contacts\/hashes-not-accepted/);
    assert.doesNotMatch(joined, /contacts\/sync-disabled/);
  });
});

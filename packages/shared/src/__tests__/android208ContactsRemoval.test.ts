/**
 * ANDROID-208 leftovers + 2.0.9 Identity Contacts.
 * Still forbids unsalted contactHashes, expectedEpoch, WRITE_CONTACTS, and
 * Functions-draft names. Identity #23 owns enable/sync/disable/remove/refresh.
 *
 * Run:
 *   node --experimental-strip-types --test packages/shared/src/__tests__/android208ContactsRemoval.test.ts
 */
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = join(SRC, '..', '..', '..');
const ANDROID_APP = join(REPO, 'apps', 'nearsy-android');
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');
const readRepo = (rel: string) => readFileSync(join(REPO, rel), 'utf8');

/** Shared sources Android can bundle: no iOS-only files, no tests. */
function androidReachableSources(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        if (name === '__tests__' || name === 'node_modules') continue;
        walk(full);
      } else if (/\.(ts|tsx)$/.test(name) && !/\.ios\.(ts|tsx)$/.test(name)) {
        out.push(full);
      }
    }
  };
  walk(SRC);
  return out;
}

const sources = androidReachableSources().map((file) => ({
  rel: relative(SRC, file).replace(/\\/g, '/'),
  src: readFileSync(file, 'utf8'),
}));

const appJson = JSON.parse(readFileSync(join(ANDROID_APP, 'app.json'), 'utf8'));
const androidPkg = JSON.parse(readFileSync(join(ANDROID_APP, 'package.json'), 'utf8'));

/**
 * Dependency names per importer, read structurally from the `importers:` section
 * (2-space importer keys, 4-space dependency groups, 6-space package keys).
 * Line endings may be LF or CRLF depending on the checkout (core.autocrlf).
 */
function lockImporters(): Map<string, Set<string>> {
  const importers = new Map<string, Set<string>>();
  let inImporters = false;
  let current: Set<string> | undefined;
  for (const line of readRepo('pnpm-lock.yaml').split(/\r?\n/)) {
    if (/^\S/.test(line)) {
      inImporters = line === 'importers:';
      current = undefined;
      continue;
    }
    if (!inImporters) continue;
    const importer = /^ {2}([^\s'][^:]*|'[^']+'):$/.exec(line);
    if (importer) {
      current = new Set();
      importers.set(importer[1].replace(/^'|'$/g, ''), current);
      continue;
    }
    const pkg = /^ {6}('[^']+'|[^\s:]+):$/.exec(line);
    if (pkg && current) current.add(pkg[1].replace(/^'|'$/g, ''));
  }
  return importers;
}

function lockImporter(name: string): Set<string> {
  const deps = lockImporters().get(name);
  assert.ok(deps && deps.size > 0, `importer ${name}`);
  return deps;
}

describe('Dependency and lockfile', () => {
  it('Android 2.0.9 depends on expo-contacts for Identity sync', () => {
    assert.equal(androidPkg.dependencies?.['expo-contacts'], '~15.0.11');
    assert.ok(androidPkg.dependencies?.['expo-crypto']);
  });

  it('iOS history keeps its own entry untouched', () => {
    assert.ok(lockImporter('apps/nearsy-ios').has('expo-contacts'));
  });

  it('expo-crypto stays (LinkedIn still hashes with it)', () => {
    assert.ok(androidPkg.dependencies?.['expo-crypto']);
  });
});

describe('Permissions', () => {
  it('READ_CONTACTS is allowed; WRITE_CONTACTS stays blocked', () => {
    const android = appJson.expo.android;
    // 2.0.10 (51) also blocks the broad media permissions (Play photo policy).
    assert.deepEqual([...android.blockedPermissions].sort(), [
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
      'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
      'android.permission.WRITE_CONTACTS',
    ]);
    assert.ok(android.permissions.includes('android.permission.READ_CONTACTS'));
    assert.ok(!android.blockedPermissions.includes('android.permission.READ_CONTACTS'));
  });

  it('registers the expo-contacts plugin on Android', () => {
    const plugins = (appJson.expo.plugins ?? []).map((p: unknown) =>
      Array.isArray(p) ? p[0] : p,
    );
    assert.equal(plugins.includes('expo-contacts'), true);
  });
});

describe('No leftover unsalted or Functions-draft contacts', () => {
  it('no client reads or writes of contactHashes', () => {
    for (const { rel, src } of sources) {
      assert.doesNotMatch(src, /contactHashes/, rel);
    }
  });

  it('does not use Functions-draft names or Home residual flags', () => {
    assert.equal(existsSync(join(SRC, 'services/contactsSync.ts')), false);
    assert.equal(existsSync(join(SRC, 'services/contactsSync.android.ts')), false);
    for (const { rel, src } of sources) {
      if (rel.startsWith('alerts/') || rel.startsWith('contactsHmac/')) continue;
      assert.doesNotMatch(src, /expectedEpoch|enableContactSync|deleteContactSource|NEARSY_CONTACTS_ASKED|dbGetContactHashes/, rel);
    }
  });
});

describe('Contacts copy stays off Home and uses Identity Settings', () => {
  it('Home copy has no contacts feature text', () => {
    assert.doesNotMatch(read('i18n/resources/home.ts'), /\bcontacts\b|\bcontactos\b|contactNearby/i);
    assert.match(read('i18n/resources/settings.ts'), /contactsSync/);
  });

  it('alerts never carry a contact kind', () => {
    const hook = read('hooks/useNearbyAlerts.ts');
    assert.doesNotMatch(hook, /contact_nearby|fromContacts|expo-crypto/);
  });
});

describe('Alerts and badge keep working', () => {
  const hook = read('hooks/useNearbyAlerts.ts');

  it('interest alerts: discoverNearby + active-mode shared interests (no peer users query)', () => {
    assert.match(hook, /discoverNearby/);
    assert.match(hook, /buildDiscoverNearbyRequest/);
    assert.doesNotMatch(hook, /dbQueryVisibleUsers/);
    assert.match(hook, /collectActiveModeInterestIds/);
    assert.match(hook, /mapDiscoverResultsToInterestAlerts/);
    const mapping = read('hooks/nearbyAlertsMapping.ts');
    assert.match(mapping, /interest_nearby/);
  });

  it('tab badge still counts alerts from shared provider', () => {
    const tabs = read('navigation/RootTabs.tsx');
    assert.match(tabs, /NearbyAlertsProvider/);
    assert.match(tabs, /const \{ unseenCount \} = useNearbyAlerts\(\);/);
    assert.match(tabs, /alertsCount > 9 \? '9\+' : alertsCount/);
  });

  it('Alerts screen and row copy keep interest messaging', () => {
    assert.match(read('screens/AlertsScreen.tsx'), /useNearbyAlerts\(\)/);
    const presentation = read('screens/alertsPresentation.ts');
    assert.match(presentation, /notifications\.messages\.interestNearby/);
    assert.match(presentation, /notifications\.messages\.nearbyOnly/);
  });

  it('Android db layer keeps own-profile snapshot for Alerts viewer state', () => {
    const db = read('services/db.android.ts');
    assert.match(db, /export function dbOnUserSnapshot|export async function dbOnUserSnapshot|dbOnUserSnapshot/);
  });
});

describe('Apple stays out of Android', () => {
  it('no Apple dependency, plugin or import on Android', () => {
    assert.doesNotMatch(JSON.stringify(androidPkg), /\x61pple/i);
    assert.doesNotMatch(JSON.stringify(appJson), /\x61pple/i);
    for (const { rel, src } of sources) {
      assert.doesNotMatch(src, /from ['"][./]*(services\/)?\x61ppleAuth['"]/, rel);
    }
  });
});

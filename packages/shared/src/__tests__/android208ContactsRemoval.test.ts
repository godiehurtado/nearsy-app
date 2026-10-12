/**
 * ANDROID-208 — Nearsy 2.0.8 ships without contact recognition on Android.
 * Guards: no expo-contacts, no contacts permissions, no runtime contact access,
 * no contactHashes writes, no UI promising contacts; Alerts keep working.
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
  it('Android no longer depends on expo-contacts', () => {
    assert.equal(androidPkg.dependencies?.['expo-contacts'], undefined);
    assert.equal(androidPkg.devDependencies?.['expo-contacts'], undefined);
    const android = lockImporter('apps/nearsy-android');
    assert.equal(android.has('expo-contacts'), false);
    assert.ok(android.has('expo-crypto'));
  });

  it('iOS history keeps its own entry untouched', () => {
    assert.ok(lockImporter('apps/nearsy-ios').has('expo-contacts'));
  });

  it('expo-crypto stays (LinkedIn still hashes with it)', () => {
    assert.ok(androidPkg.dependencies?.['expo-crypto']);
  });
});

describe('Permissions', () => {
  it('READ_CONTACTS and WRITE_CONTACTS are blocked and never requested', () => {
    const android = appJson.expo.android;
    assert.deepEqual(
      [...android.blockedPermissions].sort(),
      ['android.permission.READ_CONTACTS', 'android.permission.WRITE_CONTACTS'],
    );
    for (const permission of android.permissions) {
      assert.doesNotMatch(permission, /CONTACTS/);
    }
  });

  it('no contacts config plugin', () => {
    const plugins = (appJson.expo.plugins ?? []).map((p: unknown) =>
      Array.isArray(p) ? p[0] : p,
    );
    assert.equal(plugins.some((p: unknown) => /contacts/i.test(String(p))), false);
  });
});

describe('No contact access at runtime', () => {
  it('no Android-reachable file imports expo-contacts', () => {
    for (const { rel, src } of sources) {
      assert.doesNotMatch(src, /['"]expo-contacts['"]/, rel);
    }
  });

  it('no runtime contacts permission request', () => {
    for (const { rel, src } of sources) {
      assert.doesNotMatch(src, /PERMISSIONS\.(READ|WRITE)_CONTACTS|Contacts\.(requestPermissionsAsync|getContactsAsync)/, rel);
    }
  });

  it('no client reads or writes of contactHashes', () => {
    for (const { rel, src } of sources) {
      assert.doesNotMatch(src, /contactHashes/, rel);
    }
  });

  it('contacts sync module and residual Home flags are gone', () => {
    assert.equal(existsSync(join(SRC, 'services/contactsSync.ts')), false);
    assert.equal(existsSync(join(SRC, 'services/contactsSync.android.ts')), false);
    for (const { rel, src } of sources) {
      assert.doesNotMatch(src, /contactsSync|ContactsSync|NEARSY_CONTACTS_ASKED|dbGetContactHashes/, rel);
    }
  });
});

describe('No UI promising contacts in 2.0.8', () => {
  it('EN/ES copy has no contacts feature text', () => {
    for (const rel of [
      'i18n/resources/settings.ts',
      'i18n/resources/notifications.ts',
      'i18n/resources/home.ts',
      'i18n/locales/es.ts',
    ]) {
      const src = read(rel);
      assert.doesNotMatch(src, /\bcontacts\b|\bcontactos\b|contactNearby/i, rel);
    }
  });

  it('alerts never carry a contact kind', () => {
    const hook = read('hooks/useNearbyAlerts.ts');
    assert.doesNotMatch(hook, /contact_nearby|fromContacts|expo-crypto/);
  });
});

describe('Alerts and badge keep working', () => {
  const hook = read('hooks/useNearbyAlerts.ts');

  it('interest alerts: visible users, blocks, ages, freshness, distance, shared interests', () => {
    assert.match(hook, /dbQueryVisibleUsers\(200\)/);
    assert.match(hook, /isBlockedBetween\(/);
    assert.match(hook, /visibleToMinAge/);
    assert.match(hook, /LOCATION_FRESH_MS/);
    assert.match(hook, /NEARBY_RADIUS_KM/);
    assert.match(hook, /if \(shared\.length === 0\) continue;/);
    assert.match(hook, /const kind: AlertKind = 'interest_nearby';/);
    assert.match(hook, /return \{ loading, alerts, topColor, me, refresh: buildAlerts \};/);
  });

  it('tab badge still counts alerts', () => {
    const tabs = read('navigation/RootTabs.tsx');
    assert.match(tabs, /const \{ alerts \} = useNearbyAlerts\(\);/);
    assert.match(tabs, /alertsCount > 9 \? '9\+' : alertsCount/);
  });

  it('Alerts screen and row copy are unchanged', () => {
    assert.match(read('screens/AlertsScreen.tsx'), /useNearbyAlerts\(\)/);
    const presentation = read('screens/alertsPresentation.ts');
    assert.match(presentation, /notifications\.messages\.interestNearby/);
    assert.match(presentation, /notifications\.messages\.nearbyOnly/);
  });

  it('Android db layer keeps the reads Alerts need', () => {
    const db = read('services/db.android.ts');
    assert.match(db, /export function dbOnUserSnapshot|export async function dbOnUserSnapshot|dbOnUserSnapshot/);
    assert.match(db, /export async function dbQueryVisibleUsers/);
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

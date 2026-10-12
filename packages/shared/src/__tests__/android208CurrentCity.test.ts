/**
 * ANDROID-208 — Current city replaces country of residence (CRJ, Own Profile,
 * Background, Discovery), GeoNames attribution, and the guards around them.
 *
 * Run:
 *   node --experimental-strip-types --test packages/shared/src/__tests__/android208CurrentCity.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import discoveryProfileEn from '../i18n/resources/discoveryProfile.ts';
import { onboardingTranslations } from '../i18n/resources/onboarding.ts';
import { profileTranslations } from '../i18n/resources/profile.ts';
import settingsEn from '../i18n/resources/settings.ts';
import {
  GEONAMES_ATTRIBUTION_URL,
  isGeoNamesAttributionUrl,
  openGeoNamesAttribution,
} from '../settings/geonamesAttribution.ts';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = join(SRC, '..', '..', '..');
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

const crj = read('screens/ProfileCompletionScreen.tsx');
const editor = read('screens/CompleteProfileScreen.tsx');
const syncRetry = read('profileContext/useDiscoveryContextSyncRetry.ts');
const cityField = read('components/profileContext/CurrentCityField.tsx');
const runtime = read('profileContext/citySearchRuntime.android.ts');
const parse = read('visibility/callables/parse.ts');
const wire = read('visibility/callables/wireTypes.ts');
const contextCard = read('components/profileExploration/DiscoveryContextCard.tsx');
const more = read('screens/MoreScreen.tsx');
const es = read('i18n/locales/es.ts');

const NEW_FILES = [
  'profileContext/currentCity.ts',
  'profileContext/citySearchController.ts',
  'profileContext/citySearchCallable.ts',
  'profileContext/citySearchRuntime.android.ts',
  'profileContext/citySearchRuntime.ts',
  'profileContext/currentCityWrite.ts',
  'profileContext/ownProfileSaveFlow.ts',
  'profileContext/useDiscoveryContextSyncRetry.ts',
  'components/profileContext/CurrentCityField.tsx',
  'services/firestoreFieldDelete.android.ts',
  'settings/geonamesAttribution.ts',
];

describe('CRJ — current city is optional', () => {
  it('identity step requires only the country of origin', () => {
    assert.match(crj, /isCrjIdentityContextValid\(\{ birthCountryCode \}\)/);
    assert.doesNotMatch(crj, /residence/i);
  });

  it('renders the city picker after origin with the CRJ copy', () => {
    const origin = crj.indexOf('identity.birthCountryLabel');
    const cityAt = crj.indexOf('<CurrentCityField');
    assert.ok(origin > 0 && cityAt > origin);
    assert.match(crj, /identity\.currentCityLabel/);
    assert.match(crj, /identity\.currentCityPlaceholder/);
    assert.match(crj, /onChange=\{setCurrentCity\}/);
  });

  it('persistName writes select/change/remove through the strict patch', () => {
    const persist = crj.slice(
      crj.indexOf('async function persistName()'),
      crj.indexOf('async function persistPhoto()'),
    );
    assert.match(persist, /buildCurrentCityWritePatch\(/);
    assert.match(persist, /firestoreDeleteField\(\)/);
    assert.match(persist, /persistedCurrentCityRef\.current = nextCity/);
    assert.ok(
      persist.indexOf('updateUserProfilePartial') <
        persist.indexOf('syncDiscoveryProfileContextAfterSave'),
    );
  });

  it('CRJ close still syncs Discovery through the contractual flow', () => {
    const finish = crj.slice(crj.indexOf('profileSetupCompleted: true'));
    assert.match(finish, /syncDiscoveryProfileContextAfterSave/);
  });
});

describe('Own Profile — save then sync', () => {
  const persist = editor.slice(
    editor.indexOf('const persistOwnProfile'),
    editor.indexOf('const handleSave'),
  );

  it('writes the private profile first, then syncs Discovery', () => {
    assert.match(persist, /persistThenSyncDiscovery\(\{/);
    assert.match(persist, /write: \(\) => updateUserProfilePartial\(uid, writePatch\)/);
    assert.match(persist, /buildCurrentCityWritePatch\(/);
    assert.match(persist, /firestoreDeleteField\(\)/);
  });

  it('stale sessions (other user / unmounted) do not touch the screen', () => {
    assert.match(persist, /isSaveSessionCurrent\(\{/);
    assert.match(persist, /currentUid: firebaseAuth\.currentUser\?\.uid/);
    assert.match(persist, /if \(syncStatus === 'stale'\) return;/);
  });

  it('a failed sync offers Retry for the sync only', () => {
    assert.match(persist, /if \(syncStatus === 'failed'\) offerDiscoverySyncRetry\(/);
    assert.match(syncRetry, /syncDiscoveryContextSafely\(syncNow, expectedCity\)/);
    assert.doesNotMatch(syncRetry, /updateUserProfilePartial|firestore/i);
    assert.match(syncRetry, /profile\.context\.syncRetry'/);
  });

  it('double tap is single-flight for both save and retry', () => {
    assert.match(editor, /await saveFlightRef\.current\.run\(persistOwnProfile\)/);
    assert.match(syncRetry, /flightRef\.current\.run\(/);
  });

  it('local profile doc never stores the delete sentinel', () => {
    assert.match(persist, /\.\.\.\(nextContext\.currentCity \? \{ currentCity: nextContext\.currentCity \} : \{\}\)/);
    assert.doesNotMatch(persist, /\.\.\.cityPatch,\s*profiles:/);
  });
});

describe('Discovery — city, optional region and country', () => {
  it('wire type replaces residence with currentCity', () => {
    assert.match(wire, /currentCity: CurrentCity \| null;/);
    assert.doesNotMatch(wire, /residenceCountryCode/);
  });

  it('a malformed city voids only the city, not the profile', () => {
    assert.match(parse, /assertNoForbiddenKeys\(withoutCurrentCity\(value\), 'profile'\)/);
    assert.match(parse, /profile: withoutCurrentCity\(data\.profile\)[\s\S]{0,40}'getDiscoveryProfile'/);
    assert.match(parse, /currentCity: parseCurrentCity\(/);
  });

  it('the card shows place text only (no coordinates, no residence)', () => {
    assert.match(contextCard, /parseCurrentCity\(currentCity\)/);
    assert.match(contextCard, /formatCurrentCityPlace\(/);
    assert.match(contextCard, /discoveryProfile\.context\.livesInCity/);
    assert.doesNotMatch(contextCard, /latitude|longitude|residence/i);
  });
});

describe('searchCities runtime — Auth + App Check, no logs', () => {
  it('requires a signed-in user and App Check before invoking', () => {
    assert.match(runtime, /firebaseAuth\.currentUser/);
    assert.match(runtime, /getIdToken\(/);
    assert.match(runtime, /ensureAppCheckInitialized/);
    assert.ok(runtime.indexOf('ensureAppCheckInitialized') < runtime.indexOf('invokeCitySearchCallable('));
    assert.match(runtime, /CITY_SEARCH_CALLABLE_REGION/);
  });

  it('new files never log and never mention the excluded provider', () => {
    for (const rel of NEW_FILES) {
      const src = read(rel);
      assert.doesNotMatch(src, /console\.|logger\.|crashlytics/i, rel);
      assert.doesNotMatch(src, /\x61pple/i, rel);
    }
  });

  it('the city picker needs no location or extra permissions', () => {
    assert.doesNotMatch(cityField, /expo-location|requestForegroundPermissions|PermissionsAndroid/);
    assert.match(cityField, /Localization\.getLocales\(\)/);
  });
});

describe('City picker — theme and accessibility', () => {
  it('colors come from the theme palette', () => {
    assert.doesNotMatch(cityField, /#[0-9a-fA-F]{3,8}\b/);
    assert.match(cityField, /useAppTheme\(\)/);
  });

  it('labels, live status, selection state and 44 dp retry', () => {
    assert.match(cityField, /accessibilityRole="header"/);
    assert.match(cityField, /accessibilityLiveRegion="polite"/);
    assert.match(cityField, /accessibilityState=\{\{ selected \}\}/);
    assert.match(cityField, /profile\.city\.clearA11y/);
    assert.match(cityField, /retryBtn: \{[\s\S]*?minHeight: 44/);
    assert.doesNotMatch(cityField.slice(cityField.indexOf('valueText')), /numberOfLines/);
  });

  it('only a suggestion can be selected (no free text saved)', () => {
    assert.match(cityField, /onPress=\{\(\) => selectCity\(item\)\}/);
    assert.doesNotMatch(cityField, /onSubmitEditing/);
  });
});

describe('Copy — EN/ES', () => {
  const en = profileTranslations.en;
  const esProfile = profileTranslations.es;

  it('field, search and empty copy', () => {
    assert.equal(en.fields.currentCity, 'Current city');
    assert.equal(esProfile.fields.currentCity, 'Ciudad actual');
    assert.equal(en.placeholders.currentCitySearch, 'Search for a city');
    assert.equal(esProfile.placeholders.currentCitySearch, 'Busca una ciudad');
    assert.equal(en.city.noResults, 'No cities found');
    assert.equal(esProfile.city.noResults, 'No se encontraron ciudades');
  });

  it('EN and ES city keys match; errors carry no technical codes', () => {
    assert.deepEqual(Object.keys(en.city).sort(), Object.keys(esProfile.city).sort());
    for (const text of [en.city.unavailable, en.city.rateLimited, esProfile.city.unavailable, esProfile.city.rateLimited]) {
      assert.doesNotMatch(text, /resource|exhausted|429|unavailable|functions\//i);
    }
  });

  it('origin copy is kept', () => {
    const identityEn = onboardingTranslations.en.profileCompletion.identity;
    const identityEs = onboardingTranslations.es.profileCompletion.identity;
    assert.equal(identityEn.birthCountryLabel, 'Where are you from?');
    assert.equal(identityEs.birthCountryLabel, '¿De dónde eres?');
    assert.equal(en.fields.birthCountry, 'Country of origin');
    assert.equal(esProfile.fields.birthCountry, 'País de origen');
  });

  it('Discovery row reads "Lives in" / "Vive en"', () => {
    assert.equal(discoveryProfileEn.context.livesInCity, 'Lives in {{place}}');
    assert.match(es, /livesInCity: 'Vive en \{\{place\}\}'/);
  });
});

describe('GeoNames attribution (CC BY 4.0)', () => {
  it('exact EN/ES text in More > About', () => {
    assert.equal(
      settingsEn.about.geonamesAttribution,
      'City data © GeoNames (https://www.geonames.org), licensed under CC BY 4.0. Modified: filtered and re-indexed by Nearsy.',
    );
    assert.ok(
      es.includes(
        'Datos de ciudades © GeoNames (https://www.geonames.org), con licencia CC BY 4.0. Modificados: filtrados y reindexados por Nearsy.',
      ),
    );
    assert.match(more, /settings\.sections\.about/);
    assert.match(more, /description=\{t\('settings\.about\.geonamesAttribution'\)\}/);
    assert.match(more, /accessibilityHint=\{t\('settings\.about\.openGeoNamesHint'\)\}/);
  });

  it('opens only https://www.geonames.org, without canOpenURL', async () => {
    assert.equal(GEONAMES_ATTRIBUTION_URL, 'https://www.geonames.org');
    const opened: string[] = [];
    assert.equal(
      await openGeoNamesAttribution({ openURL: async (url) => opened.push(url) }),
      'opened',
    );
    assert.deepEqual(opened, ['https://www.geonames.org']);
    assert.equal(
      await openGeoNamesAttribution({
        openURL: async () => {
          throw new Error('no handler');
        },
      }),
      'failed',
    );
    const code = read('settings/geonamesAttribution.ts').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(code, /canOpenURL|WebBrowser|utm_/);
    assert.match(more, /openGeoNamesAttribution\(Linking\)/);
  });

  it('URL guard rejects anything but the fixed HTTPS host', () => {
    assert.equal(isGeoNamesAttributionUrl('https://www.geonames.org'), true);
    for (const bad of [
      'http://www.geonames.org',
      'https://geonames.org.evil.example',
      'https://www.geonames.org?utm_source=nearsy',
      'https://user@www.geonames.org',
      'javascript:alert(1)',
    ]) {
      assert.equal(isGeoNamesAttributionUrl(bad), false, bad);
    }
  });
});

describe('No native changes for Current City', () => {
  it('app config declares no new permission or plugin for cities', () => {
    const appJson = readFileSync(join(REPO, 'apps/nearsy-android/app.json'), 'utf8');
    assert.doesNotMatch(appJson, /geonames|searchCities/i);
  });
});

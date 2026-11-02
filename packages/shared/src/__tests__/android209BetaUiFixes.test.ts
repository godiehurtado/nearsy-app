/**
 * Android 2.0.9 beta UI fixes — affiliations lines, Alignment label, prefs error,
 * social modal chrome, contacts timeout bound, update-notice contract guardrails.
 *
 * Run:
 *   node --experimental-strip-types --test packages/shared/src/__tests__/android209BetaUiFixes.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { formatPublicAffiliationLines } from '../affiliations/affiliationPresentation.ts';
import { formatDiscoveryAffiliationTypeLabel } from '../visibility/discoveryAffiliations.ts';
import { appUpdateTranslations } from '../i18n/resources/appUpdate.ts';
import enAlignment from '../i18n/resources/alignment.ts';
import { onboardingTranslations } from '../i18n/resources/onboarding.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function readSrc(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

describe('Affiliation Discovery labels EN/ES comparative', () => {
  const en = onboardingTranslations.en.profileCompletion.affiliations;
  const es = onboardingTranslations.es.profileCompletion.affiliations;

  it('keeps category IDs stable and translates meaning per language', () => {
    const pairs: Array<[keyof typeof en.categories, string, string]> = [
      ['education', 'Education', 'Educación'],
      ['professional', 'Professional', 'Profesional'],
      ['community', 'Community', 'Comunidad'],
      ['sports_clubs', 'Sports & Clubs', 'Deportes y clubes'],
      ['faith', 'Faith & Spirituality', 'Fe y espiritualidad'],
      ['political_civic', 'Political & Civic', 'Política y cívica'],
      ['family', 'Family', 'Familia'],
    ];
    for (const [id, enLabel, esLabel] of pairs) {
      assert.equal(en.categories[id], enLabel, `EN ${id}`);
      assert.equal(es.categories[id], esLabel, `ES ${id}`);
    }
  });

  it('keeps long topic labels intact for wrap layout (no invented IDs)', () => {
    assert.equal(en.topics.professional_organization, 'Professional organization');
    assert.equal(es.topics.professional_organization, 'Organización profesional');
    assert.equal(en.topics.college_or_university, 'College or university');
    assert.equal(es.topics.college_or_university, 'Universidad o colegio');
    const lines = formatPublicAffiliationLines(
      { name: 'Nearsy Labs', type: 'professional_organization' },
      (id, fallback) =>
        id === 'professional_organization'
          ? es.topics.professional_organization
          : fallback,
      (id, fallback) =>
        id === 'professional' ? es.categories.professional : fallback,
    );
    assert.equal(lines.title, 'Nearsy Labs');
    assert.equal(lines.subtitle, 'Profesional');
    assert.equal(
      formatDiscoveryAffiliationTypeLabel(
        'professional_organization',
        (key, fallback) =>
          key === 'professional' ? es.categories.professional : fallback,
      ),
      'Profesional',
    );
  });
});

describe('Alignment label without Rare/Closely tiers', () => {
  it('restores EN Alignment / ES Compatibilidad and clears tier copy', () => {
    assert.equal(enAlignment.title, 'Alignment');
    assert.equal(enAlignment.tiers.strong, '');
    assert.equal(enAlignment.tiers.full, '');
    const es = readSrc('i18n/locales/es.ts');
    assert.match(es, /title: 'Compatibilidad'/);
    assert.doesNotMatch(es, /Closely|Rare alignment|Muy alineados|Alineación excepcional/);
    const nearby = readSrc('screens/NearbySearchScreen.tsx');
    assert.match(nearby, /alignmentTitleLabel\(t\)/);
    assert.doesNotMatch(nearby, /alignmentTierLabel/);
  });
});

describe('Home prefs vs Visibility error copy', () => {
  it('slider persist failures use preferencesSave, not Visibility generic', () => {
    const home = readSrc('screens/MainHomeScreen.tsx');
    const en = readSrc('i18n/resources/home.ts');
    assert.match(home, /home\.errors\.preferencesSave/);
    assert.match(en, /Could not save your discovery preferences/);
    const persistSlice = home.slice(
      home.indexOf('const patchAndPersist'),
      home.indexOf('const activateVisibility'),
    );
    assert.doesNotMatch(persistSlice, /home\.errors\.generic/);
  });
});

describe('Social modals + Instagram steps', () => {
  it('Instagram pending modal has numbered steps, scroll, Back cancel', () => {
    const ig = readSrc('components/profile/InstagramOwnershipCard.tsx');
    assert.match(ig, /ScrollView/);
    assert.match(ig, /KeyboardAvoidingView/);
    assert.match(ig, /pendingSteps/);
    assert.match(ig, /onRequestClose/);
    assert.match(ig, /instagramOwnership\.cancel/);
    const en = readSrc('i18n/resources/profile.ts');
    assert.match(en, /Open @\{\{inbox\}\} in Instagram/);
    assert.match(en, /Return to Nearsy to verify/);
  });
});

describe('Contacts timeout bound', () => {
  it('Android Identity calls race a concrete timeout then reconcile path', () => {
    const android = readSrc('contactsHmac/contactsHmac.android.ts');
    const more = readSrc('screens/MoreScreen.tsx');
    assert.match(android, /CONTACTS_CALLABLE_TIMEOUT_MS = 45_000/);
    assert.match(android, /contacts-timeout/);
    assert.match(more, /resyncGrantedContacts/);
    assert.match(more, /contactsSync\.syncTimedOut/);
  });
});

describe('App update notice contract guardrails', () => {
  it('keeps optional getAppUpdatePolicy fields only; no invented required/versionCode', () => {
    const contract = readSrc('appUpdate/contract.ts');
    assert.match(contract, /getAppUpdatePolicy/);
    assert.match(contract, /latestVersion/);
    assert.doesNotMatch(contract, /latestVersionCode|minSupported|required:/);
    assert.equal(appUpdateTranslations.en.update, 'Update');
    assert.equal(appUpdateTranslations.en.later, 'Later');
    assert.equal(appUpdateTranslations.es.update, 'Actualizar');
    assert.equal(appUpdateTranslations.es.later, 'Más tarde');
    const parse = readSrc('appUpdate/parsePolicy.ts');
    assert.match(parse, /officialAndroidStoreUrl/);
    assert.match(parse, /required.*never read/i);
  });
});

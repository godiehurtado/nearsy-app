import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  flattenCatalogInterestItems,
  isSelectableCatalogInterestId,
  ONBOARDING_CUSTOM_INTEREST_ICONS,
  ONBOARDING_CUSTOM_INTEREST_ICON_OPTIONS,
} from '../interests/onboardingInterestCatalog';
import {
  CUSTOM_INTEREST_ICON_ENTRIES,
  filterCustomInterestIcons,
  ONBOARDING_CUSTOM_INTEREST_ICONS as PICKER_ICONS,
} from '../interests/customInterestIconCatalog';
import {
  isLegacyDisplayInterestId,
  resolveLegacyDisplayInterestItem,
} from '../interests/interestLegacyCatalog';
import { resolveInterestChip } from '../visibility/interestDisplay';
import {
  CRJ_MANUAL_URL_PLATFORM_IDS,
  VISIBLE_SOCIAL_SURFACE_ORDER,
} from '../social/onboardingSocialCatalog';
import {
  POST_CRJ_SOCIAL_CARD_ORDER,
  VISIBLE_POST_CRJ_SOCIAL_CARD_ORDER,
} from '../social/postCrjSocialEditor';
import { buildCrjSocialLinksPersistencePatch } from '../social/onboardingSocialPersistence';
import { emptyCrjSocialDraftValues } from '../social/onboardingSocialCatalog';
import enOnboarding from '../i18n/resources/onboarding';
import enAuth from '../i18n/resources/authentication';
import enProfile from '../i18n/resources/profile';
import enAlignment from '../i18n/resources/alignment';
import es from '../i18n/locales/es';

const here = dirname(fileURLToPath(import.meta.url));
const worktreeRoot = join(here, '../../../..');
const nearsyRoot = join(worktreeRoot, '..');

function readShared(rel: string): string {
  return readFileSync(join(here, '..', rel), 'utf8');
}

const translateItem = (nameKey: string, fallback: string) => fallback;

const REUSED_SPORTS = {
  sports_boxing: 'Boxing',
  sports_pickleball: 'Pickleball',
  sports_motorsports: 'Motorsports',
  sports_hockey: 'Hockey',
} as const;

const NEW_SPORTS = [
  'sports_mma',
  'sports_polo',
  'sports_martial_arts',
  'sports_padel',
  'sports_rugby',
  'sports_cricket',
  'sports_field_hockey',
  'sports_table_tennis',
  'sports_badminton',
  'sports_fencing',
  'sports_archery',
] as const;

describe('iOS 2.0.9 Altercall — password visibility', () => {
  it('starts hidden and keeps the typed value while toggling', () => {
    const login = readShared('screens/LoginScreen.tsx');
    const register = readShared('screens/RegisterScreen.tsx');
    const form = readShared('components/registration/FormInput.tsx');
    assert.match(login, /usePasswordVisibility\(true\)/);
    assert.match(login, /authentication\.login\.showPassword/);
    assert.match(login, /authentication\.login\.hidePassword/);
    assert.match(login, /textContentType="password"/);
    assert.match(register, /enablePasswordToggle/);
    assert.match(form, /enablePasswordToggle/);
    assert.match(form, /textContentType/);
    assert.equal(enAuth.login.showPassword, 'Show password');
    assert.equal(es.authentication.login.showPassword, 'Mostrar contraseña');
    assert.equal(enAuth.login.hidePassword, 'Hide password');
    assert.equal(es.authentication.login.hidePassword, 'Ocultar contraseña');
    assert.doesNotMatch(login, /console\.(log|debug|info).*password/i);
    assert.doesNotMatch(register, /confirmPassword/);
  });
});

describe('iOS 2.0.9 Altercall — Alignment / Compatibilidad', () => {
  it('uses Alignment in EN and Compatibilidad in ES without visible tiers', () => {
    assert.equal(enAlignment.title, 'Alignment');
    assert.equal(es.alignment.title, 'Compatibilidad');
    const nearby = readShared('screens/NearbySearchScreen.tsx');
    const card = readShared(
      'components/profileExploration/DiscoveryCompatibilityCard.tsx',
    );
    assert.doesNotMatch(nearby, /alignmentTierLabel/);
    assert.doesNotMatch(card, /alignmentTierLabel/);
    assert.match(nearby, /alignmentAccessibilityLabel/);
  });
});

describe('iOS 2.0.9 Altercall — Other interest icons', () => {
  it('keeps the original 20 names first and expands the picker', () => {
    const original = [
      'star-outline',
      'heart-outline',
      'flame-outline',
      'leaf-outline',
      'musical-notes-outline',
      'camera-outline',
      'bicycle-outline',
      'airplane-outline',
      'book-outline',
      'briefcase-outline',
      'cafe-outline',
      'game-controller-outline',
      'globe-outline',
      'home-outline',
      'people-outline',
      'rocket-outline',
      'football-outline',
      'color-palette-outline',
      'hardware-chip-outline',
      'restaurant-outline',
    ];
    assert.deepEqual(ONBOARDING_CUSTOM_INTEREST_ICONS.slice(0, 20), original);
    assert.equal(PICKER_ICONS.slice(0, 20).join(','), original.join(','));
    assert.equal(ONBOARDING_CUSTOM_INTEREST_ICONS.length, 113);
    assert.equal(
      ONBOARDING_CUSTOM_INTEREST_ICON_OPTIONS.length,
      ONBOARDING_CUSTOM_INTEREST_ICONS.length,
    );
    assert.equal(
      new Set(ONBOARDING_CUSTOM_INTEREST_ICONS).size,
      ONBOARDING_CUSTOM_INTEREST_ICONS.length,
    );
    const tennis = filterCustomInterestIcons('tenis');
    assert.ok(tennis.some((row) => row.icon === 'tennisball-outline'));
    const composer = readShared(
      'components/registration/OnboardingInterestCustomComposer.tsx',
    );
    assert.match(composer, /FlatList/);
    assert.match(composer, /filterCustomInterestIcons/);
    assert.doesNotMatch(composer, /MaterialCommunityIcons/);
  });
});

describe('iOS 2.0.9 Altercall — sports and travel manifesto', () => {
  it('reuses existing sports IDs and adds only missing coverage', () => {
    const items = flattenCatalogInterestItems();
    for (const [id, name] of Object.entries(REUSED_SPORTS)) {
      assert.equal(isSelectableCatalogInterestId(id), true, id);
      const row = items.find((item) => item.id === id);
      assert.equal(row?.name, name);
    }
    assert.equal(isSelectableCatalogInterestId('sports_car_racing'), false);
    assert.equal(isSelectableCatalogInterestId('sports_ice_hockey'), false);
    for (const id of NEW_SPORTS) {
      assert.equal(isSelectableCatalogInterestId(id), true, id);
      assert.equal(isLegacyDisplayInterestId(id), false, id);
    }
    const enItems = (enOnboarding as any).profileCompletion.interests.items;
    const esItems = (es as any).onboarding.profileCompletion.interests.items;
    assert.equal(enItems.sports_mma, 'MMA');
    assert.equal(esItems.sports_mma, 'Artes marciales mixtas');
    assert.equal(enItems.sports_motorsports, 'Motorsports');
    assert.equal(esItems.sports_motorsports, 'Deportes de motor');
    assert.equal(enItems.sports_hockey, 'Hockey');
    assert.equal(esItems.sports_hockey, 'Hockey');
  });

  it('ships an accessible manifesto and does not narrow motorsports or hockey', () => {
    const manifesto = readShared('interests/ios209AltercallInterestManifesto.md');
    assert.match(manifesto, /sports_motorsports/);
    assert.match(manifesto, /Motorsports/);
    assert.match(manifesto, /Deportes de motor/);
    assert.match(manifesto, /sports_hockey/);
    assert.match(manifesto, /sports_field_hockey/);
    assert.match(manifesto, /travel_world_cultures/);
    assert.match(manifesto, /legacy/);
    assert.match(manifesto, /f2855a1/);
    assert.match(manifesto, /Not created: `sports_car_racing`, `sports_ice_hockey`/);
    const catalog = readShared('interests/onboardingInterestCatalog.ts');
    assert.match(catalog, /item\('sports_hockey', 'Hockey'/);
    assert.match(catalog, /item\('sports_motorsports', 'Motorsports'/);
  });

  it('retires Cultural Experiences and Latin Culture without converting saved rows', () => {
    for (const id of ['travel_cultural', 'travel_latin_culture'] as const) {
      assert.equal(isSelectableCatalogInterestId(id), false, id);
      assert.equal(isLegacyDisplayInterestId(id), true, id);
      const chip = resolveInterestChip(id, translateItem);
      assert.ok(chip, id);
      assert.equal(chip!.id, id);
      assert.ok(resolveLegacyDisplayInterestItem(id));
    }
    assert.equal(isSelectableCatalogInterestId('travel_local'), true);
    assert.equal(isSelectableCatalogInterestId('travel_world_cultures'), true);
    assert.equal(isSelectableCatalogInterestId('travel_local_exploration'), false);
    const enItems = (enOnboarding as any).profileCompletion.interests.items;
    const esItems = (es as any).onboarding.profileCompletion.interests.items;
    assert.equal(enItems.travel_local, 'Local Exploration');
    assert.equal(esItems.travel_local, 'Exploración local');
    assert.equal(enItems.travel_world_cultures, 'World Cultures');
    assert.equal(esItems.travel_world_cultures, 'Culturas del mundo');
  });
});

describe('iOS 2.0.9 Altercall — social order, Web in CRJ, copy, immediate save', () => {
  it('uses YouTube → TikTok → Instagram → X → Facebook → LinkedIn → Web', () => {
    assert.deepEqual(VISIBLE_SOCIAL_SURFACE_ORDER, [
      'youtube',
      'tiktok',
      'instagram',
      'x',
      'facebook',
      'linkedin',
      'website',
    ]);
    assert.deepEqual(VISIBLE_POST_CRJ_SOCIAL_CARD_ORDER, [
      'youtube',
      'tiktok',
      'instagram',
      'x',
      'facebook',
      'linkedin',
      'website',
    ]);
    assert.equal(POST_CRJ_SOCIAL_CARD_ORDER.includes('snapchat'), true);
    assert.deepEqual(CRJ_MANUAL_URL_PLATFORM_IDS, ['facebook', 'linkedin']);
  });

  it('CRJ website persist does not complete the wizard', () => {
    const patch = buildCrjSocialLinksPersistencePatch(
      'personal',
      emptyCrjSocialDraftValues(),
      [],
      null,
      'https://nearsy.app',
    );
    assert.equal(patch.profileSetupCompleted, false);
    assert.equal(patch.socialLinksPersonal?.website, 'https://nearsy.app/');
    const crj = readShared('screens/ProfileCompletionScreen.tsx');
    assert.match(crj, /onPersistManual/);
    assert.match(crj, /profileSetupCompleted: false/);
    const step = readShared(
      'components/registration/OnboardingSocialMediaStep.tsx',
    );
    assert.match(step, /SocialConnectionModal/);
    assert.match(step, /platforms\.website/);
  });

  it('Instagram copy reuses a live challenge and does not treat close as connected', () => {
    const copy = readShared('social/instagramOwnership/copyChallenge.ts');
    const copyFn = copy.slice(
      copy.indexOf('export async function copyInstagramChallengeCode'),
      copy.indexOf('export async function shareInstagramChallengeCode'),
    );
    const controls = readShared(
      'social/instagramOwnership/InstagramChallengeCopyControls.tsx',
    );
    const owned = readShared(
      'components/registration/OwnedSocialConnectSection.tsx',
    );
    const screen = readShared('screens/SocialMediaScreen.tsx');
    const pkg = readFileSync(
      join(worktreeRoot, 'apps/nearsy-ios/package.json'),
      'utf8',
    );
    const lock = readFileSync(join(worktreeRoot, 'pnpm-lock.yaml'), 'utf8');
    const appConfig = readFileSync(
      join(worktreeRoot, 'apps/nearsy-ios/app.config.js'),
      'utf8',
    );
    assert.match(copy, /copyInstagramChallengeCode/);
    assert.match(copy, /expo-clipboard/);
    assert.match(copyFn, /setStringAsync/);
    assert.doesNotMatch(copyFn, /Share\.share/);
    assert.match(copy, /shareInstagramChallengeCode/);
    assert.match(copy, /alternative: 'ios-share-sheet'/);
    assert.match(controls, /InstagramChallengeCopyControls/);
    assert.match(controls, /profile\.social\.instagram\.shareSheet/);
    assert.match(controls, /clipboardUnavailable/);
    assert.doesNotMatch(controls, /result === 'copied'/);
    assert.match(pkg, /"expo-clipboard": "~8\.0\.8"/);
    assert.match(lock, /expo-clipboard@/);
    assert.match(appConfig, /expo-clipboard/);
    assert.match(owned, /live\.expiresAt > Date\.now\(\)/);
    assert.match(owned, /setConnectSheet\(null\)/);
    assert.match(owned, /InstagramChallengeCopyControls/);
    assert.doesNotMatch(owned, /inboxAuthorizeStart/);
    assert.match(screen, /InstagramChallengeCopyControls/);
    assert.match(screen, /persistDraftBag/);
    assert.match(screen, /profile\.social\.saveLink/);
    assert.equal(enProfile.social.instagram.shareSheet, 'Share');
    assert.equal(enProfile.social.instagram.shareCode, 'Copy code');
    assert.equal(es.profile.social.instagram.shareSheet, 'Compartir');
    assert.equal(
      es.profile.social.instagram.clipboardUnavailable.includes('Compartir'),
      true,
    );
  });
});

describe('iOS 2.0.9 Altercall — Functions #40 contacts/alerts blockage', () => {
  it('does not invent encounter-notify callables while Identity wire is not in this repo', () => {
    const contractA = join(nearsyRoot, 'encounter-notify-contracts-v1.md');
    const contractB = join(
      nearsyRoot,
      'prompts',
      'ios-encounter-notify.md',
    );
    assert.equal(existsSync(contractA), false);
    assert.equal(existsSync(contractB), false);
    const sharedSrc = join(here, '..');
    const scan = ['services', 'screens', 'visibility'];
    for (const folder of scan) {
      // Placeholder names must not be wired as if the contract existed.
      const path = join(sharedSrc, folder);
      assert.ok(existsSync(path), path);
    }
    const more = readShared('screens/MoreScreen.tsx');
    assert.doesNotMatch(more, /encounterNotify/i);
    assert.doesNotMatch(more, /appearanceKey/);
  });
});

describe('iOS 2.0.9 Altercall — custom icon names exist in Ionicons glyphmap', () => {
  it('does not invent Ionicons names', () => {
    const glyphPath = join(
      here,
      '../../../../node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json',
    );
    if (!existsSync(glyphPath)) {
      return;
    }
    const glyph = JSON.parse(readFileSync(glyphPath, 'utf8')) as Record<
      string,
      number
    >;
    for (const row of CUSTOM_INTEREST_ICON_ENTRIES) {
      assert.ok(glyph[row.icon] != null, row.icon);
    }
    for (const name of [
      'body-outline',
      'medal-outline',
      'flash-outline',
      'locate-outline',
      'earth-outline',
    ]) {
      assert.ok(glyph[name] != null, name);
    }
  });
});

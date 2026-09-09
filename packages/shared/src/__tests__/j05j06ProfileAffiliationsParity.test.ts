/**
 * J05/J06 Own Profile Affiliations + Logo.dev contract checks.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import {
  buildLogoDevImageUrl,
  isEphemeralProviderLogoUrl,
} from '../affiliations/affiliationLogoDev.ts';
import { buildPostCrjAffiliationPersistencePatch } from '../affiliations/onboardingAffiliationPersistence.ts';
import { readAffiliationsForPostCrjEditor } from '../affiliations/postCrjAffiliationEditor.ts';
import type { OnboardingSelectedAffiliation } from '../affiliations/onboardingAffiliationCatalog.ts';
import { MAX_GALLERY_ITEMS } from '../visibility/constants.ts';
import { OWN_PROFILE_GALLERY_COLUMNS } from '../gallery/galleryGridTokens.ts';

const here = dirname(fileURLToPath(import.meta.url));

function readSharedSource(relativeFromSharedSrc: string): string {
  return readFileSync(join(here, '..', relativeFromSharedSrc), 'utf8');
}

function readAndroidSource(relativeFromAndroidApp: string): string {
  return readFileSync(
    join(here, '../../../../apps/nearsy-android', relativeFromAndroidApp),
    'utf8',
  );
}

describe('J05/J06 Own Profile affiliations + logo contract', () => {
  it('AffiliationsScreen uses CRJ panel + scrollAnchorYRef (no iOS search bug)', () => {
    const src = readSharedSource('screens/AffiliationsScreen.tsx');
    assert.match(src, /OnboardingAffiliationCategoryPanel/);
    assert.match(src, /scrollAnchorYRef/);
    assert.match(src, /buildPostCrjAffiliationPersistencePatch/);
    assert.match(src, /readAffiliationsForPostCrjEditor/);
    assert.doesNotMatch(src, /uploadAffiliationImage/);
    assert.doesNotMatch(src, /CATEGORY_CONFIG/);
  });

  it('InterestsScreen uses onboarding catalog + post-CRJ persistence', () => {
    const src = readSharedSource('screens/InterestsScreen.tsx');
    assert.match(src, /OnboardingInterestCategoryPanel/);
    assert.match(src, /buildPostCrjInterestPersistencePatch/);
    assert.match(src, /readOnboardingInterestsFromDoc/);
    assert.doesNotMatch(src, /InterestsWithLogo/);
  });

  it('Android app.config wires Logo.dev publishable key into extra', () => {
    const src = readAndroidSource('app.config.js');
    assert.match(src, /EXPO_PUBLIC_LOGO_DEV_PUBLISHABLE_KEY/);
    assert.match(src, /logoDevPublishableKey/);
  });

  it('persists website/providerId and strips ephemeral Logo.dev URLs', () => {
    const selected: OnboardingSelectedAffiliation[] = [
      {
        id: 'logo.dev:microsoft',
        name: 'Microsoft',
        categoryId: 'professional',
        source: 'provider',
        providerId: 'logo.dev:microsoft.com',
        website: 'https://microsoft.com',
        logoUrl: 'https://img.logo.dev/microsoft.com?token=pk_test_placeholder',
      },
    ];
    assert.equal(isEphemeralProviderLogoUrl(selected[0].logoUrl), true);

    const patch = buildPostCrjAffiliationPersistencePatch('personal', selected);
    const row = patch.personalOnboardingAffiliations?.[0] as
      | Record<string, string>
      | undefined;
    assert.ok(row);
    assert.equal(row.website, 'https://microsoft.com');
    assert.equal(row.providerId, 'logo.dev:microsoft.com');
    assert.equal(row.logoUrl, undefined);

    const rebuilt = buildLogoDevImageUrl('microsoft.com', 'pk_test_placeholder');
    assert.equal(
      rebuilt,
      'https://img.logo.dev/microsoft.com?token=pk_test_placeholder',
    );

    const reloaded = readAffiliationsForPostCrjEditor(
      {
        personalOnboardingAffiliations: patch.personalOnboardingAffiliations,
      },
      'personal',
    );
    assert.equal(reloaded.affiliations.length, 1);
    assert.equal(reloaded.affiliations[0].website, 'https://microsoft.com');
  });

  it('Own Profile gallery keeps MVP 12 cap and 3 columns', () => {
    assert.equal(MAX_GALLERY_ITEMS, 12);
    assert.equal(OWN_PROFILE_GALLERY_COLUMNS, 3);
    const gallery = readSharedSource('screens/GalleryScreen.tsx');
    assert.match(gallery, /MAX_GALLERY_ITEMS/);
    assert.match(gallery, /OWN_PROFILE_GALLERY_COLUMNS/);
    assert.match(gallery, /buildPostCrjGalleryPersistencePatch/);
  });
});

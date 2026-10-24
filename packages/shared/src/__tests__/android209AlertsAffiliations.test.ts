/**
 * NEARSY-209 — Alerts (discoverNearby) + Identity & Lifestyle free-text + hide distance.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import {
  collectActiveModeInterestIds,
  mapDiscoverResultsToInterestAlerts,
} from '../hooks/nearbyAlertsMapping.ts';
import {
  buildUniqueCustomAffiliationId,
  isDuplicateAffiliation,
  isFreeTextAffiliationCategory,
} from '../affiliations/onboardingAffiliationCatalog.ts';
import { isEphemeralProviderLogoUrl } from '../affiliations/affiliationLogoDev.ts';
import { buildPostCrjAffiliationPersistencePatch } from '../affiliations/onboardingAffiliationPersistence.ts';
import type { OnboardingSelectedAffiliation } from '../affiliations/onboardingAffiliationCatalog.ts';
import type { DiscoverNearbyResult } from '../visibility/callables/wireTypes.ts';
import { parseDiscoveryAffiliations } from '../visibility/discoveryAffiliations.ts';

const here = dirname(fileURLToPath(import.meta.url));

function read(relativeFromSharedSrc: string): string {
  return readFileSync(join(here, '..', relativeFromSharedSrc), 'utf8');
}

describe('209 hide distance presentation', () => {
  it('Nearby card meta no longer formats distanceAway texts', () => {
    const nearby = read('screens/NearbySearchScreen.tsx');
    assert.doesNotMatch(nearby, /nearby\.distanceAwayFt/);
    assert.doesNotMatch(nearby, /nearby\.distanceAwayM/);
    assert.doesNotMatch(nearby, /formatDistance\(/);
    assert.match(nearby, /Distance remains on the wire/);
  });

  it('Alerts row no longer renders numeric distance', () => {
    const screen = read('screens/AlertsScreen.tsx');
    assert.doesNotMatch(screen, /formatAlertDistance/);
    assert.doesNotMatch(screen, /styles\.distance/);
    const presentation = read('screens/alertsPresentation.ts');
    assert.doesNotMatch(presentation, /formatAlertDistance/);
    assert.doesNotMatch(presentation, /notifications\.distance/);
  });
});

describe('209 Alerts discoverNearby + shared provider', () => {
  it('hook uses discoverNearby and never queries peer users', () => {
    const hook = read('hooks/useNearbyAlerts.ts');
    assert.match(hook, /discoverNearby/);
    assert.match(hook, /buildDiscoverNearbyRequest/);
    assert.match(hook, /getVisibilityDiscoveryClient/);
    assert.doesNotMatch(hook, /dbQueryVisibleUsers/);
    assert.doesNotMatch(hook, /haversineKm/);
    assert.doesNotMatch(hook, /contact_nearby/);
    assert.match(hook, /errorKind/);
    assert.match(hook, /collectActiveModeInterestIds/);
  });

  it('RootTabs and AlertsScreen share NearbyAlertsProvider (single instance)', () => {
    const tabs = read('navigation/RootTabs.tsx');
    const screen = read('screens/AlertsScreen.tsx');
    const ctx = read('hooks/NearbyAlertsContext.tsx');
    assert.match(ctx, /NearbyAlertsProvider/);
    assert.match(ctx, /useNearbyAlertsState/);
    assert.match(tabs, /NearbyAlertsProvider/);
    assert.match(tabs, /from '\.\.\/hooks\/NearbyAlertsContext'/);
    assert.match(screen, /from '\.\.\/hooks\/NearbyAlertsContext'/);
    assert.match(tabs, /tabBarBadge: alertsBadge/);
    assert.doesNotMatch(tabs, /from '\.\.\/hooks\/useNearbyAlerts'/);
  });

  it('Alerts opens DiscoveryProfile; push tap also uses DiscoveryProfile', () => {
    const screen = read('screens/AlertsScreen.tsx');
    const app = read('App.tsx');
    assert.match(screen, /DiscoveryProfile/);
    assert.match(screen, /openDiscoveryProfile\(item\.uid\)/);
    assert.match(app, /screen: 'DiscoveryProfile'/);
    assert.doesNotMatch(app, /screen: 'ProfileDetail'/);
  });

  it('Alerts distinguishes loading / empty / error (not silent permission-denied)', () => {
    const screen = read('screens/AlertsScreen.tsx');
    assert.match(screen, /notifications\.error\.title/);
    assert.match(screen, /notifications\.error\.permissionDenied/);
    assert.match(screen, /hasError/);
    assert.match(screen, /errorKind === 'permission-denied'/);
  });

  it('parity navigation asserts real discoverNearby wiring, not a comment', () => {
    const hook = read('hooks/useNearbyAlerts.ts');
    assert.match(hook, /client\.discoverNearby/);
    const alerts = read('screens/AlertsScreen.tsx');
    assert.match(alerts, /NearbyAlertsProvider|useNearbyAlerts/);
    assert.match(alerts, /DiscoveryProfile/);
  });

  it('maps discoverNearby results to interest_nearby with active-mode filter', () => {
    const me = {
      mode: 'personal' as const,
      searchPreferences: {
        personal: { interestIds: ['sports_outdoors_soccer'] },
        professional: { interestIds: ['tech_coding'] },
      },
      personalOnboardingInterests: [{ id: 'music_genre_pop' }],
      professionalOnboardingInterests: [{ id: 'tech_coding' }],
    };
    const ids = collectActiveModeInterestIds(me);
    assert.equal(ids.has('sports_outdoors_soccer'), true);
    assert.equal(ids.has('music_genre_pop'), true);
    assert.equal(ids.has('tech_coding'), false);

    const results: DiscoverNearbyResult[] = [
      {
        uid: 'peer-shared',
        distanceMeters: 12,
        profile: {
          mode: 'personal',
          displayName: 'Alex',
          profileImage: null,
          occupation: 'Dev',
          interestIds: ['music_genre_pop', 'other'],
        },
      },
      {
        uid: 'peer-none',
        distanceMeters: 20,
        profile: {
          mode: 'personal',
          displayName: 'Sam',
          profileImage: null,
          occupation: '',
          interestIds: ['unrelated'],
        },
      },
      {
        uid: 'self',
        distanceMeters: 0,
        profile: {
          mode: 'personal',
          displayName: 'Me',
          profileImage: null,
          occupation: '',
          interestIds: ['music_genre_pop'],
        },
      },
    ];
    const alerts = mapDiscoverResultsToInterestAlerts(
      results,
      ids,
      1_700_000_000_000,
      'self',
    );
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].uid, 'peer-shared');
    assert.equal(alerts[0].kind, 'interest_nearby');
    assert.deepEqual(alerts[0].sharedInterests, ['music_genre_pop']);
  });

  it('presentation keeps interest copy helpers without distance formatter', () => {
    const presentation = read('screens/alertsPresentation.ts');
    assert.match(presentation, /buildAlertRowMessage/);
    assert.match(presentation, /notifications\.messages\.interestNearby/);
    assert.doesNotMatch(presentation, /formatAlertDistance/);
  });
});

describe('209 Identity & Lifestyle free-text', () => {
  it('identity_lifestyle is freeText; others remain search', () => {
    assert.equal(isFreeTextAffiliationCategory('identity_lifestyle'), true);
    assert.equal(isFreeTextAffiliationCategory('professional'), false);
    assert.equal(isFreeTextAffiliationCategory('education'), false);
  });

  it('panel skips Logo.dev search for freeText and uses unique custom ids', () => {
    const panel = read(
      'components/registration/OnboardingAffiliationCategoryPanel.tsx',
    );
    assert.match(panel, /isFreeTextAffiliationCategory/);
    assert.match(panel, /buildUniqueCustomAffiliationId/);
    assert.match(panel, /familyNameHint/);
    assert.match(panel, /isEphemeralProviderLogoUrl/);
  });

  it('unique custom ids avoid slug collisions without changing prefix scheme', () => {
    const a = buildUniqueCustomAffiliationId('identity_lifestyle', 'C++', []);
    assert.match(a, /^custom_identity_lifestyle_/);
    const b = buildUniqueCustomAffiliationId('identity_lifestyle', 'C#', [a]);
    assert.match(b, /^custom_identity_lifestyle_/);
    assert.notEqual(a, b);
  });

  it('duplicate check can be scoped to category (cross-category names allowed)', () => {
    const list: OnboardingSelectedAffiliation[] = [
      {
        id: 'custom_community_veteran',
        name: 'Veteran',
        categoryId: 'community',
        source: 'custom',
      },
    ];
    assert.equal(
      isDuplicateAffiliation(
        list,
        { name: 'Veteran', source: 'custom' },
        { categoryId: 'identity_lifestyle' },
      ),
      false,
    );
    assert.equal(
      isDuplicateAffiliation(list, { name: 'Veteran', source: 'custom' }),
      true,
    );
  });

  it('ephemeral filter targets Logo.dev only; Storage token URLs persist', () => {
    assert.equal(
      isEphemeralProviderLogoUrl(
        'https://img.logo.dev/microsoft.com?token=pk_test',
      ),
      true,
    );
    const storage =
      'https://firebasestorage.googleapis.com/v0/b/nearsy-pj.appspot.com/o/users%2Fu1%2Faffiliations%2Fx.jpg?alt=media&token=abc-def';
    assert.equal(isEphemeralProviderLogoUrl(storage), false);

    const selected: OnboardingSelectedAffiliation[] = [
      {
        id: 'custom_identity_lifestyle_hometown',
        name: 'Hometown',
        categoryId: 'identity_lifestyle',
        source: 'custom',
        logoUrl: storage,
      },
    ];
    const patch = buildPostCrjAffiliationPersistencePatch('personal', selected);
    const row = patch.personalOnboardingAffiliations?.[0] as
      | Record<string, string>
      | undefined;
    assert.equal(row?.logoUrl, storage);
  });

  it('AffiliationsScreen uploads local images before persistence', () => {
    const src = read('screens/AffiliationsScreen.tsx');
    assert.match(src, /uploadAffiliationImage/);
    assert.match(src, /isLocalUri/);
  });

  it('public discovery strips Logo.dev logos for Identity & Lifestyle', () => {
    const discovery = read('visibility/discoveryAffiliations.ts');
    assert.match(discovery, /isFreeTextAffiliationCategory/);
    assert.match(discovery, /isEphemeralProviderLogoUrl/);
    const parsed = parseDiscoveryAffiliations([
      {
        id: 'custom_identity_lifestyle_hometown',
        name: 'Hometown',
        type: 'identity_lifestyle',
        logoUrl: 'https://img.logo.dev/example.com?token=pk_test',
      },
      {
        id: 'logo.dev:acme.com',
        name: 'Acme',
        type: 'professional',
        logoUrl: 'https://img.logo.dev/acme.com?token=pk_test',
      },
    ]);
    assert.equal(parsed[0].logoUrl, null);
    assert.equal(
      parsed[1].logoUrl,
      'https://img.logo.dev/acme.com?token=pk_test',
    );
  });

  it('Alerts invalidate in-flight discoverNearby on auth/me/unmount', () => {
    const hook = read('hooks/useNearbyAlerts.ts');
    assert.match(hook, /requestGenerationRef/);
    assert.match(hook, /onAuthStateChanged/);
    assert.match(hook, /generation !== requestGenerationRef\.current/);
    assert.match(hook, /clearInterval\(id\)/);
  });
});

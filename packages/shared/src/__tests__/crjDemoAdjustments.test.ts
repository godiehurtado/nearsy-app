import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ageFromBirthDate,
  birthDateToIso,
  isBirthDateInFuture,
  isCompleteBirthDate,
  meetsMinimumRegistrationAge,
  MIN_REGISTRATION_AGE,
  type BirthDateParts,
} from '../utils/birthDate';
import {
  buildActiveProfileSavePatch,
  resolveModePresentation,
} from '../profile/profileModeFields';
import { mapSocialProfileToNamePrefill } from '../authentication/social/application/mapSocialNamePrefill';
import {
  assertCatalogIconCoverage,
  assertNoUndefinedDeep,
  buildCrjInterestPersistencePatch,
  buildCustomInterestId,
  countFinalOnboardingInterests,
  flattenCatalogInterestItems,
  isMusicHierarchySelection,
  listOnboardingCategoryIds,
  meetsMinimumOnboardingInterests,
  MIN_ONBOARDING_INTERESTS,
  ONBOARDING_INTEREST_CATEGORIES,
  payloadContainsUndefined,
  sanitizeOnboardingInterestForPersistence,
  validateCustomInterestInput,
  type OnboardingSelectedInterest,
} from '../interests/onboardingInterestCatalog';
import { isProfileDocumentComplete } from '../utils/profileDocumentComplete';

function sel(
  partial: Omit<OnboardingSelectedInterest, 'icon' | 'iconColor'> &
    Partial<Pick<OnboardingSelectedInterest, 'icon' | 'iconColor'>>,
): OnboardingSelectedInterest {
  return {
    icon: 'star-outline',
    iconColor: '#3B82F6',
    ...partial,
  };
}

describe('MIN_REGISTRATION_AGE', () => {
  it('is 18', () => {
    assert.equal(MIN_REGISTRATION_AGE, 18);
  });
});

describe('birthDate age gate 18', () => {
  const asOf = new Date(2026, 7, 13);

  it('allows turning 18 today', () => {
    const b: BirthDateParts = { day: 13, month: 8, year: 2008 };
    assert.equal(meetsMinimumRegistrationAge(b, asOf), true);
    assert.equal(ageFromBirthDate(b, asOf), 18);
  });

  it('blocks turning 18 tomorrow', () => {
    const b: BirthDateParts = { day: 14, month: 8, year: 2008 };
    assert.equal(meetsMinimumRegistrationAge(b, asOf), false);
    assert.equal(ageFromBirthDate(b, asOf), 17);
  });

  it('rejects future dates', () => {
    const b: BirthDateParts = { day: 1, month: 1, year: 2030 };
    assert.equal(isBirthDateInFuture(b, asOf), true);
    assert.equal(meetsMinimumRegistrationAge(b, asOf), false);
    assert.equal(birthDateToIso(b), null);
  });

  it('rejects impossible dates including non-leap Feb 29', () => {
    assert.equal(
      isCompleteBirthDate({ day: 31, month: 2, year: 2000 }),
      false,
    );
    assert.equal(
      isCompleteBirthDate({ day: 29, month: 2, year: 2001 }),
      false,
    );
    assert.equal(
      isCompleteBirthDate({ day: 29, month: 2, year: 2000 }),
      true,
    );
  });

  it('handles leap-day birthday correctly', () => {
    const leap: BirthDateParts = { day: 29, month: 2, year: 2004 };
    assert.equal(ageFromBirthDate(leap, new Date(2026, 1, 28)), 21);
    assert.equal(ageFromBirthDate(leap, new Date(2026, 2, 1)), 22);
  });
});

describe('profileModeFields realName/lastName', () => {
  it('writes nested and mirrors top-level for personal', () => {
    const patch = buildActiveProfileSavePatch({
      mode: 'personal',
      presentation: {
        realName: 'Diego',
        lastName: 'Hurtado',
        occupation: 'Engineer',
        status: 'Hello',
        bio: 'Bio text',
      },
    });
    assert.equal(patch['profiles.personal.realName'], 'Diego');
    assert.equal(patch['profiles.personal.lastName'], 'Hurtado');
    assert.equal(patch.realName, 'Diego');
    assert.equal(patch.lastName, 'Hurtado');
    assert.equal(patch['profiles.personal.occupation'], 'Engineer');
    assert.equal(patch['profiles.professional.realName'], undefined);
    assert.equal(patch.company, undefined);
  });

  it('requires company only for professional writes when provided', () => {
    const personal = buildActiveProfileSavePatch({
      mode: 'personal',
      presentation: {
        realName: 'A',
        lastName: 'B',
        company: 'ShouldNotWrite',
      },
    });
    assert.equal(personal['profiles.personal.company'], undefined);

    const professional = buildActiveProfileSavePatch({
      mode: 'professional',
      presentation: {
        realName: 'Diego',
        lastName: 'Hurtado',
        company: 'Complemento 360',
        occupation: 'CEO',
        status: 'Open',
        bio: 'Pro bio',
      },
    });
    assert.equal(
      professional['profiles.professional.company'],
      'Complemento 360',
    );
    assert.equal(professional.company, 'Complemento 360');
    assert.equal(professional['profiles.personal.company'], undefined);
  });

  it('resolves nested identity with top-level fallback for active mode', () => {
    const resolved = resolveModePresentation(
      {
        mode: 'professional',
        realName: 'Top',
        lastName: 'Level',
        profiles: {
          professional: {
            realName: 'Nested',
            lastName: 'Pro',
          },
        },
      },
      'professional',
    );
    assert.equal(resolved.realName, 'Nested');
    assert.equal(resolved.lastName, 'Pro');
  });
});

describe('social name prefill', () => {
  it('uses given and family when present', () => {
    const p = mapSocialProfileToNamePrefill({
      givenName: 'Ada',
      familyName: 'Lovelace',
      displayName: 'Should Not Win',
    });
    assert.equal(p.firstName, 'Ada');
    assert.equal(p.lastName, 'Lovelace');
  });

  it('uses displayName only for Name when components missing', () => {
    const p = mapSocialProfileToNamePrefill({
      displayName: 'Ada Lovelace',
    });
    assert.equal(p.firstName, 'Ada Lovelace');
    assert.equal(p.lastName, '');
  });

  it('leaves lastName empty when only givenName exists', () => {
    const p = mapSocialProfileToNamePrefill({
      givenName: 'Ada',
    });
    assert.equal(p.firstName, 'Ada');
    assert.equal(p.lastName, '');
  });
});

describe('onboarding interest catalog', () => {
  it('has exactly 11 categories', () => {
    assert.equal(ONBOARDING_INTEREST_CATEGORIES.length, 11);
    assert.equal(listOnboardingCategoryIds().length, 11);
  });

  it('models Music with two levels (groups) including Anime', () => {
    const music = ONBOARDING_INTEREST_CATEGORIES.find((c) => c.id === 'music');
    assert.ok(music?.groups);
    assert.equal(music!.groups!.length, 6);
    assert.ok(!music!.items);
    const genres = music!.groups!.find((g) => g.id === 'music_group_genres');
    assert.ok((genres?.items.length ?? 0) >= 10);
    assert.ok(music!.groups!.some((g) => g.id === 'music_group_anime'));
  });

  it('enforces global minimum of 10', () => {
    const mk = (n: number): OnboardingSelectedInterest[] =>
      Array.from({ length: n }, (_, i) =>
        sel({
          id: `sports_item_${i}`,
          name: `Item ${i}`,
          categoryId: 'sports_outdoors',
        }),
      );
    assert.equal(meetsMinimumOnboardingInterests(mk(9)), false);
    assert.equal(meetsMinimumOnboardingInterests(mk(10)), true);
    assert.equal(meetsMinimumOnboardingInterests(mk(11)), true);
    assert.equal(MIN_ONBOARDING_INTERESTS, 10);
  });

  it('validates custom interest name + icon + duplicate', () => {
    const existing: OnboardingSelectedInterest[] = [
      sel({
        id: 'custom_1',
        name: 'My Hobby',
        categoryId: 'arts',
        isCustom: true,
        icon: 'star-outline',
      }),
    ];
    assert.equal(
      validateCustomInterestInput({
        name: '  ',
        icon: 'star-outline',
        categoryId: 'arts',
        existingInCategory: existing,
      }).ok,
      false,
    );
    assert.equal(
      validateCustomInterestInput({
        name: 'Pottery',
        icon: null,
        categoryId: 'arts',
        existingInCategory: existing,
      }).ok,
      false,
    );
    const ok = validateCustomInterestInput({
      name: 'Pottery',
      icon: 'color-palette-outline',
      categoryId: 'arts',
      existingInCategory: existing,
    });
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal(ok.name, 'Pottery');
      assert.ok(ok.iconColor);
      assert.ok(buildCustomInterestId('arts', ok.name).startsWith('custom_arts_'));
    }
  });

  it('uses deterministic catalog ids', () => {
    const ids = flattenCatalogInterestItems().map((i) => i.id);
    assert.ok(ids.includes('business_entrepreneurship'));
    assert.ok(ids.includes('technology_ai'));
    assert.ok(ids.includes('sports_soccer'));
    assert.ok(ids.includes('music_genre_pop'));
  });

  it('covers icons and colors for every catalog entry', () => {
    assert.doesNotThrow(() => assertCatalogIconCoverage());
    for (const it of flattenCatalogInterestItems()) {
      assert.ok(it.icon.trim());
      assert.ok(it.iconColor.trim());
      assert.match(it.iconColor, /^#[0-9A-Fa-f]{6}$/);
    }
  });
});

describe('CRJ interest persistence & matching bridge', () => {
  const pop = sel({
    id: 'music_genre_pop',
    name: 'Pop',
    categoryId: 'music',
    groupId: 'music_group_genres',
    icon: 'musical-notes-outline',
    iconColor: '#7C3AED',
  });
  const soccer = sel({
    id: 'sports_soccer',
    name: 'Soccer',
    categoryId: 'sports_outdoors',
    groupId: 'sports_outdoors_group_sports',
    icon: 'football-outline',
    iconColor: '#059669',
  });
  const customPottery = sel({
    id: 'custom_arts_pottery_171000',
    name: 'Pottery',
    categoryId: 'arts',
    icon: 'color-palette-outline',
    iconColor: '#DB2777',
    isCustom: true,
  });
  const otherPlaceholder = sel({
    id: 'arts_other',
    name: 'Other',
    categoryId: 'arts',
  });

  it('A — predefined Personal writes labels + detailed, no affiliations', () => {
    const patch = buildCrjInterestPersistencePatch('personal', [soccer, pop]);
    assert.deepEqual(patch.personalInterests, ['Soccer', 'Pop']);
    assert.equal(patch.personalOnboardingInterests?.length, 2);
    assert.equal(patch.professionalInterests, undefined);
    assert.equal('personalInterestAffiliations' in patch, false);
  });

  it('B — predefined Professional writes labels + detailed for professional only', () => {
    const patch = buildCrjInterestPersistencePatch('professional', [soccer]);
    assert.deepEqual(patch.professionalInterests, ['Soccer']);
    assert.equal(patch.professionalOnboardingInterests?.[0]?.id, 'sports_soccer');
    assert.equal(patch.personalInterests, undefined);
  });

  it('C — interests do not contaminate the opposite profile mode', () => {
    const personal = buildCrjInterestPersistencePatch('personal', [soccer]);
    const professional = buildCrjInterestPersistencePatch('professional', [pop]);
    assert.ok(personal.personalInterests);
    assert.equal(personal.professionalInterests, undefined);
    assert.ok(professional.professionalInterests);
    assert.equal(professional.personalInterests, undefined);
  });

  it('D — Music Level 1 groups are not final selections', () => {
    const music = ONBOARDING_INTEREST_CATEGORIES.find((c) => c.id === 'music')!;
    for (const g of music.groups ?? []) {
      assert.equal(
        countFinalOnboardingInterests([
          sel({ id: g.id, name: g.name, categoryId: 'music' }),
        ]),
        0,
      );
    }
    assert.equal(
      countFinalOnboardingInterests([
        sel({
          id: 'music_group_genres',
          name: 'Music Genres',
          categoryId: 'music',
        }),
        pop,
      ]),
      1,
    );
  });

  it('E — Music Level 2 counts and keeps hierarchy', () => {
    assert.equal(countFinalOnboardingInterests([pop]), 1);
    assert.equal(isMusicHierarchySelection(pop), true);
    const patch = buildCrjInterestPersistencePatch('personal', [pop]);
    const saved = patch.personalOnboardingInterests![0]!;
    assert.equal(saved.categoryId, 'music');
    assert.equal(saved.groupId, 'music_group_genres');
    assert.equal(saved.id, 'music_genre_pop');
  });

  it('F — custom interest counts once', () => {
    assert.equal(countFinalOnboardingInterests([customPottery]), 1);
    assert.equal(
      countFinalOnboardingInterests([customPottery, customPottery]),
      1,
    );
  });

  it('G — Other without custom does not count / is not persisted', () => {
    assert.equal(countFinalOnboardingInterests([otherPlaceholder]), 0);
    const patch = buildCrjInterestPersistencePatch('personal', [
      otherPlaceholder,
      soccer,
    ]);
    assert.deepEqual(patch.personalInterests, ['Soccer']);
    assert.equal(patch.personalOnboardingInterests?.length, 1);
  });

  it('H — official catalog ids are stable and unique', () => {
    const ids = flattenCatalogInterestItems().map((i) => i.id);
    assert.equal(ids.length, new Set(ids).size);
  });

  it('I — EN/ES label translation does not alter ids', () => {
    const popItem = flattenCatalogInterestItems().find(
      (i) => i.id === 'music_genre_pop',
    );
    assert.equal(popItem?.name, 'Pop');
    assert.equal(popItem?.nameKey, 'music_genre_pop');
  });

  it('J — minimum 10 uses unique final interests', () => {
    const nine = Array.from({ length: 9 }, (_, i) =>
      sel({
        id: `sports_item_${i}`,
        name: `Item ${i}`,
        categoryId: 'sports_outdoors',
      }),
    );
    assert.equal(meetsMinimumOnboardingInterests(nine), false);
    assert.equal(
      meetsMinimumOnboardingInterests([...nine, pop, soccer]),
      true,
    );
  });

  it('M — custom does not invent legacy affiliations', () => {
    const patch = buildCrjInterestPersistencePatch('personal', [customPottery]);
    assert.deepEqual(patch.personalInterests, ['Pottery']);
    assert.equal(patch.personalOnboardingInterests?.[0]?.isCustom, true);
    assert.equal('personalInterestAffiliations' in patch, false);
  });
});

describe('Firestore serialization — no undefined', () => {
  it('sanitize omits undefined optionals including groupId', () => {
    const regular = sanitizeOnboardingInterestForPersistence(
      sel({
        id: 'sports_soccer',
        name: 'Soccer',
        categoryId: 'sports_outdoors',
        // groupId intentionally omitted
      }),
    );
    assert.equal('groupId' in regular, false);
    assert.equal('isCustom' in regular, false);
    assert.equal(payloadContainsUndefined(regular), false);

    const withUndef = sanitizeOnboardingInterestForPersistence({
      id: 'x',
      name: 'X',
      categoryId: 'sports_outdoors',
      icon: 'football-outline',
      iconColor: '#059669',
      groupId: undefined as any,
      isCustom: undefined as any,
    });
    assert.equal('groupId' in withUndef, false);
    assert.equal('isCustom' in withUndef, false);
  });

  it('A regular without groupId — no undefined in patch', () => {
    const soccer = sel({
      id: 'sports_soccer',
      name: 'Soccer',
      categoryId: 'sports_outdoors',
    });
    // Simulate old buggy object shape with explicit undefined
    const buggy = { ...soccer, groupId: undefined as any };
    const patch = buildCrjInterestPersistencePatch('personal', [buggy]);
    assert.equal(payloadContainsUndefined(patch), false);
    assertNoUndefinedDeep(patch);
    assert.equal(
      'groupId' in (patch.personalOnboardingInterests![0] as object),
      false,
    );
  });

  it('B Music Level 2 with groupId — no undefined', () => {
    const pop = sel({
      id: 'music_genre_pop',
      name: 'Pop',
      categoryId: 'music',
      groupId: 'music_group_genres',
    });
    const patch = buildCrjInterestPersistencePatch('personal', [pop]);
    assert.equal(payloadContainsUndefined(patch), false);
    assert.equal(patch.personalOnboardingInterests![0]!.groupId, 'music_group_genres');
  });

  it('C custom interest — no undefined', () => {
    const custom = sel({
      id: 'custom_arts_pottery_1',
      name: 'Pottery',
      categoryId: 'arts',
      isCustom: true,
      icon: 'color-palette-outline',
    });
    const patch = buildCrjInterestPersistencePatch('personal', [custom]);
    assert.equal(payloadContainsUndefined(patch), false);
    assert.equal(patch.personalOnboardingInterests![0]!.isCustom, true);
  });

  it('D–H all categories / modes / counts — no undefined', () => {
    const picks: OnboardingSelectedInterest[] = [];
    for (const cat of ONBOARDING_INTEREST_CATEGORIES) {
      if (cat.items) {
        const leaf = cat.items.find((i) => !i.isOther);
        if (leaf) {
          picks.push(
            sel({
              id: leaf.id,
              name: leaf.name,
              categoryId: cat.id,
              icon: leaf.icon,
              iconColor: leaf.iconColor,
            }),
          );
        }
      }
      if (cat.groups) {
        for (const g of cat.groups) {
          const leaf = g.items[0];
          if (!leaf) continue;
          picks.push(
            sel({
              id: leaf.id,
              name: leaf.name,
              categoryId: cat.id,
              groupId: g.id,
              icon: leaf.icon,
              iconColor: leaf.iconColor,
            }),
          );
        }
      }
    }
    assert.ok(picks.length >= 7);

    for (const mode of ['personal', 'professional'] as const) {
      for (const slice of [
        picks.slice(0, 7),
        picks.slice(0, 8),
        picks,
      ]) {
        const patch = buildCrjInterestPersistencePatch(mode, slice);
        assert.equal(payloadContainsUndefined(patch), false);
        assertNoUndefinedDeep(patch);
      }
    }
  });
});

describe('profileSetupCompleted gate', () => {
  it('never infers completion from fields alone', () => {
    assert.equal(
      isProfileDocumentComplete({
        realName: 'Diego',
        lastName: 'Hurtado',
        occupation: 'Dev',
        profileImage: 'https://x',
        personalInterests: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      }),
      false,
    );
    assert.equal(
      isProfileDocumentComplete({ profileSetupCompleted: true }),
      true,
    );
  });
});

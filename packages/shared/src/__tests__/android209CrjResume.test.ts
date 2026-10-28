/**
 * Android CRJ durable resume — named versioned cursor, not a numeric index.
 *
 * Without a cursor, catalogs and optional steps cannot be recovered:
 * which affiliation/interest category was on screen, whether Social /
 * Gallery / Location / Notifications were skipped vs unvisited, and
 * in-category picks that were never persisted (killed before Next).
 * Bags still hydrate for the active mode; empty bags never prove skip.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ANDROID_CRJ_RESUME_FIELD,
  ANDROID_CRJ_RESUME_LAYOUT,
  ANDROID_CRJ_RESUME_VERSION,
  buildAndroidCrjResumePatch,
  decodeCrjResumeStepId,
  encodeCrjResumeStepId,
  parseAndroidCrjResumeRecord,
  recoverAndroidCrjResume,
} from '../components/registration/crjResume.ts';
import {
  crjStepIndexFromFlag,
  listCrjAffiliationCategoryIds,
  listCrjInterestCategoryIds,
  resolveCrjStepFromFlag,
} from '../components/registration/crjStepOrderCore.ts';

const here = dirname(fileURLToPath(import.meta.url));
const affiliationIds = listCrjAffiliationCategoryIds();
const interestIds = listCrjInterestCategoryIds();

function read(relativeFromSharedSrc: string): string {
  return readFileSync(join(here, '..', relativeFromSharedSrc), 'utf8');
}

function recover(doc: Record<string, unknown> | null | undefined) {
  return recoverAndroidCrjResume({
    doc,
    affiliationIds,
    interestIds,
  });
}

function kindAt(index: number): string {
  return resolveCrjStepFromFlag(index, true).kind;
}

function personalThroughDetails(
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    mode: 'personal',
    birthCountryCode: 'CO',
    languageCodes: ['es'],
    personalAffiliations: extra.personalAffiliations ?? [],
    personalInterests: extra.personalInterests ?? [],
    socialLinksPersonal: extra.socialLinksPersonal ?? {},
    personalGallery: extra.personalGallery ?? [],
    profiles: {
      personal: {
        realName: 'Ana',
        lastName: 'Hurtado',
        profileImage: 'https://example.com/ana.jpg',
        occupation: 'Productora',
        bio: 'Bio de Ana para el CRJ',
      },
    },
    ...extra,
  };
}

function professionalThroughDetails(
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    mode: 'professional',
    birthCountryCode: 'CO',
    languageCodes: ['es'],
    profiles: {
      professional: {
        realName: 'Ana Pro',
        lastName: 'Hurtado',
        profileImage: 'https://example.com/pro.jpg',
        occupation: 'Directora',
        bio: 'Bio profesional de Ana',
        company: 'Nearsy',
      },
    },
    ...extra,
  };
}

function cursorPatch(
  mode: 'personal' | 'professional',
  step: Parameters<typeof encodeCrjResumeStepId>[0],
) {
  return buildAndroidCrjResumePatch(mode, step);
}

describe('NEARSY-209 Android CRJ durable named resume cursor', () => {
  it('encodes a versioned named step id, not a numeric index', () => {
    assert.equal(encodeCrjResumeStepId({ kind: 'details' }), 'details');
    assert.equal(
      encodeCrjResumeStepId({
        kind: 'affiliation',
        affiliationCategoryIndex: 2,
        categoryId: affiliationIds[2]!,
      }),
      `affiliation:${affiliationIds[2]}`,
    );
    assert.equal(
      encodeCrjResumeStepId({
        kind: 'interest',
        interestCategoryIndex: 3,
        categoryId: interestIds[3]!,
      }),
      `interest:${interestIds[3]}`,
    );
    const patch = cursorPatch('personal', { kind: 'socialMedia' });
    assert.equal(patch.androidCrjResume.version, ANDROID_CRJ_RESUME_VERSION);
    assert.equal(patch.androidCrjResume.layout, ANDROID_CRJ_RESUME_LAYOUT);
    assert.equal(patch.androidCrjResume.step, 'socialMedia');
    assert.equal(patch.profileSetupCompleted, false);
    assert.equal(parseAndroidCrjResumeRecord({ version: 1, step: '4' }), null);
    assert.equal(
      parseAndroidCrjResumeRecord({
        version: 1,
        layout: ANDROID_CRJ_RESUME_LAYOUT,
        mode: 'personal',
        step: '12',
      })?.step,
      '12',
    );
    assert.equal(
      decodeCrjResumeStepId('12', affiliationIds, interestIds),
      null,
    );
  });

  it('reopens Affiliations and Interests on the named category with mode bags intact', () => {
    const community = affiliationIds[2]!;
    const music = interestIds[3]!;
    const affiliationDoc = personalThroughDetails({
      personalAffiliations: [{ id: 'u1', categoryId: 'education', name: 'U' }],
      ...cursorPatch('personal', {
        kind: 'affiliation',
        affiliationCategoryIndex: 2,
        categoryId: community,
      }),
    });
    const affiliationResume = recover(affiliationDoc);
    const affiliationStep = resolveCrjStepFromFlag(
      affiliationResume.stepIndex,
      true,
    );
    assert.equal(affiliationResume.reason, 'cursor');
    assert.equal(affiliationStep.kind, 'affiliation');
    if (affiliationStep.kind === 'affiliation') {
      assert.equal(affiliationStep.categoryId, community);
    }
    assert.equal(
      (affiliationDoc.personalAffiliations as { name: string }[])[0]?.name,
      'U',
    );

    const interestDoc = personalThroughDetails({
      personalInterests: ['music_genre_pop'],
      ...cursorPatch('personal', {
        kind: 'interest',
        interestCategoryIndex: 3,
        categoryId: music,
      }),
    });
    const interestResume = recover(interestDoc);
    const interestStep = resolveCrjStepFromFlag(interestResume.stepIndex, true);
    assert.equal(interestResume.reason, 'cursor');
    assert.equal(interestStep.kind, 'interest');
    if (interestStep.kind === 'interest') {
      assert.equal(interestStep.categoryId, music);
    }
  });

  it('keeps skipped optional steps when the cursor is ahead of empty bags', () => {
    const skipped = recover(
      personalThroughDetails({
        socialLinksPersonal: {},
        personalGallery: [],
        ...cursorPatch('personal', { kind: 'location' }),
      }),
    );
    assert.equal(skipped.reason, 'cursor');
    assert.equal(kindAt(skipped.stepIndex), 'location');

    const gallery = recover(
      personalThroughDetails({
        socialLinksPersonal: {},
        ...cursorPatch('personal', { kind: 'gallery' }),
      }),
    );
    assert.equal(kindAt(gallery.stepIndex), 'gallery');
  });

  it('does not apply a personal cursor to a professional registration', () => {
    const mixed = recover(
      professionalThroughDetails({
        ...cursorPatch('personal', { kind: 'socialMedia' }),
      }),
    );
    assert.equal(mixed.reason, 'conservative');
    const step = resolveCrjStepFromFlag(mixed.stepIndex, true);
    assert.equal(step.kind, 'affiliation');
    if (step.kind === 'affiliation') {
      assert.equal(step.categoryId, affiliationIds[0]);
    }
    assert.equal(kindAt(mixed.stepIndex) === 'socialMedia', false);
  });

  it('does not infer catalogs or optionals from empty bags when no cursor exists', () => {
    const legacy = recover(
      personalThroughDetails({
        personalAffiliations: [],
        personalInterests: [],
        socialLinksPersonal: {},
        personalGallery: [],
      }),
    );
    assert.equal(legacy.reason, 'conservative');
    const step = resolveCrjStepFromFlag(legacy.stepIndex, true);
    assert.equal(step.kind, 'affiliation');
    if (step.kind === 'affiliation') {
      assert.equal(step.categoryId, affiliationIds[0]);
    }
    assert.equal(kindAt(legacy.stepIndex), 'affiliation');
    assert.ok(legacy.stepIndex < crjStepIndexFromFlag({ kind: 'socialMedia' }, true));
  });

  it('walks identity, photo and details conservatively, then stops at first affiliation', () => {
    assert.deepEqual(recover(null), { stepIndex: 0, reason: 'safe' });
    assert.deepEqual(recover({}), { stepIndex: 0, reason: 'safe' });

    const typeOnly = recover({ mode: 'personal' });
    assert.equal(typeOnly.reason, 'conservative');
    assert.equal(kindAt(typeOnly.stepIndex), 'identity');

    const named = recover({
      mode: 'personal',
      birthCountryCode: 'CO',
      profiles: {
        personal: { realName: 'Ana', lastName: 'Hurtado' },
      },
    });
    assert.equal(kindAt(named.stepIndex), 'photo');

    const photographed = recover({
      mode: 'personal',
      birthCountryCode: 'CO',
      profiles: {
        personal: {
          realName: 'Ana',
          lastName: 'Hurtado',
          profileImage: 'https://example.com/ana.jpg',
        },
      },
    });
    assert.equal(kindAt(photographed.stepIndex), 'details');
  });

  it('falls back to a safe step for unknown or incompatible cursors without completing CRJ', () => {
    const unknown = recover(
      personalThroughDetails({
        [ANDROID_CRJ_RESUME_FIELD]: {
          version: ANDROID_CRJ_RESUME_VERSION,
          layout: ANDROID_CRJ_RESUME_LAYOUT,
          mode: 'personal',
          step: 'affiliation:not-a-category',
        },
      }),
    );
    assert.equal(unknown.reason, 'conservative');
    assert.equal(kindAt(unknown.stepIndex), 'affiliation');

    const future = recover(
      personalThroughDetails({
        [ANDROID_CRJ_RESUME_FIELD]: {
          version: 99,
          layout: ANDROID_CRJ_RESUME_LAYOUT,
          mode: 'personal',
          step: 'socialMedia',
        },
      }),
    );
    assert.equal(future.reason, 'conservative');
    assert.equal(kindAt(future.stepIndex), 'affiliation');

    const otherLayout = recover(
      personalThroughDetails({
        [ANDROID_CRJ_RESUME_FIELD]: {
          version: ANDROID_CRJ_RESUME_VERSION,
          layout: 'interests-before-affiliations',
          mode: 'personal',
          step: 'socialMedia',
        },
      }),
    );
    assert.equal(otherLayout.reason, 'conservative');
    assert.equal(kindAt(otherLayout.stepIndex), 'affiliation');

    const numeric = recover(
      personalThroughDetails({
        [ANDROID_CRJ_RESUME_FIELD]: {
          version: ANDROID_CRJ_RESUME_VERSION,
          layout: ANDROID_CRJ_RESUME_LAYOUT,
          mode: 'personal',
          step: '12',
        },
      }),
    );
    assert.equal(numeric.reason, 'conservative');
    assert.equal(kindAt(numeric.stepIndex), 'affiliation');

    const patch = cursorPatch('personal', { kind: 'notifications' });
    assert.equal(patch.profileSetupCompleted, false);
    const success = recover(
      personalThroughDetails(cursorPatch('personal', { kind: 'success' })),
    );
    assert.equal(success.reason, 'cursor');
    assert.equal(kindAt(success.stepIndex), 'success');
    assert.equal(
      personalThroughDetails(patch).profileSetupCompleted === true,
      false,
    );
  });

  it('wires Android load, persist-on-advance/back/skip, and never infers skip from empty bags', () => {
    const screen = read('screens/ProfileCompletionScreen.tsx');
    assert.match(screen, /recoverAndroidCrjResume/);
    assert.match(screen, /buildAndroidCrjResumePatch/);
    assert.match(screen, /ANDROID_CRJ_RESUME_FIELD/);
    assert.match(screen, /persistAndroidCrjResume/);
    assert.match(screen, /commitStepIndex/);
    assert.match(
      screen,
      /Platform\.OS === 'android'[\s\S]*recoverAndroidCrjResume/,
    );
    assert.match(
      screen,
      /Platform\.OS !== 'android' \|\| !uid \|\| !mode/,
    );
    assert.match(
      screen,
      /else \{\s*await persistAffiliations\(\);\s*await commitStepIndex\(stepIndex \+ 1\);/,
    );
    assert.match(
      screen,
      /else \{\s*await persistInterests\(\);\s*await commitStepIndex\(stepIndex \+ 1\);/,
    );
    assert.match(
      screen,
      /if \(step\.kind === 'affiliation'\) await persistAffiliations\(\)/,
    );
    assert.match(
      screen,
      /if \(step\.kind === 'interest'\) await persistInterests\(\)/,
    );
    assert.match(screen, /await commitStepIndex\(stepIndex - 1\)/);
    assert.match(
      screen,
      /advanceSocialMedia\(\{ requireValidFields: false \}\)/,
    );
    assert.match(screen, /advanceGallery\(\{ persist: false \}\)/);
    assert.match(
      screen,
      /step\.kind === 'location'[\s\S]*void commitStepIndex\(stepIndex \+ 1\)/,
    );
    assert.match(
      screen,
      /step\.kind === 'notifications'[\s\S]*void commitStepIndex\(stepIndex \+ 1\)/,
    );
    assert.match(
      screen,
      /\[ANDROID_CRJ_RESUME_FIELD\]: firestoreDeleteField\(\)/,
    );
    assert.match(screen, /applyModePresentation/);
    assert.doesNotMatch(screen, /empty.*===.*skip/i);
    assert.match(
      screen,
      /Empty bags[\s\S]*do not mean a catalog or optional step was finished/,
    );
  });
});

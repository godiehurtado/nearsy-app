import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { POST_AFFILIATIONS_CRJ_STEP } from '../affiliations/onboardingAffiliationPersistence';
import {
  CRJ_SOCIAL_PLATFORM_IDS,
  CRJ_SOCIAL_PLATFORMS,
  countConnectedSocials,
  emptyCrjSocialDraftValues,
} from '../social/onboardingSocialCatalog';
import {
  POST_SOCIAL_MEDIA_CRJ_STEP,
  buildCrjSocialLinksPersistencePatch,
  readCrjSocialDraft,
} from '../social/onboardingSocialPersistence';
import {
  collectSocialFieldErrors,
  isDuplicateCustomNetwork,
  normalizeCustomNetworkUrl,
  normalizeSocialInput,
} from '../social/socialLinkNormalize';
import {
  payloadContainsUndefined,
} from '../interests/onboardingInterestCatalog';

const here = dirname(fileURLToPath(import.meta.url));

function readSharedSource(relativeFromSharedSrc: string): string {
  return readFileSync(join(here, '..', relativeFromSharedSrc), 'utf8');
}

describe('CRJ-I7 Social Media architecture', () => {
  it('A — Social Media follows Affiliations', () => {
    assert.equal(POST_AFFILIATIONS_CRJ_STEP, 'socialMedia');
    const screen = readSharedSource('screens/ProfileCompletionScreen.tsx');
    const affIdx = screen.indexOf(
      'offset -= AFFILIATION_CATEGORY_IDS.length',
    );
    const socialReturn = screen.indexOf(
      "if (offset === 0) return { kind: 'socialMedia' }",
    );
    assert.ok(affIdx > 0);
    assert.ok(socialReturn > affIdx);
  });

  it('B — Social Media precedes Location', () => {
    assert.equal(POST_SOCIAL_MEDIA_CRJ_STEP, 'location');
    const screen = readSharedSource('screens/ProfileCompletionScreen.tsx');
    assert.ok(screen.includes('POST_SOCIAL_MEDIA_CRJ_STEP'));
    assert.ok(screen.includes("kind: 'socialMedia'"));
    assert.ok(screen.includes("kind === 'location'"));
  });

  it('C — Social Media appears exactly once in navigation resolve', () => {
    const screen = readSharedSource('screens/ProfileCompletionScreen.tsx');
    const returns = screen.match(/return \{ kind: 'socialMedia' \}/g) ?? [];
    assert.equal(returns.length, 1);
    assert.equal(CRJ_SOCIAL_PLATFORMS.length, 7);
    assert.deepEqual(CRJ_SOCIAL_PLATFORM_IDS, [
      'linkedin',
      'instagram',
      'facebook',
      'youtube',
      'x',
      'tiktok',
      'snapchat',
    ]);
  });

  it('D — no N/M counter', () => {
    const screen = readSharedSource('screens/ProfileCompletionScreen.tsx');
    const panel = readSharedSource(
      'components/registration/OnboardingSocialMediaStep.tsx',
    );
    assert.ok(!screen.includes('Category N of'));
    assert.ok(!screen.match(/step\s+\d+\s*\/\s*\d+/i));
    assert.ok(!panel.includes('Category N of'));
    assert.ok(!panel.includes('Step N of'));
  });

  it('E — Social Media is optional', () => {
    const screen = readSharedSource('screens/ProfileCompletionScreen.tsx');
    assert.ok(screen.includes("case 'socialMedia':"));
    assert.ok(screen.includes('return true'));
    const panel = readSharedSource(
      'components/registration/OnboardingSocialMediaStep.tsx',
    );
    assert.ok(panel.includes('socialMedia.skip') || screen.includes("socialMedia.skip"));
  });

  it('F — Skip → Location', () => {
    const screen = readSharedSource('screens/ProfileCompletionScreen.tsx');
    assert.ok(screen.includes('advanceSocialMedia({ requireValidFields: false })'));
    assert.equal(POST_SOCIAL_MEDIA_CRJ_STEP, 'location');
  });

  it('G — Continue → Location', () => {
    const screen = readSharedSource('screens/ProfileCompletionScreen.tsx');
    assert.ok(screen.includes('advanceSocialMedia({ requireValidFields: true })'));
    assert.ok(screen.includes('await persistSocialMedia()'));
    assert.ok(screen.includes('setStepIndex((i) => i + 1)'));
  });

  it('H — Location Back → Social Media', () => {
    const screen = readSharedSource('screens/ProfileCompletionScreen.tsx');
    assert.ok(screen.includes('function goBack()'));
    assert.ok(screen.includes('setStepIndex((i) => i - 1)'));
    assert.ok(screen.includes("kind: 'socialMedia'"));
  });

  it('I — Social Media Back → final affiliation category', () => {
    const screen = readSharedSource('screens/ProfileCompletionScreen.tsx');
    const catalog = readSharedSource(
      'affiliations/onboardingAffiliationCatalog.ts',
    );
    assert.ok(screen.includes("kind: 'affiliation'"));
    assert.ok(screen.includes('function goBack()'));
    assert.ok(catalog.includes("'identity_lifestyle'"));
  });
});

describe('CRJ-I7 Social Media data / validation', () => {
  it('Personal isolation — does not write professional', () => {
    const values = emptyCrjSocialDraftValues();
    values.instagram = '@diego';
    const patch = buildCrjSocialLinksPersistencePatch('personal', values, []);
    assert.ok(patch.socialLinksPersonal);
    assert.equal(patch.socialLinksProfessional, undefined);
    assert.equal(
      patch.socialLinksPersonal?.instagram,
      'https://www.instagram.com/diego',
    );
  });

  it('Professional isolation — does not write personal', () => {
    const values = emptyCrjSocialDraftValues();
    values.linkedin = 'https://www.linkedin.com/in/jane';
    const patch = buildCrjSocialLinksPersistencePatch(
      'professional',
      values,
      [],
    );
    assert.ok(patch.socialLinksProfessional);
    assert.equal(patch.socialLinksPersonal, undefined);
    assert.equal(
      patch.socialLinksProfessional?.linkedin,
      'https://www.linkedin.com/in/jane',
    );
  });

  it('existing data prefill hydrates twitter into X and keeps website out of draft', () => {
    const draft = readCrjSocialDraft(
      {
        socialLinksPersonal: {
          twitter: 'https://x.com/diego',
          website: 'https://example.com',
          instagram: 'https://www.instagram.com/diego',
        },
      },
      'personal',
    );
    assert.equal(draft.values.x, 'https://x.com/diego');
    assert.equal(draft.values.instagram, 'https://www.instagram.com/diego');
    assert.equal(
      (draft.values as Record<string, string>).website,
      undefined,
    );
  });

  it('add / edit / remove via draft normalization', () => {
    const values = emptyCrjSocialDraftValues();
    values.tiktok = '@near';
    let patch = buildCrjSocialLinksPersistencePatch('personal', values, []);
    assert.equal(
      patch.socialLinksPersonal?.tiktok,
      'https://www.tiktok.com/@near',
    );
    values.tiktok = '@nearsy';
    patch = buildCrjSocialLinksPersistencePatch('personal', values, []);
    assert.equal(
      patch.socialLinksPersonal?.tiktok,
      'https://www.tiktok.com/@nearsy',
    );
    values.tiktok = '';
    patch = buildCrjSocialLinksPersistencePatch('personal', values, []);
    assert.equal(patch.socialLinksPersonal?.tiktok, undefined);
  });

  it('empty optional step persists empty map without completing profile', () => {
    const patch = buildCrjSocialLinksPersistencePatch(
      'personal',
      emptyCrjSocialDraftValues(),
      [],
    );
    assert.deepEqual(patch.socialLinksPersonal, {});
    assert.equal(patch.profileSetupCompleted, false);
    assert.equal('visibility' in patch, false);
  });

  it('URL / handle normalization', () => {
    assert.equal(
      normalizeSocialInput('instagram', '@diego').ok &&
        (normalizeSocialInput('instagram', '@diego') as { url?: string }).url,
      'https://www.instagram.com/diego',
    );
    assert.equal(
      (normalizeSocialInput('x', 'diego') as { url?: string }).url,
      'https://x.com/diego',
    );
    assert.equal(
      (normalizeSocialInput('x', 'https://twitter.com/diego') as { url?: string })
        .url,
      'https://x.com/diego',
    );
    assert.equal(
      (normalizeSocialInput('linkedin', 'https://www.linkedin.com/in/jane') as {
        url?: string;
      }).url,
      'https://www.linkedin.com/in/jane',
    );
    assert.equal(
      (normalizeSocialInput('youtube', '@channel') as { url?: string }).url,
      'https://www.youtube.com/@channel',
    );
  });

  it('invalid obvious URL is rejected', () => {
    const bad = normalizeSocialInput('instagram', 'https://');
    assert.equal(bad.ok, false);
    const js = normalizeSocialInput('website' as 'instagram', 'javascript:alert(1)');
    assert.equal(js.ok, false);
    const errors = collectSocialFieldErrors(
      { ...emptyCrjSocialDraftValues(), facebook: 'not a valid handle!!' },
      'invalid',
    );
    assert.equal(errors.facebook, 'invalid');
  });

  it('duplicate custom network prevention', () => {
    const list = [{ name: 'Mastodon', url: 'https://mastodon.social/@a' }];
    assert.equal(isDuplicateCustomNetwork(list, 'mastodon'), true);
    assert.equal(isDuplicateCustomNetwork(list, 'Bluesky'), false);
  });

  it('no undefined persistence and no profileSetupCompleted/visibility flags', () => {
    const values = emptyCrjSocialDraftValues();
    values.snapchat = 'diego';
    const patch = buildCrjSocialLinksPersistencePatch('personal', values, [
      { name: 'Mastodon', url: 'https://mastodon.social/@diego' },
    ]);
    assert.equal(payloadContainsUndefined(patch), false);
    assert.equal(patch.profileSetupCompleted, false);
    assert.equal(Object.prototype.hasOwnProperty.call(patch, 'visibility'), false);
    assert.ok(patch.socialLinksPersonal?.custom);
  });

  it('preserves existing website without showing it in CRJ platforms', () => {
    const patch = buildCrjSocialLinksPersistencePatch(
      'personal',
      emptyCrjSocialDraftValues(),
      [],
      { website: 'https://nearsy.app', instagram: 'https://instagram.com/old' },
    );
    assert.equal(patch.socialLinksPersonal?.website, 'https://nearsy.app');
    assert.equal(patch.socialLinksPersonal?.instagram, undefined);
    assert.ok(!CRJ_SOCIAL_PLATFORM_IDS.includes('website' as never));
  });

  it('custom network requires a usable URL', () => {
    const empty = normalizeCustomNetworkUrl('');
    assert.equal(empty.ok, true);
    assert.equal(empty.ok && empty.url, undefined);
    const ok = normalizeCustomNetworkUrl('mastodon.social/@diego');
    assert.equal(ok.ok, true);
    assert.ok(ok.ok && ok.url?.startsWith('https://'));
    const patch = buildCrjSocialLinksPersistencePatch(
      'personal',
      emptyCrjSocialDraftValues(),
      [{ name: 'Broken', url: '' }],
    );
    assert.equal(patch.socialLinksPersonal?.custom, undefined);
  });

  it('X stores under production twitter key', () => {
    const values = emptyCrjSocialDraftValues();
    values.x = '@diego';
    const patch = buildCrjSocialLinksPersistencePatch('personal', values, []);
    assert.equal(patch.socialLinksPersonal?.twitter, 'https://x.com/diego');
    assert.equal(
      (patch.socialLinksPersonal as Record<string, unknown> | undefined)?.x,
      undefined,
    );
  });

  it('connected count includes custom networks', () => {
    const values = emptyCrjSocialDraftValues();
    values.facebook = 'https://www.facebook.com/diego';
    assert.equal(
      countConnectedSocials(values, [{ name: 'Other', url: 'https://a.co' }]),
      2,
    );
  });
});

describe('CRJ-I7 isolation from I9 / Gallery / Auth', () => {
  it('does not implement Gallery or CRJ-I9', () => {
    const screen = readSharedSource('screens/ProfileCompletionScreen.tsx');
    assert.ok(!screen.includes("kind: 'gallery'"));
    const provider = readSharedSource(
      'affiliations/affiliationEntitySearchProvider.ts',
    );
    assert.ok(provider.includes('CRJ-I9'));
    assert.ok(provider.includes('future'));
  });
});

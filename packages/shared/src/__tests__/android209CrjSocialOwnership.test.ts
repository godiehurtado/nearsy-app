/**
 * Android CRJ social — reuse post-login Connect/Get/Unlink; FB/LI stay URLs.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { emptyCrjSocialDraftValues } from '../social/onboardingSocialCatalog.ts';
import { ANDROID_OWNERSHIP_CARD_IDS } from '../social/postCrjSocialEditor.ts';
import { collectSocialFieldErrors } from '../social/socialLinkNormalize.ts';

const here = dirname(fileURLToPath(import.meta.url));

function read(relativeFromSharedSrc: string): string {
  return readFileSync(join(here, '..', relativeFromSharedSrc), 'utf8');
}

describe('NEARSY-209 Android CRJ social ownership', () => {
  it('embeds YouTube, TikTok, Instagram and X cards on the CRJ step', () => {
    const step = read('components/registration/OnboardingSocialMediaStep.tsx');
    assert.match(step, /YoutubeOwnershipCard/);
    assert.match(step, /TiktokOwnershipCard/);
    assert.match(step, /InstagramOwnershipCard/);
    assert.match(step, /XOwnershipCard/);
    assert.match(step, /Platform\.OS === 'android'/);
    assert.match(step, /mode=\{mode\}/);
    assert.match(step, /legacyUrl=\{values\.youtube\}/);
    assert.match(step, /legacyUrl=\{values\.tiktok\}/);
    assert.match(step, /legacyUrl=\{values\.instagram\}/);
    assert.match(step, /legacyUrl=\{values\.x\}/);
    assert.match(step, /VISIBLE_CRJ_SOCIAL_PLATFORMS/);
    assert.doesNotMatch(step, /instagramInboxAuthorizeStart/);
    assert.doesNotMatch(step, /Authorize inbox|authorizeInbox/i);
  });

  it('keeps Facebook and LinkedIn as optional URL fields and hides Snapchat', () => {
    const step = read('components/registration/OnboardingSocialMediaStep.tsx');
    assert.match(step, /values\[platform\.id\]/);
    assert.match(step, /platform\.id === 'youtube'/);
    const catalog = read('social/onboardingSocialCatalog.ts');
    assert.match(catalog, /VISIBLE_CRJ_SOCIAL_PLATFORMS/);
    assert.match(catalog, /platform\.id !== 'snapchat'/);
    const screen = read('screens/ProfileCompletionScreen.tsx');
    assert.match(
      screen,
      /advanceSocialMedia\(\{ requireValidFields: false \}\)/,
    );
    assert.match(screen, /skipPlatformIds: ANDROID_OWNERSHIP_CARD_IDS/);
  });

  it('does not block Next on leftover ownership-platform URL noise', () => {
    const values = emptyCrjSocialDraftValues();
    values.youtube = 'https://example.com/not-youtube';
    values.linkedin = 'https://www.linkedin.com/in/nearsy';
    const blocked = collectSocialFieldErrors(values, 'invalid');
    assert.equal(blocked.youtube, 'invalid');
    const skipped = collectSocialFieldErrors(values, 'invalid', {
      skipPlatformIds: ANDROID_OWNERSHIP_CARD_IDS,
    });
    assert.equal(skipped.youtube, undefined);
    assert.equal(skipped.linkedin, undefined);
  });

  it('does not add inbox admin authorization anywhere in CRJ', () => {
    const screen = read('screens/ProfileCompletionScreen.tsx');
    const step = read('components/registration/OnboardingSocialMediaStep.tsx');
    assert.doesNotMatch(screen, /instagramInboxAuthorizeStart/);
    assert.doesNotMatch(step, /instagramInboxAuthorizeStart/);
  });
});

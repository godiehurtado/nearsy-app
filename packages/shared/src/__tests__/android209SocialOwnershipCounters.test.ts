import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CRJ_SOCIAL_PLATFORMS,
  emptyCrjSocialDraftValues,
} from '../social/onboardingSocialCatalog.ts';
import {
  ANDROID_OWNERSHIP_CARD_IDS,
  countValidPostCrjSocialConnections,
  emptyPostCrjSocialConnectedState,
  type PostCrjSocialEditorDraft,
} from '../social/postCrjSocialEditor.ts';
import { buildPostCrjSocialLinksPersistencePatch } from '../social/onboardingSocialPersistence.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), 'utf8');
}

function draftWithLegacy(): PostCrjSocialEditorDraft {
  const values = emptyCrjSocialDraftValues();
  values.youtube = 'https://www.youtube.com/@legacy';
  values.tiktok = 'https://www.tiktok.com/@legacy';
  values.instagram = 'https://www.instagram.com/legacy';
  values.x = 'https://x.com/legacy';
  values.linkedin = 'https://www.linkedin.com/in/legacy';
  values.facebook = 'https://www.facebook.com/legacy';
  values.snapchat = 'legacy';
  return {
    values,
    website: '',
    custom: [],
    connected: {
      ...emptyPostCrjSocialConnectedState(),
      youtube: true,
      tiktok: true,
      instagram: true,
      x: true,
      linkedin: true,
      facebook: true,
      snapchat: true,
    },
  };
}

describe('NEARSY-209 Android ownership counters and legacy bag', () => {
  it('counts verified ownership of all four networks without duplicating legacy URLs', () => {
    const draft = draftWithLegacy();
    const none = countValidPostCrjSocialConnections(draft, {
      youtube: false,
      tiktok: false,
      instagram: false,
      x: false,
    });
    // LinkedIn + Facebook still count from the bag. Snapchat is hidden.
    assert.equal(none, 2);

    const allVerified = countValidPostCrjSocialConnections(draft, {
      youtube: true,
      tiktok: true,
      instagram: true,
      x: true,
    });
    assert.equal(allVerified, 6);

    const emptyValues = draftWithLegacy();
    emptyValues.values.youtube = '';
    emptyValues.values.tiktok = '';
    emptyValues.values.instagram = '';
    emptyValues.values.x = '';
    emptyValues.connected.youtube = false;
    emptyValues.connected.tiktok = false;
    emptyValues.connected.instagram = false;
    emptyValues.connected.x = false;
    assert.equal(
      countValidPostCrjSocialConnections(emptyValues, {
        youtube: true,
        tiktok: true,
        instagram: true,
        x: true,
      }),
      6,
    );
  });

  it('maps editor platform x onto the twitter storage bag', () => {
    assert.deepEqual(ANDROID_OWNERSHIP_CARD_IDS, [
      'youtube',
      'tiktok',
      'instagram',
      'x',
    ]);
    const x = CRJ_SOCIAL_PLATFORMS.find((p) => p.id === 'x');
    assert.equal(x?.storageKey, 'twitter');
    const values = emptyCrjSocialDraftValues();
    values.x = 'https://x.com/nearsyapp';
    const patch = buildPostCrjSocialLinksPersistencePatch(
      'personal',
      values,
      [],
    );
    assert.equal(patch.socialLinksPersonal?.twitter, 'https://x.com/nearsyapp');
    assert.equal(
      (patch.socialLinksPersonal as { x?: string } | undefined)?.x,
      undefined,
    );
  });

  it('hides Snapchat from editor and public surfaces while keeping LinkedIn/Facebook', () => {
    const ids = CRJ_SOCIAL_PLATFORMS.map((p) => p.id);
    assert.ok(ids.includes('linkedin'));
    assert.ok(ids.includes('facebook'));
    assert.ok(ids.includes('snapchat'));
    const screen = readSrc('screens/SocialMediaScreen.tsx');
    assert.match(screen, /POST_CRJ_SOCIAL_CARD_ORDER/);
    assert.match(screen, /valuesForSave\.snapchat/);
    const order = readSrc('social/postCrjSocialEditor.ts');
    assert.match(order, /VISIBLE_CRJ_SOCIAL_PLATFORMS/);
    const cardOrder = order.slice(
      order.indexOf('export const POST_CRJ_SOCIAL_CARD_ORDER'),
      order.indexOf('export type PostCrjSocialEditorDraft'),
    );
    assert.doesNotMatch(cardOrder, /snapchat/);
  });

  it('unifies Connect/Disconnect action pills across ownership and legacy cards', () => {
    const styles = readSrc('components/profile/socialActionButtonStyles.ts');
    assert.match(styles, /borderRadius: radius\.pill/);
    assert.match(styles, /minHeight: 32/);
    assert.doesNotMatch(styles, /minHeight: 44/);
    assert.match(styles, /SOCIAL_ACTION_HIT_SLOP/);
    for (const rel of [
      'screens/SocialMediaScreen.tsx',
      'components/profile/InstagramOwnershipCard.tsx',
      'components/profile/YoutubeOwnershipCard.tsx',
      'components/profile/TiktokOwnershipCard.tsx',
      'components/profile/XOwnershipCard.tsx',
    ]) {
      const src = readSrc(rel);
      assert.match(src, /socialActionButtonStyles/);
      assert.match(src, /SOCIAL_ACTION_HIT_SLOP/);
      assert.doesNotMatch(src, /toggleBtn:\s*\{/);
    }
  });

  it('SocialMediaScreen preserves all four legacy bags and zeros manual connect', () => {
    const screen = readSrc('screens/SocialMediaScreen.tsx');
    for (const id of ANDROID_OWNERSHIP_CARD_IDS) {
      assert.match(screen, new RegExp(`connected\\.${id} = false`));
      assert.match(screen, new RegExp(`preserveLegacy\\('${id}'\\)`));
    }
    assert.match(screen, /YoutubeOwnershipCard/);
    assert.match(screen, /TiktokOwnershipCard/);
    assert.match(screen, /InstagramOwnershipCard/);
    assert.match(screen, /XOwnershipCard/);
    assert.doesNotMatch(screen, /instagramInboxAuthorizeStart/);
  });
});

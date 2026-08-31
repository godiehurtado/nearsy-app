import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildPostCrjSocialLinksPersistencePatch,
  buildValuesForPostCrjSocialSave,
  countConfiguredSocialLinksInBag,
  countValidPostCrjSocialConnections,
  emptyPostCrjSocialConnectedState,
  extractOwnProfileSocialSummaryCounts,
  isPostCrjSocialEditorDirty,
  parsePostCrjSocialEditorParams,
  POST_CRJ_SOCIAL_CARD_ORDER,
  readPostCrjSocialEditorDraft,
  validatePostCrjSocialDraftForSave,
} from '../social/postCrjSocialEditor';
import { CRJ_SOCIAL_PLATFORMS } from '../social/onboardingSocialCatalog';

const labels = {
  requiredWhenConnected: 'Enter a profile link or handle',
  invalidValue: 'Check this link or username and try again',
};

describe('post-CRJ social editor helpers', () => {
  it('parsePostCrjSocialEditorParams fails closed on invalid params', () => {
    assert.deepEqual(
      parsePostCrjSocialEditorParams({ uid: 'u1', mode: 'personal' }, null),
      { ok: false, reason: 'missing_auth' },
    );
    assert.deepEqual(
      parsePostCrjSocialEditorParams({ uid: 'u2', mode: 'personal' }, 'u1'),
      { ok: false, reason: 'uid_mismatch' },
    );
    assert.deepEqual(
      parsePostCrjSocialEditorParams({ uid: 'u1', mode: 'invalid' }, 'u1'),
      { ok: false, reason: 'invalid_mode' },
    );
  });

  it('card order includes all eight canonical platforms with Website last', () => {
    assert.equal(POST_CRJ_SOCIAL_CARD_ORDER.length, 8);
    assert.equal(POST_CRJ_SOCIAL_CARD_ORDER.at(-1), 'website');
    for (const platform of CRJ_SOCIAL_PLATFORMS) {
      assert.ok(POST_CRJ_SOCIAL_CARD_ORDER.includes(platform.id));
    }
  });

  it('reads Personal and Professional bags in isolation', () => {
    const doc = {
      socialLinksPersonal: {
        instagram: 'https://www.instagram.com/personal',
        website: 'https://personal.example.com/',
        custom: [{ name: 'Blog', url: 'https://blog.example.com/' }],
      },
      socialLinksProfessional: {
        linkedin: 'https://www.linkedin.com/in/pro',
      },
    };
    const personal = readPostCrjSocialEditorDraft(doc, 'personal');
    assert.equal(personal.connected.instagram, true);
    assert.equal(personal.connected.linkedin, false);
    assert.equal(personal.connected.website, true);
    assert.equal(personal.custom.length, 1);
    assert.equal(personal.values.instagram, 'https://www.instagram.com/personal');

    const professional = readPostCrjSocialEditorDraft(doc, 'professional');
    assert.equal(professional.connected.linkedin, true);
    assert.equal(professional.connected.instagram, false);
    assert.equal(professional.custom.length, 0);
  });

  it('preserves custom social data in draft without counting in card counter', () => {
    const doc = {
      socialLinksPersonal: {
        instagram: 'https://www.instagram.com/diego',
        custom: [{ name: 'Blog', url: 'https://blog.example.com/' }],
      },
    };
    const draft = readPostCrjSocialEditorDraft(doc, 'personal');
    assert.equal(draft.custom.length, 1);
    assert.equal(countValidPostCrjSocialConnections(draft), 1);
    assert.equal(countConfiguredSocialLinksInBag(doc.socialLinksPersonal as any), 1);
  });

  it('connect expands draft and disconnect clears platform values', () => {
    const snapshot = readPostCrjSocialEditorDraft(null, 'personal');
    const connected = {
      ...snapshot,
      connected: { ...snapshot.connected, instagram: true },
      values: { ...snapshot.values, instagram: '@diego' },
    };
    assert.equal(isPostCrjSocialEditorDirty(snapshot, connected), true);

    const disconnected = {
      ...connected,
      connected: { ...connected.connected, instagram: false },
      values: { ...connected.values, instagram: '' },
    };
    assert.equal(isPostCrjSocialEditorDirty(snapshot, disconnected), false);
    assert.equal(countValidPostCrjSocialConnections(disconnected), 0);
  });

  it('blocks save when connected platform is empty or invalid', () => {
    const draft = readPostCrjSocialEditorDraft(null, 'personal');
    draft.connected.instagram = true;
    draft.values.instagram = '';
    assert.equal(
      validatePostCrjSocialDraftForSave(draft, labels).ok,
      false,
    );

    draft.values.instagram = 'javascript:alert(1)';
    const invalid = validatePostCrjSocialDraftForSave(draft, labels);
    assert.equal(invalid.ok, false);
    if (!invalid.ok) {
      assert.ok(invalid.errors.instagram);
    }

    draft.values.instagram = '@diego';
    assert.equal(
      validatePostCrjSocialDraftForSave(draft, labels).ok,
      true,
    );
  });

  it('count includes only connected valid platforms and Website', () => {
    const draft = readPostCrjSocialEditorDraft(null, 'personal');
    draft.connected.instagram = true;
    draft.values.instagram = '@diego';
    draft.connected.website = true;
    draft.website = 'https://nearsy.app';
    draft.connected.x = true;
    draft.values.x = '';
    assert.equal(countValidPostCrjSocialConnections(draft), 2);
  });

  it('buildValuesForPostCrjSocialSave omits disconnected platforms', () => {
    const draft = readPostCrjSocialEditorDraft(
      {
        socialLinksPersonal: {
          instagram: 'https://www.instagram.com/diego',
          linkedin: 'https://www.linkedin.com/in/diego',
        },
      },
      'personal',
    );
    draft.connected.linkedin = false;
    const values = buildValuesForPostCrjSocialSave(draft);
    assert.equal(values.instagram, 'https://www.instagram.com/diego');
    assert.equal(values.linkedin, '');
  });

  it('extractOwnProfileSocialSummaryCounts derives per-face counts', () => {
    const doc = {
      socialLinksPersonal: {
        instagram: 'https://www.instagram.com/personal',
        website: 'https://personal.example.com/',
        custom: [{ name: 'Blog', url: 'https://blog.example.com/' }],
      },
      socialLinksProfessional: {
        twitter: 'https://x.com/pro',
      },
    };
    const counts = extractOwnProfileSocialSummaryCounts(doc);
    assert.equal(counts.personal, 2);
    assert.equal(counts.professional, 1);
  });
});

describe('post-CRJ Social Media editor screen contract', () => {
  const sharedRoot = path.resolve(import.meta.dirname, '..');

  function readShared(rel: string) {
    return fs.readFileSync(path.join(sharedRoot, rel), 'utf8');
  }

  it('SocialMediaScreen uses post-CRJ persistence builder only', () => {
    const screen = readShared('screens/SocialMediaScreen.tsx');
    assert.match(screen, /buildPostCrjSocialLinksPersistencePatch/);
    assert.doesNotMatch(screen, /buildCrjSocialLinksPersistencePatch/);
    assert.doesNotMatch(screen, /setSocialLinks/);
    assert.doesNotMatch(screen, /TopHeader/);
    assert.doesNotMatch(screen, /useGuideAudio/);
    assert.doesNotMatch(screen, /queueMicrotask/);
    assert.match(screen, /connectPlatform/);
    assert.match(screen, /disconnectPlatform/);
    assert.match(screen, /parsePostCrjSocialEditorParams/);
  });

  it('SocialMediaScreen implements Connect/Disconnect draft semantics', () => {
    const screen = readShared('screens/SocialMediaScreen.tsx');
    assert.match(screen, /\{connected \? \(/);
    assert.match(screen, /profile\.social\.connect/);
    assert.match(screen, /profile\.social\.disconnect/);
    assert.match(screen, /countValidPostCrjSocialConnections/);
    assert.match(screen, /saveConnections/);
  });

  it('SocialMediaScreen dismisses keyboard after successful save', () => {
    const screen = readShared('screens/SocialMediaScreen.tsx');
    const saveBlock = screen.slice(
      screen.indexOf('const handleSave'),
      screen.indexOf('const bottomBarInset'),
    );
    assert.match(saveBlock, /updateUserProfilePartial/);
    assert.match(saveBlock, /Keyboard\.dismiss\(\)/);
  });

  it('post-CRJ patch replaces one face bag and preserves custom', () => {
    const draft = readPostCrjSocialEditorDraft(
      {
        socialLinksPersonal: {
          instagram: 'https://www.instagram.com/old',
          custom: [{ name: 'Blog', url: 'https://blog.example.com/' }],
        },
      },
      'personal',
    );
    draft.connected.instagram = true;
    draft.values.instagram = '@diego';
    draft.connected.website = true;
    draft.website = 'https://nearsy.app';
    const patch = buildPostCrjSocialLinksPersistencePatch(
      'personal',
      buildValuesForPostCrjSocialSave(draft),
      draft.custom,
      { website: draft.website },
    );
    assert.deepEqual(Object.keys(patch).sort(), ['socialLinksPersonal']);
    assert.equal(
      Object.prototype.hasOwnProperty.call(patch, 'profileSetupCompleted'),
      false,
    );
    assert.equal(
      patch.socialLinksPersonal?.instagram,
      'https://www.instagram.com/diego',
    );
    assert.equal(
      patch.socialLinksPersonal?.website,
      'https://nearsy.app/',
    );
    assert.equal(patch.socialLinksPersonal?.custom?.length, 1);
  });

  it('disconnect removes platform key on save', () => {
    const draft = readPostCrjSocialEditorDraft(
      {
        socialLinksPersonal: {
          instagram: 'https://www.instagram.com/diego',
          linkedin: 'https://www.linkedin.com/in/diego',
        },
      },
      'personal',
    );
    draft.connected.linkedin = false;
    const patch = buildPostCrjSocialLinksPersistencePatch(
      'personal',
      buildValuesForPostCrjSocialSave(draft),
      draft.custom,
    );
    assert.equal(
      patch.socialLinksPersonal?.instagram,
      'https://www.instagram.com/diego',
    );
    assert.equal(patch.socialLinksPersonal?.linkedin, undefined);
  });

  it('CompleteProfileScreen refreshes social summaries without full reload when dirty', () => {
    const screen = readShared('screens/CompleteProfileScreen.tsx');
    assert.match(screen, /refreshProfileSummaries/);
    assert.match(screen, /extractOwnProfileSocialSummaryCounts/);
    assert.match(screen, /personalSocialSummaryCount/);
    assert.doesNotMatch(screen, /Object\.values\(currentLinks/);
  });

  it('ProfileStack requires uid and mode for SocialMedia', () => {
    const stack = readShared('navigation/ProfileStack.tsx');
    assert.match(stack, /SocialMedia:\s*\{\s*uid: string;/);
    assert.match(stack, /mode: 'personal' \| 'professional'/);
  });
});

/**
 * Android manual social links in the CRJ and the editor: states, what each
 * operation writes, and what must survive it. Writes go through a model of a
 * Firestore merge; the same payloads are also run on the emulator:
 * packages/shared/src/__tests__/android209SearchPrefsRules.emulator.mjs
 * Run: node --experimental-strip-types --test packages/shared/src/__tests__/android209SocialParity.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { profileTranslations } from '../i18n/resources/profile.ts';
import {
  buildManualSocialLinkWrite,
  isManualSocialLinkId,
  manualSocialLinkCardState,
  MANUAL_SOCIAL_LINK_ORDER,
  saveManualSocialLink,
} from '../social/manualSocialLinkCard.ts';
import {
  buildCrjSocialLinksPersistencePatch,
  mergeManualLinkIntoShell,
  mergeSocialLinksIntoShell,
  readCrjSocialDraft,
  readExistingSocialLinks,
} from '../social/onboardingSocialPersistence.ts';
import {
  applyManualLinkResult,
  EXPECTED_SOCIAL_DISPLAY_ORDER,
  POST_CRJ_SOCIAL_CARD_ORDER,
  readPostCrjSocialEditorDraft,
} from '../social/postCrjSocialEditor.ts';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) =>
  readFileSync(join(SRC, rel), 'utf8').replace(/\r\n/g, '\n');

const DELETE = Symbol('delete');

/** set(..., { merge: true }): nested maps merge key by key; arrays are replaced. */
function firestoreMerge(doc: any, patch: any): any {
  const out = { ...doc };
  for (const [key, value] of Object.entries(patch)) {
    if (value === DELETE) delete out[key];
    else if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = firestoreMerge(out[key] ?? {}, value);
    } else out[key] = value;
  }
  return out;
}

const CUSTOM = [
  { name: 'Mastodon', url: 'https://mastodon.social/@ana' },
  // Would not pass today's validation, and must survive anyway.
  { name: 'Old', url: 'not a url' },
];

function storedDoc() {
  return {
    profileSetupCompleted: true,
    socialLinksPersonal: {
      facebook: 'https://www.facebook.com/ana',
      twitter: 'https://x.com/ana',
      snapchat: 'https://snapchat.com/add/ana',
      custom: CUSTOM,
    },
    socialLinksProfessional: {
      linkedin: 'https://www.linkedin.com/in/ana',
      website: 'https://www.ana.example/',
    },
  };
}

const write = (
  doc: any,
  mode: 'personal' | 'professional',
  field: 'facebook' | 'linkedin' | 'website',
  url: string | null,
) => firestoreMerge(doc, buildManualSocialLinkWrite(mode, field, url, DELETE));

describe('Card states', () => {
  it('no link: Add link, no Remove', () => {
    for (const url of ['', '   ', null, undefined]) {
      const state = manualSocialLinkCardState(url);
      assert.equal(state.saved, false);
      assert.equal(state.statusKey, 'profile.social.noLinkSaved');
      assert.equal(state.primaryLabelKey, 'profile.social.addLink');
      assert.equal(state.showRemove, false);
    }
  });

  it('saved link: Edit and Remove, and only "Link saved"', () => {
    const state = manualSocialLinkCardState('https://www.facebook.com/ana');
    assert.equal(state.statusKey, 'profile.social.linkSaved');
    assert.equal(state.primaryLabelKey, 'profile.social.editLink');
    assert.equal(state.primaryA11yKey, 'profile.social.editLinkA11y');
    assert.equal(state.showRemove, true);
  });

  it('order: YouTube, TikTok, Instagram, X, Facebook, LinkedIn, Website', () => {
    assert.deepEqual(
      [...POST_CRJ_SOCIAL_CARD_ORDER],
      ['youtube', 'tiktok', 'instagram', 'x', 'facebook', 'linkedin', 'website'],
    );
    assert.deepEqual([...POST_CRJ_SOCIAL_CARD_ORDER], [...EXPECTED_SOCIAL_DISPLAY_ORDER]);
    assert.deepEqual(MANUAL_SOCIAL_LINK_ORDER, ['facebook', 'linkedin', 'website']);
    assert.equal(isManualSocialLinkId('youtube'), false);
  });

  it('does not look like a verified account', () => {
    const card = read('components/profile/ManualSocialLinkCard.tsx');
    assert.doesNotMatch(card, /palette\.success|connectedDot|profile\.social\.connected/);
    assert.doesNotMatch(card, /OwnershipCard|OAuth|verified\b/i);
  });

  it('every action names its network for accessibility, in EN and ES', () => {
    const { en, es } = profileTranslations as any;
    for (const [locale, expected] of [
      [en.social, { linkSaved: 'Link saved', noLinkSaved: 'No link saved', addLink: 'Add link', editLink: 'Edit', removeLink: 'Remove', back: 'Back' }],
      [es.social, { linkSaved: 'Enlace guardado', noLinkSaved: 'Sin enlace', addLink: 'Añadir enlace', editLink: 'Editar', removeLink: 'Quitar', back: 'Volver' }],
    ] as const) {
      for (const [key, value] of Object.entries(expected)) {
        assert.equal(locale[key], value);
      }
      for (const key of ['addLinkA11y', 'editLinkA11y', 'removeLinkA11y']) {
        assert.match(locale[key], /\{\{platform\}\}/);
      }
      assert.ok(locale.backToProfileA11y);
      assert.ok(locale.manual.editTitle);
      assert.equal(locale.saveConnections, undefined);
    }
  });
});

describe('Each operation persists its own new value', () => {
  it('add, edit and remove reach the stored document by themselves', () => {
    let doc: any = storedDoc();
    doc = write(doc, 'personal', 'linkedin', 'https://www.linkedin.com/in/new');
    assert.equal(doc.socialLinksPersonal.linkedin, 'https://www.linkedin.com/in/new');
    doc = write(doc, 'personal', 'linkedin', 'https://www.linkedin.com/in/edited');
    assert.equal(doc.socialLinksPersonal.linkedin, 'https://www.linkedin.com/in/edited');
    doc = write(doc, 'personal', 'linkedin', null);
    assert.equal('linkedin' in doc.socialLinksPersonal, false, 'really gone');
  });

  it('removing needs the delete sentinel: omitting a key keeps it in a merge', () => {
    const omitted = firestoreMerge(storedDoc(), {
      socialLinksPersonal: { twitter: 'https://x.com/ana' },
    });
    assert.equal(omitted.socialLinksPersonal.facebook, 'https://www.facebook.com/ana');
    const removed = write(storedDoc(), 'personal', 'facebook', null);
    assert.equal('facebook' in removed.socialLinksPersonal, false);
  });

  it('sends one key of one bag, nothing else', () => {
    assert.deepEqual(
      buildManualSocialLinkWrite('professional', 'website', 'https://a.example/', DELETE),
      { socialLinksProfessional: { website: 'https://a.example/' } },
    );
    assert.deepEqual(buildManualSocialLinkWrite('personal', 'facebook', null, DELETE), {
      socialLinksPersonal: { facebook: DELETE },
    });
  });

  it('saving a known network keeps historical custom links, other links and the other mode', () => {
    const before = storedDoc();
    for (const [field, url] of [
      ['linkedin', 'https://www.linkedin.com/in/new'],
      ['facebook', null],
      ['website', 'https://www.new.example/'],
    ] as const) {
      const after = write(before, 'personal', field, url);
      assert.deepEqual(after.socialLinksPersonal.custom, CUSTOM);
      assert.equal(after.socialLinksPersonal.twitter, before.socialLinksPersonal.twitter);
      assert.equal(after.socialLinksPersonal.snapchat, before.socialLinksPersonal.snapchat);
      assert.deepEqual(after.socialLinksProfessional, before.socialLinksProfessional);
      assert.equal(after.profileSetupCompleted, true, 'lifecycle untouched');
    }
  });

  it('never carries lifecycle or ownership fields', () => {
    const payload = JSON.stringify(
      buildManualSocialLinkWrite('personal', 'facebook', 'https://www.facebook.com/a', DELETE),
    );
    assert.doesNotMatch(payload, /profileSetupCompleted|ownership|youtube|tiktok|instagram/i);
  });
});

describe('CRJ Next and Skip around those writes', () => {
  it('reads historical custom links but its own save leaves them alone', () => {
    const doc = storedDoc();
    const draft = readCrjSocialDraft(doc, 'personal');
    assert.equal(draft.custom.length, 2, 'still readable');
    const patch = buildCrjSocialLinksPersistencePatch(
      'personal',
      draft.values,
      [],
      readExistingSocialLinks(doc, 'personal'),
      { website: '' },
    );
    const after = firestoreMerge(doc, patch);
    assert.deepEqual(after.socialLinksPersonal.custom, CUSTOM, 'even the invalid row');
    assert.deepEqual(after.socialLinksProfessional, doc.socialLinksProfessional);
  });

  it('a removed link stays removed after Next', () => {
    let doc: any = write(storedDoc(), 'personal', 'facebook', null);
    const draft = readCrjSocialDraft(doc, 'personal');
    const patch = buildCrjSocialLinksPersistencePatch(
      'personal',
      draft.values,
      [],
      readExistingSocialLinks(doc, 'personal'),
      { website: '' },
    );
    doc = firestoreMerge(doc, patch);
    assert.equal('facebook' in doc.socialLinksPersonal, false);
  });

  it('the wizard copy of the document matches the merge', () => {
    const doc = storedDoc();
    const withLink = mergeManualLinkIntoShell(doc, 'personal', 'linkedin', 'https://www.linkedin.com/in/n');
    assert.equal(withLink.socialLinksPersonal.linkedin, 'https://www.linkedin.com/in/n');
    assert.deepEqual(withLink.socialLinksPersonal.custom, CUSTOM);
    const without = mergeManualLinkIntoShell(withLink, 'personal', 'facebook', null);
    assert.equal('facebook' in without.socialLinksPersonal, false);
    assert.deepEqual(without.socialLinksProfessional, doc.socialLinksProfessional);

    const merged = mergeSocialLinksIntoShell(doc, 'personal', {
      socialLinksPersonal: { linkedin: 'https://www.linkedin.com/in/n' },
      profileSetupCompleted: false,
    });
    assert.deepEqual(merged.socialLinksPersonal.custom, CUSTOM);
  });

  it('Next and Skip stay, and wait for a link write in progress', () => {
    const screen = read('screens/ProfileCompletionScreen.tsx');
    assert.match(screen, /socialMedia\.next/);
    assert.match(screen, /socialMedia\.skip/);
    assert.match(screen, /submitting \|\| socialManualBusyRef\.current/);
    assert.match(screen, /disabled=\{submitting \|\| socialManualBusy\}/);
    assert.match(screen, /if \(submitting \|\| socialManualBusy\) return;/);
    assert.doesNotMatch(screen, /onImmediatePersist/);
  });
});

describe('Results for a closed screen or another session', () => {
  const save = (over: Partial<Parameters<typeof saveManualSocialLink>[0]> = {}) => {
    const calls: Array<[string, string | null]> = [];
    return {
      calls,
      result: saveManualSocialLink({
        field: 'facebook',
        raw: 'https://www.facebook.com/ana',
        isCurrent: () => true,
        persist: async (field, url) => {
          calls.push([field, url]);
        },
        ...over,
      }),
    };
  };

  it('saves the normalized new value', async () => {
    const { calls, result } = save({ raw: 'facebook.com/ana' });
    const outcome = await result;
    assert.equal(outcome.status, 'saved');
    assert.equal(calls.length, 1);
    assert.match(calls[0][1] ?? '', /^https:\/\/.*facebook\.com\/ana/);
  });

  it('an invalid value sends nothing', async () => {
    const { calls, result } = save({ raw: 'not a link at all' });
    assert.equal((await result).status, 'invalid');
    assert.equal(calls.length, 0);
  });

  it('a website goes through URL validation', async () => {
    const { calls, result } = save({ field: 'website', raw: 'https://www.ana.example' });
    assert.equal((await result).status, 'saved');
    assert.equal(calls[0][0], 'website');
  });

  it('remove sends null without validating', async () => {
    const { calls, result } = save({ raw: null });
    assert.deepEqual(await result, { status: 'saved', url: null });
    assert.deepEqual(calls, [['facebook', null]]);
  });

  it('a failure is reported, and the caller keeps its state', async () => {
    const { result } = save({
      persist: async () => {
        throw new Error('denied');
      },
    });
    assert.equal((await result).status, 'failed');
  });

  it('after leaving, neither success nor failure reaches the screen', async () => {
    let current = true;
    const pending = save({
      isCurrent: () => current,
      persist: async () => {
        current = false;
      },
    });
    assert.equal((await pending.result).status, 'stale');
    let open = true;
    const failing = save({
      isCurrent: () => open,
      persist: async () => {
        open = false;
        throw new Error('denied');
      },
    });
    assert.equal((await failing.result).status, 'stale');
  });

  it('the hook binds results to uid, mode and mount', () => {
    const hook = read('components/profile/useManualSocialLinks.ts');
    assert.match(hook, /shouldApplySocialEditorResult/);
    assert.match(hook, /firebaseAuth\.currentUser\?\.uid/);
    assert.match(hook, /generationRef\.current \+= 1/);
    assert.match(hook, /if \(result\.status === 'stale'\) return;/);
  });
});

describe('Editor draft', () => {
  it('follows each result, in both modes', () => {
    for (const mode of ['personal', 'professional'] as const) {
      const draft = readPostCrjSocialEditorDraft(storedDoc(), mode);
      const added = applyManualLinkResult(draft, 'website', 'https://w.example/');
      assert.equal(added.website, 'https://w.example/');
      assert.equal(added.connected.website, true);
      const removed = applyManualLinkResult(added, 'website', null);
      assert.equal(removed.website, '');
      assert.equal(removed.connected.website, false);
      assert.deepEqual(removed.custom, draft.custom);
    }
  });
});

describe('Screens', () => {
  const step = read('components/registration/OnboardingSocialMediaStep.tsx');
  const editor = read('screens/SocialMediaScreen.tsx');

  it('CRJ has individual cards and no Other network', () => {
    assert.match(step, /ManualSocialLinkCard/);
    assert.match(step, /SocialPlatformGlyph/);
    assert.doesNotMatch(step, /socialMedia\.other|addNetwork|TextInput|onChangeCustom|custom\.map/);
    assert.match(step, /countConnectedSocials\(urlValuesForCount, \[\], website\)/);
    const onboarding = read('i18n/resources/onboarding.ts');
    assert.doesNotMatch(onboarding, /Other network|Otra red/);
  });

  it('both screens use the same card, modal and hook', () => {
    for (const source of [step, editor]) {
      assert.match(source, /ManualSocialLinkCard/);
      assert.match(source, /useManualSocialLinks/);
      assert.match(source, /<ManualSocialLinkModal \{\.\.\.manualLinks\.modalProps\} \/>/);
    }
  });

  it('the editor bottom button only navigates and is always available', () => {
    const start = editor.indexOf('styles.bottomBar,');
    const bar = editor.slice(start, editor.indexOf('</Pressable>', start));
    assert.match(bar, /onPress=\{handleBack\}/);
    assert.match(bar, /profile\.social\.back/);
    assert.match(bar, /profile\.social\.backToProfileA11y/);
    assert.doesNotMatch(bar, /disabled/);
    const handler = editor.slice(
      editor.indexOf('const handleBack'),
      editor.indexOf('useEffect(', editor.indexOf('const handleBack')),
    );
    assert.match(handler, /navigation\.goBack\(\)/);
    assert.doesNotMatch(handler, /persist|save|update|connect/i);
    assert.doesNotMatch(editor, /handleSave|saveConnections|isDirty|confirmDiscard|updateUserProfilePartial/);
    assert.doesNotMatch(editor, /isDirty \?|Platform\.OS !== 'android' \|\|/);
  });

  it('ownership networks keep their own cards in both screens', () => {
    for (const source of [step, editor]) {
      for (const card of ['Youtube', 'Tiktok', 'Instagram', 'X']) {
        assert.match(source, new RegExp(`<${card}OwnershipCard`));
      }
    }
  });
});

/**
 * Behaviour tests for CRJ ↔ Edit Profile social parity (iOS 2.0.9 beta):
 * shared manual-link card states/actions, card order, immediate persistence
 * of add/edit/remove (no Save/Back needed) and EN/ES copy.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import es from '../i18n/locales/es';
import enProfile from '../i18n/resources/profile';
import { CRJ_OWNED_SOCIAL_PLATFORM_IDS } from '../social/onboardingSocialCatalog';
import { buildPostCrjSocialLinksPersistencePatch } from '../social/onboardingSocialPersistence';
import {
  MANUAL_SOCIAL_LINK_ORDER,
  manualSocialLinkCardState,
} from '../social/manualSocialLinkCard';
import {
  applyManualLinkRemove,
  applyManualLinkSave,
  buildValuesForPostCrjSocialSave,
  isPostCrjSocialEditorDirty,
  readPostCrjSocialEditorDraft,
} from '../social/postCrjSocialEditor';

function lookup(tree: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>(
    (node, part) =>
      node && typeof node === 'object'
        ? (node as Record<string, unknown>)[part]
        : undefined,
    tree,
  );
}

describe('Manual link card state (CRJ and editor)', () => {
  it('empty or blank URL: No link saved + Connect, no Disconnect', () => {
    for (const url of ['', '   ', null, undefined]) {
      const s = manualSocialLinkCardState(url);
      assert.equal(s.saved, false);
      assert.equal(s.statusKey, 'profile.social.noLinkSaved');
      assert.equal(s.primary.labelKey, 'profile.social.connect');
      assert.equal(s.primary.a11yKey, 'profile.social.connectA11y');
      assert.equal(s.showRemove, false);
    }
  });

  it('saved URL: Link saved + Edit + Disconnect (never a verification state)', () => {
    const s = manualSocialLinkCardState('https://www.linkedin.com/in/someone');
    assert.equal(s.saved, true);
    assert.equal(s.statusKey, 'profile.social.linkSaved');
    assert.equal(s.primary.labelKey, 'profile.social.editLink');
    assert.equal(s.showRemove, true);
    assert.doesNotMatch(JSON.stringify(s), /connected|verified/i);
  });

  it('order is YouTube → TikTok → Instagram → X → Facebook → LinkedIn → Website', () => {
    assert.deepEqual(
      [...CRJ_OWNED_SOCIAL_PLATFORM_IDS, ...MANUAL_SOCIAL_LINK_ORDER],
      ['youtube', 'tiktok', 'instagram', 'x', 'facebook', 'linkedin', 'website'],
    );
  });
});

describe('Editor manual links persist on each operation (no Save/Back)', () => {
  const base = readPostCrjSocialEditorDraft(
    {
      socialLinksPersonal: {
        facebook: 'https://www.facebook.com/old',
        custom: [{ name: 'Blog', url: 'https://blog.example.com/' }],
      },
    },
    'personal',
  );

  const patchFor = (draft: typeof base) =>
    buildPostCrjSocialLinksPersistencePatch(
      'personal',
      buildValuesForPostCrjSocialSave(draft),
      draft.custom,
      { website: draft.connected.website ? draft.website : '' },
    ).socialLinksPersonal as Record<string, unknown>;

  it('add, edit and remove each yield a complete patch for that one write', () => {
    const added = applyManualLinkSave(base, 'linkedin', 'https://www.linkedin.com/in/me');
    assert.equal(patchFor(added).linkedin, 'https://www.linkedin.com/in/me');
    assert.equal(patchFor(added).facebook, 'https://www.facebook.com/old');

    const edited = applyManualLinkSave(added, 'facebook', 'https://www.facebook.com/new');
    assert.equal(patchFor(edited).facebook, 'https://www.facebook.com/new');

    const web = applyManualLinkSave(edited, 'website', 'https://nearsy.app/');
    assert.equal(patchFor(web).website, 'https://nearsy.app/');

    const removed = applyManualLinkRemove(web, 'facebook');
    assert.ok(!patchFor(removed).facebook);
    assert.equal(patchFor(removed).linkedin, 'https://www.linkedin.com/in/me');

    const webRemoved = applyManualLinkRemove(removed, 'website');
    assert.ok(!patchFor(webRemoved).website);
  });

  it('historical "Other network" links are preserved by every write', () => {
    const next = applyManualLinkRemove(
      applyManualLinkSave(base, 'website', 'https://nearsy.app/'),
      'facebook',
    );
    assert.deepEqual(patchFor(next).custom, [
      { name: 'Blog', url: 'https://blog.example.com/' },
    ]);
  });

  it('after a successful write the snapshot equals the draft: Back has nothing to save', () => {
    const next = applyManualLinkSave(base, 'linkedin', 'https://www.linkedin.com/in/me');
    // persistDraftBag sets snapshotRef = draft = next on success.
    assert.equal(isPostCrjSocialEditorDirty(next, next), false);
    assert.equal(isPostCrjSocialEditorDirty(base, next), true);
  });
});

describe('Standard Connect/Disconnect button copy', () => {
  const VERIFIED = ['youtube', 'tiktok', 'instagram', 'x'] as const;
  const NAMES = { youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram', x: 'X' };

  it('verified networks: visible label has no network name, a11y keeps it', () => {
    for (const id of VERIFIED) {
      assert.equal(lookup(enProfile, `social.${id}.connect`), 'Connect');
      assert.equal(lookup(enProfile, `social.${id}.disconnect`), 'Disconnect');
      assert.equal(lookup(es, `profile.social.${id}.connect`), 'Conectar');
      assert.equal(lookup(es, `profile.social.${id}.disconnect`), 'Desconectar');
      for (const key of ['connectA11y', 'disconnectA11y']) {
        assert.match(String(lookup(enProfile, `social.${id}.${key}`)), new RegExp(NAMES[id]));
        assert.match(String(lookup(es, `profile.social.${id}.${key}`)), new RegExp(NAMES[id]));
      }
    }
  });

  it('manual cards: Connect / Disconnect, Edit is kept, a11y names the network', () => {
    assert.equal(lookup(enProfile, 'social.connect'), 'Connect');
    assert.equal(lookup(enProfile, 'social.disconnect'), 'Disconnect');
    assert.equal(lookup(enProfile, 'social.editLink'), 'Edit');
    assert.equal(lookup(es, 'profile.social.connect'), 'Conectar');
    assert.equal(lookup(es, 'profile.social.disconnect'), 'Desconectar');
    assert.equal(lookup(es, 'profile.social.editLink'), 'Editar');
    assert.equal(lookup(enProfile, 'social.connectA11y'), 'Connect {{platform}}');
    assert.equal(lookup(enProfile, 'social.disconnectA11y'), 'Disconnect {{platform}}');
    assert.equal(lookup(es, 'profile.social.connectA11y'), 'Conectar {{platform}}');
    assert.equal(lookup(es, 'profile.social.disconnectA11y'), 'Desconectar {{platform}}');
  });

  it('out-of-scope copy is unchanged: status, transient, retry, modal titles', () => {
    assert.equal(lookup(enProfile, 'social.linkSaved'), 'Link saved');
    assert.equal(lookup(es, 'profile.social.linkSaved'), 'Enlace guardado');
    for (const id of VERIFIED) {
      assert.equal(lookup(enProfile, `social.${id}.connected`), 'Connected');
      assert.equal(lookup(enProfile, `social.${id}.connecting`), 'Connecting…');
      assert.equal(lookup(enProfile, `social.${id}.retry`), 'Try again');
      assert.equal(lookup(es, `profile.social.${id}.connecting`), 'Conectando…');
      assert.equal(lookup(es, `profile.social.${id}.retry`), 'Reintentar');
      assert.equal(lookup(enProfile, `social.connectModal.${id}.title`), `Connect ${NAMES[id]}`);
      assert.equal(lookup(es, `profile.social.connectModal.${id}.title`), `Conectar ${NAMES[id]}`);
    }
    assert.equal(lookup(enProfile, 'social.saveLink'), 'Save link');
    assert.equal(lookup(es, 'profile.social.saveLink'), 'Guardar enlace');
  });
});

describe('EN/ES copy for cards and Back', () => {
  const keys = [
    'linkSaved',
    'noLinkSaved',
    'connect',
    'editLink',
    'disconnect',
    'connectA11y',
    'editLinkA11y',
    'disconnectA11y',
    'back',
    'backToProfileA11y',
  ];

  it('defines every key in both languages', () => {
    for (const key of keys) {
      assert.equal(typeof lookup(enProfile, `social.${key}`), 'string', `en ${key}`);
      assert.equal(typeof lookup(es, `profile.social.${key}`), 'string', `es ${key}`);
    }
  });

  it('Back is "Back" / "Volver" and a11y names the platform', () => {
    assert.equal(lookup(enProfile, 'social.back'), 'Back');
    assert.equal(lookup(es, 'profile.social.back'), 'Volver');
    for (const key of ['connectA11y', 'editLinkA11y', 'disconnectA11y']) {
      assert.match(String(lookup(enProfile, `social.${key}`)), /\{\{platform\}\}/);
      assert.match(String(lookup(es, `profile.social.${key}`)), /\{\{platform\}\}/);
    }
  });
});

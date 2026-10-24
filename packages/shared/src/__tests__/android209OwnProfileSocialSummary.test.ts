import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ANDROID_OWNERSHIP_CARD_IDS,
  applyOwnershipVerifiedChange,
  countConfiguredSocialLinksInBag,
  extractOwnProfileSocialSummaryCounts,
  isPostCrjSocialEditorDirty,
  readPostCrjSocialEditorDraft,
  shouldReportOwnershipConnectedChange,
  type AndroidOwnershipCardId,
} from '../social/postCrjSocialEditor.ts';
import {
  bagOnlyOwnershipPresenceByMode,
  buildOwnProfileSocialSummary,
  emptyOwnershipPresenceByMode,
  ownProfileSocialSummarySubtitle,
  overlayOptionsFromPresence,
  presenceFromOwnershipGetResult,
  resolveOwnProfileSocialSummaryRequest,
  sameSocialSummaryPresentation,
  shouldApplyOwnProfileSocialSummary,
  type OwnershipPresenceByMode,
  type OwnershipPresenceStatus,
} from '../social/ownProfileSocialSummary.ts';
import { profileTranslations } from '../i18n/resources/profile.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), 'utf8');
}

function verifiedPresence(
  personal: Partial<Record<AndroidOwnershipCardId, boolean>> = {},
  professional: Partial<Record<AndroidOwnershipCardId, boolean>> = {},
): OwnershipPresenceByMode {
  const row = (
    flags: Partial<Record<AndroidOwnershipCardId, boolean>>,
  ): Record<AndroidOwnershipCardId, OwnershipPresenceStatus> => ({
    youtube: flags.youtube ? 'verified' : 'not_linked',
    tiktok: flags.tiktok ? 'verified' : 'not_linked',
    instagram: flags.instagram ? 'verified' : 'not_linked',
    x: flags.x ? 'verified' : 'not_linked',
  });
  return { personal: row(personal), professional: row(professional) };
}

describe('NEARSY-209 Own Profile Android social summary overlay', () => {
  it('counts four verified ownership networks with an empty bag', () => {
    const built = buildOwnProfileSocialSummary({
      doc: { socialLinksPersonal: {}, socialLinksProfessional: {} },
      presence: verifiedPresence(
        { youtube: true, tiktok: true, instagram: true, x: true },
        {},
      ),
      mode: 'personal',
    });
    assert.equal(built.personal, 4);
    assert.equal(built.professional, 0);
    assert.deepEqual(built.presentation, { kind: 'ready', count: 4 });
  });

  it('mixes legacy bag URLs with ownership without double-counting', () => {
    const doc = {
      socialLinksPersonal: {
        youtube: 'https://www.youtube.com/@legacy',
        tiktok: 'https://www.tiktok.com/@legacy',
        instagram: 'https://www.instagram.com/legacy',
        twitter: 'https://x.com/legacy',
        linkedin: 'https://www.linkedin.com/in/legacy',
        website: 'https://example.com/',
      },
      socialLinksProfessional: {
        twitter: 'https://x.com/pro',
      },
    };
    const bagOnly = extractOwnProfileSocialSummaryCounts(doc);
    assert.equal(bagOnly.personal, 6);
    assert.equal(bagOnly.professional, 1);

    const mixed = buildOwnProfileSocialSummary({
      doc,
      presence: verifiedPresence(
        { youtube: true, tiktok: true, instagram: true, x: true },
        { x: true },
      ),
      mode: 'personal',
    });
    assert.equal(mixed.personal, 6);
    assert.equal(mixed.professional, 1);
    assert.deepEqual(mixed.presentation, { kind: 'ready', count: 6 });

    const youtubeOnlyBag = countConfiguredSocialLinksInBag(
      { youtube: 'https://www.youtube.com/@legacy' },
      { youtubeConnected: true },
    );
    assert.equal(youtubeOnlyBag, 1);
  });

  it('refresh without Save still counts Identity-only connections', () => {
    const emptyBag = { socialLinksPersonal: {}, socialLinksProfessional: {} };
    const before = buildOwnProfileSocialSummary({
      doc: emptyBag,
      presence: verifiedPresence({}, {}),
      mode: 'personal',
    });
    assert.deepEqual(before.presentation, { kind: 'ready', count: 0 });

    const afterConnectNoSave = buildOwnProfileSocialSummary({
      doc: emptyBag,
      presence: verifiedPresence({ instagram: true, youtube: true }, {}),
      mode: 'personal',
    });
    assert.equal(afterConnectNoSave.personal, 2);
    assert.deepEqual(afterConnectNoSave.presentation, {
      kind: 'ready',
      count: 2,
    });
  });

  it('unlink and mode independence do not share verified state', () => {
    const doc = { socialLinksPersonal: {}, socialLinksProfessional: {} };
    const linked = verifiedPresence(
      { youtube: true, x: true },
      { tiktok: true },
    );
    const personal = buildOwnProfileSocialSummary({
      doc,
      presence: linked,
      mode: 'personal',
    });
    const professional = buildOwnProfileSocialSummary({
      doc,
      presence: linked,
      mode: 'professional',
    });
    assert.equal(personal.personal, 2);
    assert.equal(personal.professional, 1);
    assert.equal(professional.presentation.kind, 'ready');
    assert.equal(
      professional.presentation.kind === 'ready'
        ? professional.presentation.count
        : -1,
      1,
    );

    const afterUnlink = buildOwnProfileSocialSummary({
      doc,
      presence: verifiedPresence({ x: true }, { tiktok: true }),
      mode: 'personal',
    });
    assert.equal(afterUnlink.personal, 1);
    assert.equal(afterUnlink.professional, 1);
  });

  it('does not present empty as not_linked while loading or after Get errors', () => {
    const emptyBag = { socialLinksPersonal: {}, socialLinksProfessional: {} };
    const loading = buildOwnProfileSocialSummary({
      doc: emptyBag,
      presence: emptyOwnershipPresenceByMode(),
      mode: 'personal',
    });
    assert.deepEqual(loading.presentation, { kind: 'loading' });
    assert.equal(
      ownProfileSocialSummarySubtitle(loading.presentation, {
        configured: (count) => `${count} configured`,
        empty: 'Not configured yet',
        checking: 'Checking connections…',
        checkError: 'Could not check connections',
      }),
      'Checking connections…',
    );

    const errored = emptyOwnershipPresenceByMode();
    for (const id of ANDROID_OWNERSHIP_CARD_IDS) {
      errored.personal[id] = 'error';
      errored.professional[id] = 'error';
    }
    const failed = buildOwnProfileSocialSummary({
      doc: emptyBag,
      presence: errored,
      mode: 'personal',
    });
    assert.deepEqual(failed.presentation, { kind: 'error' });
    assert.equal(
      ownProfileSocialSummarySubtitle(failed.presentation, {
        configured: (count) => `${count} configured`,
        empty: 'Not configured yet',
        checking: 'Checking connections…',
        checkError: 'Could not check connections',
      }),
      'Could not check connections',
    );

    const verifiedDespiteError = emptyOwnershipPresenceByMode();
    verifiedDespiteError.personal.youtube = 'verified';
    verifiedDespiteError.personal.tiktok = 'error';
    verifiedDespiteError.personal.instagram = 'error';
    verifiedDespiteError.personal.x = 'not_linked';
    const partial = buildOwnProfileSocialSummary({
      doc: emptyBag,
      presence: verifiedDespiteError,
      mode: 'personal',
    });
    assert.deepEqual(partial.presentation, { kind: 'ready', count: 1 });

    assert.equal(presenceFromOwnershipGetResult('verified', false), 'verified');
    assert.equal(
      presenceFromOwnershipGetResult('not_linked', false),
      'not_linked',
    );
    assert.equal(presenceFromOwnershipGetResult('pending', false), 'not_linked');
    assert.equal(presenceFromOwnershipGetResult(undefined, true), 'error');
    assert.deepEqual(
      overlayOptionsFromPresence(bagOnlyOwnershipPresenceByMode()),
      {
        personalYoutubeConnected: false,
        professionalYoutubeConnected: false,
        personalTiktokConnected: false,
        professionalTiktokConnected: false,
        personalInstagramConnected: false,
        professionalInstagramConnected: false,
        personalXConnected: false,
        professionalXConnected: false,
      },
    );
  });

  it('discards late overlay responses after UID or generation changes', async () => {
    assert.equal(
      shouldApplyOwnProfileSocialSummary({
        requestGen: 1,
        currentGen: 2,
        requestUid: 'uid-a',
        currentUid: 'uid-a',
      }),
      false,
    );
    assert.equal(
      shouldApplyOwnProfileSocialSummary({
        requestGen: 2,
        currentGen: 2,
        requestUid: 'uid-a',
        currentUid: 'uid-b',
      }),
      false,
    );
    assert.equal(
      shouldApplyOwnProfileSocialSummary({
        requestGen: 2,
        currentGen: 2,
        requestUid: 'uid-a',
        currentUid: null,
      }),
      false,
    );
    assert.equal(
      shouldApplyOwnProfileSocialSummary({
        requestGen: 2,
        currentGen: 2,
        requestUid: 'uid-a',
        currentUid: 'uid-a',
      }),
      true,
    );

    let current = true;
    const late = resolveOwnProfileSocialSummaryRequest({
      platform: 'android',
      doc: { socialLinksPersonal: {}, socialLinksProfessional: {} },
      mode: 'personal',
      isCurrent: () => current,
      loadOverlay: async () => {
        current = false;
        return verifiedPresence(
          { youtube: true, tiktok: true, instagram: true, x: true },
          {},
        );
      },
    });
    assert.equal(await late, null);
  });

  it('stabilizes ownership callbacks so transient loading cannot loop setState', () => {
    let prev: Partial<Record<AndroidOwnershipCardId, boolean>> = {};
    let writes = 0;
    const notify = (
      id: AndroidOwnershipCardId,
      connected: boolean,
      phase: string,
    ) => {
      if (!shouldReportOwnershipConnectedChange(phase)) return;
      const next = applyOwnershipVerifiedChange(prev, id, connected);
      if (next !== prev) {
        writes += 1;
        prev = next;
      }
    };

    for (let i = 0; i < 20; i += 1) {
      for (const id of ANDROID_OWNERSHIP_CARD_IDS) {
        notify(id, false, 'loading');
        notify(id, false, 'connecting');
        notify(id, false, 'disconnecting');
      }
    }
    assert.equal(writes, 0);
    assert.deepEqual(prev, {});

    notify('youtube', true, 'idle');
    notify('youtube', true, 'idle');
    notify('tiktok', false, 'idle');
    notify('tiktok', false, 'idle');
    assert.equal(writes, 2);
    assert.equal(prev.youtube, true);
    assert.equal(prev.tiktok, false);

    assert.equal(shouldReportOwnershipConnectedChange('pending'), true);
    assert.equal(shouldReportOwnershipConnectedChange('idle'), true);
  });

  it('ownership changes do not dirty the manual bag and Save never copies canonicalUrl', () => {
    const snapshot = readPostCrjSocialEditorDraft(null, 'personal');
    const draft = readPostCrjSocialEditorDraft(null, 'personal');
    assert.equal(isPostCrjSocialEditorDirty(snapshot, draft), false);
    draft.values.linkedin = 'https://www.linkedin.com/in/diego';
    draft.connected.linkedin = true;
    assert.equal(isPostCrjSocialEditorDirty(snapshot, draft), true);

    const editor = readSrc('social/postCrjSocialEditor.ts');
    const fingerprint = editor.slice(
      editor.indexOf('function draftFingerprint'),
      editor.indexOf('export function arePostCrjSocialDraftsEqual'),
    );
    assert.match(fingerprint, /connected: draft\.connected/);
    assert.doesNotMatch(fingerprint, /ownershipVerified/);

    const screen = readSrc('screens/SocialMediaScreen.tsx');
    assert.doesNotMatch(screen, /canonicalUrl/);
    assert.match(screen, /applyOwnershipVerifiedChange/);
    assert.match(screen, /onYoutubeConnectedChange/);
    assert.match(screen, /onTiktokConnectedChange/);
    assert.match(screen, /onInstagramConnectedChange/);
    assert.match(screen, /onXConnectedChange/);
    assert.match(screen, /preserveLegacy\('youtube'\)/);
    assert.match(screen, /preserveLegacy\('tiktok'\)/);
    assert.match(screen, /preserveLegacy\('instagram'\)/);
    assert.match(screen, /preserveLegacy\('x'\)/);
    assert.doesNotMatch(screen, /Alert\.alert\(\s*t\('profile\.social\.saved'/);

    for (const card of [
      'components/profile/YoutubeOwnershipCard.tsx',
      'components/profile/TiktokOwnershipCard.tsx',
      'components/profile/InstagramOwnershipCard.tsx',
      'components/profile/XOwnershipCard.tsx',
    ]) {
      const src = readSrc(card);
      assert.doesNotMatch(src, /updateUserProfilePartial/);
      assert.match(src, /shouldReportOwnershipConnectedChange/);
    }
  });

  it('Own Profile reloads the overlay on focus and keeps EN/ES checking copy', () => {
    const screen = readSrc('screens/CompleteProfileScreen.tsx');
    assert.match(screen, /useOwnProfileSocialSummary/);
    assert.match(screen, /loadSocialSummary/);
    assert.match(screen, /useFocusEffect/);
    assert.match(screen, /refreshProfileSummaries/);
    assert.match(screen, /socialSubtitle/);
    assert.doesNotMatch(screen, /canonicalUrl/);

    const load = readSrc('social/ownProfileSocialSummaryLoad.android.ts');
    assert.match(load, /getYoutubeOwnershipState/);
    assert.match(load, /getTiktokOwnershipState/);
    assert.match(load, /getInstagramOwnershipState/);
    assert.match(load, /getXOwnershipState/);

    assert.equal(
      profileTranslations.en.quickActions.checking,
      'Checking connections…',
    );
    assert.equal(
      profileTranslations.es.quickActions.checking,
      'Comprobando conexiones…',
    );
    assert.equal(
      profileTranslations.en.quickActions.checkError,
      'Could not check connections',
    );
    assert.equal(
      profileTranslations.es.quickActions.checkError,
      'No se pudieron comprobar las conexiones',
    );
    assert.equal(
      profileTranslations.en.quickActions.empty,
      'Not configured yet',
    );
  });

  it('loads Android overlay via require without a .ts suffix so Metro picks .android.ts', () => {
    const hook = readSrc('social/useOwnProfileSocialSummary.ts');
    assert.match(
      hook,
      /return require\('\.\/ownProfileSocialSummaryLoad'\) as OverlayModule/,
    );
    assert.doesNotMatch(
      hook,
      /^import .+ from '\.\/ownProfileSocialSummaryLoad\.ts'/m,
    );
    assert.match(hook, /mode\?: ProfileMode/);
    const stub = readSrc('social/ownProfileSocialSummaryLoad.ts');
    const android = readSrc('social/ownProfileSocialSummaryLoad.android.ts');
    assert.match(stub, /OWN_PROFILE_SOCIAL_OVERLAY_SOURCE = 'stub-bag-only'/);
    assert.match(
      android,
      /OWN_PROFILE_SOCIAL_OVERLAY_SOURCE = 'android-identity-gets'/,
    );
    const screen = readSrc('screens/CompleteProfileScreen.tsx');
    assert.match(screen, /loadSocialSummary\(doc, currentMode\)/);
  });

  it('ownership card mount effects do not re-run when refreshForMode identity changes', () => {
    for (const card of [
      'components/profile/YoutubeOwnershipCard.tsx',
      'components/profile/TiktokOwnershipCard.tsx',
      'components/profile/InstagramOwnershipCard.tsx',
      'components/profile/XOwnershipCard.tsx',
    ]) {
      const src = readSrc(card);
      assert.match(src, /useMemo\(\(\) => load\w+Api\(\), \[\]\)/);
      assert.match(src, /refreshForModeRef\.current = refreshForMode/);
      assert.doesNotMatch(src, /}, \[mode, api, refreshForMode/);
      assert.doesNotMatch(src, /}, \[mode, screenFocused, refreshForMode\]/);
    }
    const loading = { kind: 'loading' as const };
    const ready0 = { kind: 'ready' as const, count: 0 };
    const ready4 = { kind: 'ready' as const, count: 4 };
    assert.equal(sameSocialSummaryPresentation(loading, { kind: 'loading' }), true);
    assert.equal(sameSocialSummaryPresentation(ready0, { kind: 'ready', count: 0 }), true);
    assert.equal(sameSocialSummaryPresentation(ready0, ready4), false);
  });
});

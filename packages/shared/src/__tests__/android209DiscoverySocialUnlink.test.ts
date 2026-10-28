/**
 * After Instagram Unlink: private bag URL is not published; Discovery
 * icons come only from getDiscoveryProfile.socialLinks; Android refetches
 * detail on focus without treating the bag as verified.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { profileTranslations } from '../i18n/resources/profile.ts';
import { parseDiscoverySocialLinks } from '../visibility/discoverySocialLinks.ts';
import { DISCOVERY_PROFILE_REFETCH_ON_FOCUS as ANDROID_REFETCH } from '../visibility/discoveryProfileReload.android.ts';
import { DISCOVERY_PROFILE_REFETCH_ON_FOCUS as DEFAULT_REFETCH } from '../visibility/discoveryProfileReload.ts';
import {
  decideDiscoveryProfileApply,
  discoveryProfileLoadMode,
  discoveryPublicLinksOmitInstagram,
} from '../visibility/discoveryProfileReloadCore.ts';
import { readPublicSocialLinks } from '../social/socialLinkUrl.ts';

const here = dirname(fileURLToPath(import.meta.url));

function read(relativeFromSharedSrc: string): string {
  return readFileSync(join(here, '..', relativeFromSharedSrc), 'utf8');
}

const LEGACY_BAG = {
  instagram: 'https://www.instagram.com/ana.qa',
  linkedin: 'https://www.linkedin.com/in/ana',
};

const WITH_INSTAGRAM = {
  uid: 'ana',
  socialLinks: [
    { platform: 'instagram', url: 'https://www.instagram.com/ana.qa' },
    { platform: 'linkedin', url: 'https://www.linkedin.com/in/ana' },
  ],
};

const AFTER_UNLINK = {
  uid: 'ana',
  socialLinks: [
    { platform: 'linkedin', url: 'https://www.linkedin.com/in/ana' },
  ],
};

describe('NEARSY-209 Instagram Unlink vs Discovery public DTO', () => {
  it('legacy hint is the private bag URL while ownership is disconnected', () => {
    assert.equal(
      profileTranslations.es.social.instagramOwnership.legacyPrivateHint,
      'Hay un enlace guardado en privado (no publicado).',
    );
    assert.equal(
      profileTranslations.en.social.instagramOwnership.legacyPrivateHint,
      'A saved link is kept privately (not published).',
    );
    const card = read('components/profile/InstagramOwnershipCard.tsx');
    assert.match(
      card,
      /const hasLegacy = !!\(legacyUrl && legacyUrl\.trim\(\)\) && !view\.connected/,
    );
    assert.match(card, /profile\.social\.instagramOwnership\.legacyPrivateHint/);
    const screen = read('screens/SocialMediaScreen.tsx');
    assert.match(screen, /legacyUrl=\{draft\.values\.instagram\}/);
    assert.match(screen, /preserveLegacy\('instagram'\)/);
  });

  it('private bag URLs are not Discovery public links', () => {
    const fromBag = readPublicSocialLinks(LEGACY_BAG);
    assert.equal(
      fromBag.some((link) => link.platform === 'instagram'),
      true,
    );
    assert.deepEqual(parseDiscoverySocialLinks(LEGACY_BAG), []);
    assert.deepEqual(
      parseDiscoverySocialLinks({ instagram: LEGACY_BAG.instagram }),
      [],
    );
    assert.deepEqual(
      parseDiscoverySocialLinks([
        { platform: 'instagram', url: LEGACY_BAG.instagram },
      ]),
      [{ platform: 'instagram', url: 'https://www.instagram.com/ana.qa' }],
    );
  });

  it('Discovery detail draws icons only from the public DTO and opens the URL', () => {
    const screen = read('screens/DiscoveryProfileScreen.tsx');
    assert.match(screen, /const publicSocialLinks = data\.socialLinks/);
    assert.match(screen, /<DiscoverySocialMediaRow links=\{publicSocialLinks\} \/>/);
    assert.doesNotMatch(screen, /readPublicSocialLinks/);
    assert.doesNotMatch(screen, /socialLinksPersonal|socialLinksProfessional/);
    const row = read('components/profileExploration/DiscoverySocialMediaRow.tsx');
    assert.match(row, /openLink\(link\.platform, link\.url\)/);
    assert.match(row, /accessibilityRole="link"/);
    const nearby = read('screens/NearbySearchScreen.tsx');
    assert.doesNotMatch(nearby, /socialLinks/);
    assert.doesNotMatch(nearby, /DiscoverySocialMediaRow/);
  });

  it('Android refetches on focus without duplicating the initial load', () => {
    assert.equal(ANDROID_REFETCH, true);
    assert.equal(DEFAULT_REFETCH, false);
    assert.equal(
      discoveryProfileLoadMode({
        refetchOnFocus: false,
        hasData: false,
        trigger: 'mount',
      }),
      'blocking',
    );
    assert.equal(
      discoveryProfileLoadMode({
        refetchOnFocus: true,
        hasData: false,
        trigger: 'mount',
      }),
      'skip',
    );
    assert.equal(
      discoveryProfileLoadMode({
        refetchOnFocus: false,
        hasData: true,
        trigger: 'focus',
      }),
      'skip',
    );
    assert.equal(
      discoveryProfileLoadMode({
        refetchOnFocus: true,
        hasData: false,
        trigger: 'focus',
      }),
      'blocking',
    );
    assert.equal(
      discoveryProfileLoadMode({
        refetchOnFocus: true,
        hasData: true,
        trigger: 'focus',
      }),
      'silent',
    );
    const screen = read('screens/DiscoveryProfileScreen.tsx');
    assert.match(screen, /useFocusEffect/);
    assert.match(screen, /DISCOVERY_PROFILE_REFETCH_ON_FOCUS/);
    assert.match(screen, /discoveryProfileLoadMode/);
    assert.match(screen, /decideDiscoveryProfileApply/);
    assert.match(screen, /silent: mode === 'silent'/);
    assert.match(screen, /from '\.\.\/visibility\/discoveryProfileReload'/);
    assert.doesNotMatch(
      screen,
      /from '\.\.\/visibility\/discoveryProfileReload\.android/,
    );
  });

  it('discards late responses when the profile key changes or the screen unmounts', () => {
    const late = decideDiscoveryProfileApply({
      requestGen: 1,
      currentGen: 2,
      requestKey: 'ana',
      currentKey: 'ana',
      unmounted: false,
      silent: true,
      previous: WITH_INSTAGRAM,
      result: { ok: true, data: AFTER_UNLINK },
    });
    assert.equal(late.action, 'discard');

    const switched = decideDiscoveryProfileApply({
      requestGen: 4,
      currentGen: 4,
      requestKey: 'ana',
      currentKey: 'diego',
      unmounted: false,
      silent: false,
      previous: WITH_INSTAGRAM,
      result: { ok: true, data: AFTER_UNLINK },
    });
    assert.equal(switched.action, 'discard');

    const unmounted = decideDiscoveryProfileApply({
      requestGen: 5,
      currentGen: 5,
      requestKey: 'ana',
      currentKey: 'ana',
      unmounted: true,
      silent: true,
      previous: WITH_INSTAGRAM,
      result: { ok: true, data: AFTER_UNLINK },
    });
    assert.equal(unmounted.action, 'discard');

    const screen = read('screens/DiscoveryProfileScreen.tsx');
    assert.match(screen, /mountedRef\.current = false/);
    assert.match(screen, /loadGenRef\.current \+= 1/);
    assert.match(screen, /uidRef\.current/);
    assert.match(screen, /dataRef\.current = null;\s*loadGenRef\.current \+= 1/);
  });

  it('keeps valid data on silent error and applies a DTO without Instagram after Unlink', () => {
    const kept = decideDiscoveryProfileApply({
      requestGen: 3,
      currentGen: 3,
      requestKey: 'ana',
      currentKey: 'ana',
      unmounted: false,
      silent: true,
      previous: WITH_INSTAGRAM,
      result: { ok: false },
    });
    assert.deepEqual(kept, { action: 'keep', data: WITH_INSTAGRAM });
    assert.equal(
      discoveryPublicLinksOmitInstagram(WITH_INSTAGRAM.socialLinks),
      false,
    );

    const applied = decideDiscoveryProfileApply({
      requestGen: 3,
      currentGen: 3,
      requestKey: 'ana',
      currentKey: 'ana',
      unmounted: false,
      silent: true,
      previous: WITH_INSTAGRAM,
      result: { ok: true, data: AFTER_UNLINK },
    });
    assert.deepEqual(applied, { action: 'apply', data: AFTER_UNLINK });
    assert.equal(
      discoveryPublicLinksOmitInstagram(AFTER_UNLINK.socialLinks),
      true,
    );

    const blockingError = decideDiscoveryProfileApply({
      requestGen: 1,
      currentGen: 1,
      requestKey: 'ana',
      currentKey: 'ana',
      unmounted: false,
      silent: false,
      previous: null,
      result: { ok: false },
    });
    assert.equal(blockingError.action, 'clear');
  });
});

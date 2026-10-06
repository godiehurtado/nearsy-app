/**
 * BUG-LINKS-01 — unified social link normalization + opening (Discovery + legacy detail).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  normalizeSocialLinkUrl,
  readPublicSocialLinks,
  SOCIAL_LINK_ALLOWED_HOSTS,
  SOCIAL_LINK_PLATFORMS,
  type SocialLinkPlatform,
} from '../social/socialLinkUrl.ts';
import {
  openSocialLink,
  socialLinkOpenAlertKey,
} from '../social/socialLinkOpen.ts';
import {
  normalizeCustomNetworkUrl,
  normalizeSocialInput,
} from '../social/socialLinkNormalize.ts';
import {
  DISCOVERY_SOCIAL_PLATFORMS,
  parseDiscoverySocialLinks,
} from '../visibility/discoverySocialLinks.ts';
import enDiscovery from '../i18n/resources/discoveryProfile.ts';

const here = dirname(fileURLToPath(import.meta.url));
const sharedSrc = join(here, '..');

function readSrc(relative: string): string {
  return readFileSync(join(sharedSrc, relative), 'utf8').replace(/\r\n/g, '\n');
}

function recordingOpener(options: { fail?: boolean } = {}) {
  const opened: string[] = [];
  let canOpenCalls = 0;
  return {
    opened,
    get canOpenCalls() {
      return canOpenCalls;
    },
    opener: {
      canOpenURL: async () => {
        canOpenCalls += 1;
        return false;
      },
      openURL: async (url: string) => {
        if (options.fail) throw new Error('No Activity found');
        opened.push(url);
      },
    },
  };
}

describe('BUG-LINKS-01 normalizer: Instagram', () => {
  it('accepts full URL, bare host URL, @handle and dotted handle', () => {
    assert.equal(
      normalizeSocialLinkUrl('instagram', 'https://www.instagram.com/example_user'),
      'https://www.instagram.com/example_user',
    );
    assert.equal(
      normalizeSocialLinkUrl('instagram', 'instagram.com/example_user/'),
      'https://instagram.com/example_user/',
    );
    assert.equal(
      normalizeSocialLinkUrl('instagram', '@example_user'),
      'https://www.instagram.com/example_user',
    );
    assert.equal(
      normalizeSocialLinkUrl('instagram', 'example.user'),
      'https://www.instagram.com/example.user',
    );
  });

  it('never turns @user into https://@user', () => {
    const url = normalizeSocialLinkUrl('instagram', '@example_user');
    assert.ok(url && !url.includes('://@'));
    assert.equal(normalizeSocialLinkUrl('instagram', 'https://@example_user'), null);
    assert.equal(normalizeSocialLinkUrl('website', '@example_user'), null);
  });

  it('trims accidental whitespace and invisible characters', () => {
    assert.equal(
      normalizeSocialLinkUrl('instagram', '  https://www.instagram.com/example_user \n'),
      'https://www.instagram.com/example_user',
    );
    assert.equal(
      normalizeSocialLinkUrl('instagram', '\u200Bexample_user\uFEFF'),
      'https://www.instagram.com/example_user',
    );
    assert.equal(
      normalizeSocialLinkUrl('instagram', 'https://www.instagram.com/exa mple'),
      null,
    );
  });
});

describe('BUG-LINKS-01 normalizer: every supported network', () => {
  it('maps handles to the backend canonical templates', () => {
    const expected: Record<Exclude<SocialLinkPlatform, 'website'>, string> = {
      linkedin: 'https://www.linkedin.com/in/example_user',
      instagram: 'https://www.instagram.com/example_user',
      facebook: 'https://www.facebook.com/example_user',
      youtube: 'https://www.youtube.com/@example_user',
      x: 'https://x.com/example_user',
      tiktok: 'https://www.tiktok.com/@example_user',
      snapchat: 'https://www.snapchat.com/add/example_user',
    };
    for (const [platform, url] of Object.entries(expected)) {
      assert.equal(
        normalizeSocialLinkUrl(platform as SocialLinkPlatform, '@example_user'),
        url,
        platform,
      );
    }
  });

  it('accepts every allowlisted host variant (mirror of backend contract)', () => {
    for (const [platform, hosts] of Object.entries(SOCIAL_LINK_ALLOWED_HOSTS)) {
      for (const host of hosts) {
        const url = normalizeSocialLinkUrl(
          platform as SocialLinkPlatform,
          `https://${host}/example_user`,
        );
        assert.ok(url, `${platform} ${host}`);
        assert.ok(url!.startsWith('https://'));
      }
    }
  });

  it('accepts legitimate subdomains like the backend (e.g. locale Facebook)', () => {
    assert.equal(
      normalizeSocialLinkUrl('facebook', 'https://es-la.facebook.com/example_user'),
      'https://es-la.facebook.com/example_user',
    );
  });

  it('canonicalizes twitter hosts to x.com', () => {
    for (const host of ['twitter.com', 'www.twitter.com', 'mobile.twitter.com']) {
      assert.equal(
        normalizeSocialLinkUrl('x', `https://${host}/example_user`),
        'https://x.com/example_user',
      );
    }
  });

  it('rejects a URL from another network in the wrong field', () => {
    assert.equal(normalizeSocialLinkUrl('instagram', 'https://www.tiktok.com/@u'), null);
    assert.equal(normalizeSocialLinkUrl('x', 'https://example.com/u'), null);
  });

  it('platform list matches Discovery platforms (no new networks)', () => {
    assert.deepEqual([...SOCIAL_LINK_PLATFORMS], [...DISCOVERY_SOCIAL_PLATFORMS]);
    assert.deepEqual([...SOCIAL_LINK_PLATFORMS], [
      'linkedin',
      'instagram',
      'facebook',
      'youtube',
      'x',
      'tiktok',
      'snapchat',
      'website',
    ]);
  });
});

describe('BUG-LINKS-01 normalizer: security', () => {
  it('upgrades http to https', () => {
    assert.equal(
      normalizeSocialLinkUrl('instagram', 'http://www.instagram.com/example_user'),
      'https://www.instagram.com/example_user',
    );
    assert.equal(
      normalizeSocialLinkUrl('website', 'HTTP://Example.com/Path'),
      'https://example.com/Path',
    );
  });

  it('rejects deceptive hosts', () => {
    for (const raw of [
      'https://instagram.com.evil.example/u',
      'https://evilinstagram.com/u',
      'https://evil.example/instagram.com/u',
      'https://evil.example#@instagram.com',
      'https://evil.example\\@instagram.com/u',
      'https://\u0456nstagram.com/u',
      'https://instagram.com./u',
      'https://instagram.com%2eevil.example/u',
    ]) {
      assert.equal(normalizeSocialLinkUrl('instagram', raw), null, raw);
    }
  });

  it('rejects embedded credentials and unexpected ports', () => {
    assert.equal(
      normalizeSocialLinkUrl('instagram', 'https://user:pass@www.instagram.com/u'),
      null,
    );
    assert.equal(normalizeSocialLinkUrl('instagram', 'https://www.instagram.com:8443/u'), null);
    assert.equal(normalizeSocialLinkUrl('website', 'example.com:8080/x'), null);
    assert.equal(
      normalizeSocialLinkUrl('instagram', 'https://www.instagram.com:443/u'),
      'https://www.instagram.com/u',
    );
  });

  it('rejects non-http schemes, proprietary app schemes and IP/local hosts', () => {
    for (const raw of [
      'javascript:alert(1)',
      'data:text/html,hi',
      'file:///etc/passwd',
      'tel:+15551212',
      'mailto:someone@example.com',
      'intent://scan/#Intent;scheme=zxing;end',
      'instagram://user?username=example_user',
      'https://127.0.0.1/x',
      'https://localhost/x',
      'https://[::1]/x',
    ]) {
      assert.equal(normalizeSocialLinkUrl('website', raw), null, raw);
      assert.equal(normalizeSocialLinkUrl('instagram', raw), null, raw);
    }
  });

  it('preserves path, query string and fragment', () => {
    assert.equal(
      normalizeSocialLinkUrl('youtube', 'https://www.youtube.com/watch?v=abc123&t=10s#comments'),
      'https://www.youtube.com/watch?v=abc123&t=10s#comments',
    );
    assert.equal(
      normalizeSocialLinkUrl('website', 'example.com/a/b?x=1#top'),
      'https://example.com/a/b?x=1#top',
    );
  });

  it('percent-encodes non-ASCII path characters', () => {
    assert.equal(
      normalizeSocialLinkUrl('website', 'https://example.com/caf\u00e9'),
      'https://example.com/caf%C3%A9',
    );
  });
});

describe('BUG-LINKS-01 normalizer: LinkedIn, website, empty and non-string', () => {
  it('LinkedIn supports /in/ and /company/', () => {
    assert.equal(
      normalizeSocialLinkUrl('linkedin', 'https://www.linkedin.com/in/example-user/'),
      'https://www.linkedin.com/in/example-user/',
    );
    assert.equal(
      normalizeSocialLinkUrl('linkedin', 'https://www.linkedin.com/company/example-co'),
      'https://www.linkedin.com/company/example-co',
    );
    assert.equal(
      normalizeSocialLinkUrl('linkedin', 'company/example-co'),
      'https://www.linkedin.com/company/example-co',
    );
    assert.equal(
      normalizeSocialLinkUrl('linkedin', 'in/example-user'),
      'https://www.linkedin.com/in/example-user',
    );
    assert.equal(
      normalizeSocialLinkUrl('linkedin', 'example-user'),
      'https://www.linkedin.com/in/example-user',
    );
  });

  it('website requires a public host and has no handle mapping', () => {
    assert.equal(normalizeSocialLinkUrl('website', 'example.com'), 'https://example.com/');
    assert.equal(normalizeSocialLinkUrl('website', 'www.example.com'), 'https://www.example.com/');
    assert.equal(normalizeSocialLinkUrl('website', 'example'), null);
    assert.equal(normalizeSocialLinkUrl('website', 'https://example'), null);
  });

  it('empty and non-string values (arrays, custom rows) → null', () => {
    for (const raw of ['', '   ', '\u200B', null, undefined, 42, {}, ['https://example.com']]) {
      assert.equal(normalizeSocialLinkUrl('website', raw), null);
      assert.equal(normalizeSocialLinkUrl('instagram', raw), null);
    }
    assert.equal(
      normalizeSocialLinkUrl('website', [{ name: 'Custom', url: 'https://example.com' }]),
      null,
    );
  });
});

describe('BUG-LINKS-01 persisted bag reader (legacy ProfileDetail path)', () => {
  it('maps storage keys in backend order, skips custom and invalid entries individually', () => {
    const links = readPublicSocialLinks({
      website: 'example.com',
      twitter: 'https://twitter.com/example_user',
      instagram: '@example_user',
      facebook: 'https://evil.example/fb',
      linkedin: '   ',
      youtube: ['https://www.youtube.com/@x'],
      custom: [{ name: 'Custom', url: 'https://example.com/custom' }],
    });
    assert.deepEqual(links, [
      { platform: 'instagram', url: 'https://www.instagram.com/example_user' },
      { platform: 'x', url: 'https://x.com/example_user' },
      { platform: 'website', url: 'https://example.com/' },
    ]);
  });

  it('non-object bags → []', () => {
    assert.deepEqual(readPublicSocialLinks(undefined), []);
    assert.deepEqual(readPublicSocialLinks(null), []);
    assert.deepEqual(readPublicSocialLinks('https://example.com'), []);
    assert.deepEqual(readPublicSocialLinks([{ instagram: '@u' }]), []);
  });
});

describe('BUG-LINKS-01 Discovery wire parser is fail-open per entry', () => {
  it('drops invalid links individually and keeps the rest', () => {
    const links = parseDiscoverySocialLinks([
      { platform: 'instagram', url: 'https://www.instagram.com/example_user' },
      { platform: 'facebook', url: 'https://evil.example/fb' },
      { platform: 'myspace', url: 'https://example.com/x' },
      { platform: 'website', url: 'http://example.com' },
      { platform: 'linkedin', url: 'https://www.linkedin.com/in/a', username: 'x' },
      { platform: 'tiktok', url: ['https://www.tiktok.com/@a'] },
      'https://www.youtube.com/@a',
      null,
      { platform: 'x', url: 'https://x.com/example_user' },
      { platform: 'x', url: 'https://x.com/other' },
    ]);
    assert.deepEqual(links, [
      { platform: 'instagram', url: 'https://www.instagram.com/example_user' },
      { platform: 'x', url: 'https://x.com/example_user' },
    ]);
  });

  it('never throws for malformed payloads', () => {
    for (const raw of [undefined, null, {}, 'x', 42, [undefined], [[]], [{}]]) {
      assert.doesNotThrow(() => parseDiscoverySocialLinks(raw));
      assert.deepEqual(parseDiscoverySocialLinks(raw), []);
    }
  });

  it('parity: Discovery wire and legacy bag reader produce identical links', () => {
    const bag = {
      linkedin: 'https://www.linkedin.com/company/example-co',
      instagram: 'http://instagram.com/example_user',
      twitter: '@example_user',
      website: 'example.com/about',
      custom: [{ name: 'Custom', url: 'https://example.com/c' }],
    };
    const legacy = readPublicSocialLinks(bag);
    const wire = parseDiscoverySocialLinks(legacy.map((l) => ({ ...l })));
    assert.deepEqual(wire, legacy);
    assert.deepEqual(
      legacy.map((l) => l.platform),
      ['linkedin', 'instagram', 'x', 'website'],
    );
  });
});

describe('BUG-LINKS-01 opener', () => {
  it('opens the canonical https URL with openURL and reports opened', async () => {
    const rec = recordingOpener();
    const result = await openSocialLink('instagram', '@example_user', rec.opener);
    assert.equal(result, 'opened');
    assert.deepEqual(rec.opened, ['https://www.instagram.com/example_user']);
  });

  it('does not use canOpenURL as a gate', async () => {
    const rec = recordingOpener();
    const result = await openSocialLink(
      'instagram',
      'https://www.instagram.com/example_user',
      rec.opener,
    );
    assert.equal(result, 'opened');
    assert.equal(rec.canOpenCalls, 0);
  });

  it('openURL failure → failed (localized error alert)', async () => {
    const rec = recordingOpener({ fail: true });
    const result = await openSocialLink('website', 'https://example.com', rec.opener);
    assert.equal(result, 'failed');
    assert.equal(socialLinkOpenAlertKey(result), 'discoveryProfile.openLinkError');
  });

  it('invalid link → invalid without calling openURL (distinct alert)', async () => {
    const rec = recordingOpener();
    for (const raw of ['https://evil.example/x', 'instagram://user', '', ['x']]) {
      const result = await openSocialLink('instagram', raw, rec.opener);
      assert.equal(result, 'invalid');
    }
    assert.deepEqual(rec.opened, []);
    assert.equal(socialLinkOpenAlertKey('invalid'), 'discoveryProfile.openLinkInvalid');
    assert.equal(socialLinkOpenAlertKey('opened'), null);
  });
});

describe('BUG-LINKS-01 onboarding/editor normalizer delegates to the single normalizer', () => {
  it('persists https and rejects off-network URLs', () => {
    assert.deepEqual(normalizeSocialInput('instagram', 'http://instagram.com/example_user'), {
      ok: true,
      url: 'https://instagram.com/example_user',
    });
    assert.deepEqual(normalizeSocialInput('instagram', 'https://example.com/u'), {
      ok: false,
      reason: 'invalid',
    });
    assert.deepEqual(normalizeSocialInput('linkedin', 'company/example-co'), {
      ok: true,
      url: 'https://www.linkedin.com/company/example-co',
    });
    assert.deepEqual(normalizeSocialInput('x', '   '), { ok: true });
  });

  it('website/custom URLs are normalized to https', () => {
    assert.deepEqual(normalizeCustomNetworkUrl('mastodon.social/@example_user'), {
      ok: true,
      url: 'https://mastodon.social/@example_user',
    });
    assert.deepEqual(normalizeCustomNetworkUrl('http://example.com'), {
      ok: true,
      url: 'https://example.com/',
    });
    assert.deepEqual(normalizeCustomNetworkUrl('not a url'), { ok: false, reason: 'invalid' });
  });
});

describe('BUG-LINKS-01 i18n EN/ES', () => {
  it('has distinct invalid vs could-not-open copy in EN and ES', () => {
    assert.equal(enDiscovery.openLinkError, 'Could not open this link.');
    assert.equal(enDiscovery.openLinkInvalid, 'This link is not valid or is not supported.');
    assert.notEqual(enDiscovery.openLinkError, enDiscovery.openLinkInvalid);
    const esSrc = readSrc('i18n/locales/es.ts');
    assert.match(esSrc, /openLinkError: 'No se pudo abrir este enlace\.'/);
    assert.match(esSrc, /openLinkInvalid: 'Este enlace no es válido o no es compatible\.'/);
  });
});

describe('BUG-LINKS-01 routes share one implementation (static)', () => {
  const hookSrc = readSrc('components/profileExploration/useOpenSocialLink.ts');
  const rowSrc = readSrc('components/profileExploration/DiscoverySocialMediaRow.tsx');
  const legacySrc = readSrc('screens/ProfileDetailScreen.tsx');
  const openSrc = readSrc('social/socialLinkOpen.ts');
  const normalizeSrc = readSrc('social/socialLinkUrl.ts');

  it('hook opens via openSocialLink + Linking and maps alerts through i18n keys', () => {
    assert.match(hookSrc, /openSocialLink\(platform, url, Linking\)/);
    assert.match(hookSrc, /socialLinkOpenAlertKey/);
    assert.match(hookSrc, /Alert\.alert\(t\(alertKey\)\)/);
    assert.doesNotMatch(hookSrc, /canOpenURL|console\./);
  });

  it('Discovery row and legacy ProfileDetail both use the shared hook', () => {
    assert.match(rowSrc, /useOpenSocialLink\(\)/);
    assert.match(rowSrc, /openLink\(link\.platform, link\.url\)/);
    assert.match(legacySrc, /useOpenSocialLink\(\)/);
    assert.match(legacySrc, /readPublicSocialLinks\(/);
    assert.match(legacySrc, /openSocialLink\(link\.platform, link\.url\)/);
  });

  it('no divergent opener, canOpenURL gate, custom-array open or hardcoded link alerts remain', () => {
    for (const src of [rowSrc, legacySrc]) {
      assert.doesNotMatch(src, /canOpenURL|Linking\.openURL|openDiscoverySocialHttpsUrl/);
    }
    assert.doesNotMatch(legacySrc, /function normalizeUrl|function openLink|Invalid link/);
    assert.doesNotMatch(legacySrc, /Object\.entries\(socialForMode\)/);
    assert.doesNotMatch(openSrc, /\.canOpenURL\(/);
  });

  it('no proprietary schemes, embedded browser or URL logging', () => {
    for (const src of [hookSrc, rowSrc, openSrc, normalizeSrc]) {
      assert.doesNotMatch(src, /['"`](instagram|fb|twitter|tiktok|snapchat|youtube|linkedin):\/\//);
      assert.doesNotMatch(src, /WebView|openBrowserAsync|console\./);
    }
  });
});

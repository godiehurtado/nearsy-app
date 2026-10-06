/**
 * BUG-LINKS-01 — single social link normalizer (editor persist + Discovery open).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  normalizeSocialLinkUrl,
  type SocialLinkUrlPlatform,
} from '../social/socialLinkUrl';
import {
  normalizeCustomNetworkUrl,
  normalizeSocialInput,
} from '../social/socialLinkNormalize';
import { buildPostCrjSocialLinksPersistencePatch } from '../social/onboardingSocialPersistence';
import { emptyCrjSocialDraftValues } from '../social/onboardingSocialCatalog';

const n = normalizeSocialLinkUrl;

describe('normalizeSocialLinkUrl — Instagram', () => {
  it('accepts full URLs, scheme-less URLs and handles', () => {
    assert.equal(n('instagram', 'https://www.instagram.com/nearsy'), 'https://www.instagram.com/nearsy');
    assert.equal(n('instagram', 'instagram.com/nearsy'), 'https://instagram.com/nearsy');
    assert.equal(n('instagram', 'www.instagram.com/nearsy/'), 'https://www.instagram.com/nearsy/');
    assert.equal(n('instagram', '@nearsy'), 'https://www.instagram.com/nearsy');
    assert.equal(n('instagram', 'nearsy.app_1'), 'https://www.instagram.com/nearsy.app_1');
  });

  it('removes accidental surrounding spaces and invisible characters', () => {
    assert.equal(n('instagram', '   @nearsy  '), 'https://www.instagram.com/nearsy');
    assert.equal(n('instagram', '\u200Bhttps://instagram.com/nearsy\uFEFF'), 'https://instagram.com/nearsy');
    assert.equal(n('instagram', 'https://instagram.com/near sy'), null);
    assert.equal(n('instagram', '@near sy'), null);
  });

  it('upgrades http and lowercases only the host', () => {
    assert.equal(n('instagram', 'http://instagram.com/nearsy'), 'https://instagram.com/nearsy');
    assert.equal(n('instagram', 'HTTPS://WWW.Instagram.COM/Nearsy'), 'https://www.instagram.com/Nearsy');
  });
});

describe('normalizeSocialLinkUrl — every supported platform', () => {
  const handleCases: Array<[SocialLinkUrlPlatform, string, string | null]> = [
    ['linkedin', 'jane', 'https://www.linkedin.com/in/jane'],
    ['instagram', 'jane', 'https://www.instagram.com/jane'],
    ['facebook', 'jane.doe', 'https://www.facebook.com/jane.doe'],
    ['youtube', '@channel', 'https://www.youtube.com/@channel'],
    ['x', '@jane', 'https://x.com/jane'],
    ['tiktok', '@jane', 'https://www.tiktok.com/@jane'],
    ['snapchat', 'jane', 'https://www.snapchat.com/add/jane'],
    ['website', 'jane', null],
    ['website', '@jane', null],
  ];
  for (const [platform, raw, expected] of handleCases) {
    it(`handle ${platform}:${raw}`, () => {
      assert.equal(n(platform, raw), expected);
    });
  }

  const urlCases: Array<[SocialLinkUrlPlatform, string, string]> = [
    ['facebook', 'https://m.facebook.com/jane', 'https://m.facebook.com/jane'],
    ['facebook', 'fb.com/jane', 'https://fb.com/jane'],
    ['youtube', 'https://youtu.be/abc123', 'https://youtu.be/abc123'],
    ['youtube', 'https://m.youtube.com/@channel', 'https://m.youtube.com/@channel'],
    ['x', 'https://twitter.com/jane', 'https://x.com/jane'],
    ['x', 'https://mobile.twitter.com/jane', 'https://x.com/jane'],
    ['x', 'x.com/jane', 'https://x.com/jane'],
    ['tiktok', 'tiktok.com/@jane', 'https://tiktok.com/@jane'],
    ['tiktok', 'https://vm.tiktok.com/ZMabc/', 'https://vm.tiktok.com/ZMabc/'],
    ['snapchat', 'https://www.snapchat.com/add/jane', 'https://www.snapchat.com/add/jane'],
  ];
  for (const [platform, raw, expected] of urlCases) {
    it(`url ${platform}:${raw}`, () => {
      assert.equal(n(platform, raw), expected);
    });
  }

  it('rejects another platform host for each network', () => {
    assert.equal(n('instagram', 'https://www.facebook.com/jane'), null);
    assert.equal(n('linkedin', 'https://x.com/jane'), null);
    assert.equal(n('youtube', 'https://www.tiktok.com/@jane'), null);
    assert.equal(n('snapchat', 'https://linktr.ee/jane'), null);
  });
});

describe('normalizeSocialLinkUrl — LinkedIn /in/ and /company/', () => {
  it('keeps profile and company URLs', () => {
    assert.equal(n('linkedin', 'https://www.linkedin.com/in/jane'), 'https://www.linkedin.com/in/jane');
    assert.equal(n('linkedin', 'linkedin.com/company/acme'), 'https://linkedin.com/company/acme');
  });

  it('maps in/… and company/… path handles', () => {
    assert.equal(n('linkedin', 'in/jane'), 'https://www.linkedin.com/in/jane');
    assert.equal(n('linkedin', '/company/acme/'), 'https://www.linkedin.com/company/acme');
    assert.equal(n('linkedin', 'Company/acme'), 'https://www.linkedin.com/company/acme');
    assert.equal(n('linkedin', 'school/acme'), null);
  });
});

describe('normalizeSocialLinkUrl — security', () => {
  it('rejects deceptive hosts', () => {
    for (const raw of [
      'https://instagram.com.evil.example/a',
      'https://evilinstagram.com/a',
      'https://evil.example/instagram.com/a',
      'https://evil.example#@instagram.com',
      'https://evil.example?x=instagram.com',
      'https://instagram.com./a',
    ]) {
      assert.equal(n('instagram', raw), null, raw);
    }
  });

  it('rejects embedded credentials and "@" in the authority', () => {
    assert.equal(n('instagram', 'https://user:pass@instagram.com/a'), null);
    assert.equal(n('instagram', 'https://user@instagram.com/a'), null);
    assert.equal(n('instagram', 'https://instagram.com@evil.example/a'), null);
    assert.equal(n('website', 'https://@user.name'), null);
    assert.equal(n('website', '@user.name'), null);
    assert.equal(n('website', 'https://evil.example\\@instagram.com'), null);
  });

  it('rejects unexpected ports, keeps explicit 443', () => {
    assert.equal(n('instagram', 'https://instagram.com:8080/a'), null);
    assert.equal(n('instagram', 'instagram.com:8080/a'), null);
    assert.equal(n('website', 'http://example.com:80/a'), null);
    assert.equal(n('website', 'https://example.com:abc/a'), null);
    assert.equal(n('instagram', 'https://instagram.com:443/a'), 'https://instagram.com/a');
  });

  it('rejects non-web and proprietary schemes', () => {
    for (const raw of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:text/html,hi',
      'file:///etc/passwd',
      'tel:+15551212',
      'mailto:someone@example.com',
      'ftp://example.com/a',
      'instagram://user?username=a',
      'fb://profile/1',
      'intent://scan/#Intent;scheme=zxing;end',
      'http:/example.com',
    ]) {
      assert.equal(n('website', raw), null, raw);
    }
  });

  it('rejects IP literals, single-label and malformed hosts for website', () => {
    for (const raw of [
      'https://192.168.0.1/a',
      '192.168.0.1',
      'https://localhost/',
      'https://[::1]/',
      'https://exa_mple.com/',
      'https://-example.com/',
      'https://',
      'https://example.com<script>',
    ]) {
      assert.equal(n('website', raw), null, raw);
    }
  });
});

describe('normalizeSocialLinkUrl — path, query, fragment, website', () => {
  it('preserves safe path, query string and fragment', () => {
    assert.equal(
      n('youtube', 'https://www.youtube.com/watch?v=abc&t=10#chapter'),
      'https://www.youtube.com/watch?v=abc&t=10#chapter',
    );
    assert.equal(
      n('linkedin', 'linkedin.com/in/jane?trk=public#top'),
      'https://linkedin.com/in/jane?trk=public#top',
    );
    assert.equal(n('website', 'https://example.com?ref=a'), 'https://example.com/?ref=a');
    assert.equal(n('website', 'https://example.com#about'), 'https://example.com/#about');
  });

  it('normalizes website values', () => {
    assert.equal(n('website', 'example.com'), 'https://example.com/');
    assert.equal(n('website', 'http://example.com/path'), 'https://example.com/path');
    assert.equal(n('website', 'https://Sub.Example.co.uk/a'), 'https://sub.example.co.uk/a');
    assert.equal(n('website', 'https://example.com/café'), 'https://example.com/caf%C3%A9');
    assert.equal(n('website', 'https://xn--mnchen-3ya.de/'), 'https://xn--mnchen-3ya.de/');
  });
});

describe('normalizeSocialLinkUrl — empty and non-string input', () => {
  it('returns null for empty values', () => {
    for (const raw of ['', '   ', '\u200B', '@', '@@']) {
      assert.equal(n('instagram', raw), null, JSON.stringify(raw));
    }
  });

  it('never opens arrays, objects or the custom bag as a string', () => {
    for (const raw of [
      undefined,
      null,
      42,
      ['https://instagram.com/a'],
      [{ name: 'Blog', url: 'https://example.com' }],
      { url: 'https://instagram.com/a' },
    ]) {
      assert.equal(n('instagram', raw), null);
      assert.equal(n('website', raw), null);
    }
    assert.equal(n('custom' as SocialLinkUrlPlatform, 'https://example.com'), null);
  });

  it('stays independent of the global URL implementation (RN shim differs)', () => {
    const src = readFileSync(join(__dirname, '../social/socialLinkUrl.ts'), 'utf8');
    assert.doesNotMatch(src, /new URL\(/);
  });
});

describe('editor persistence uses the same normalizer', () => {
  it('normalizeSocialInput mirrors normalizeSocialLinkUrl', () => {
    assert.deepEqual(normalizeSocialInput('instagram', '  '), { ok: true });
    assert.deepEqual(normalizeSocialInput('instagram', 'http://instagram.com/a'), {
      ok: true,
      url: 'https://instagram.com/a',
    });
    assert.deepEqual(normalizeSocialInput('instagram', 'https://linktr.ee/a'), {
      ok: false,
      reason: 'invalid',
    });
    assert.deepEqual(normalizeSocialInput('linkedin', 'company/acme'), {
      ok: true,
      url: 'https://www.linkedin.com/company/acme',
    });
  });

  it('website / custom network never turns a handle into https://@user', () => {
    assert.deepEqual(normalizeCustomNetworkUrl('@user'), { ok: false, reason: 'invalid' });
    assert.deepEqual(normalizeCustomNetworkUrl('@user.name'), { ok: false, reason: 'invalid' });
    assert.deepEqual(normalizeCustomNetworkUrl('mastodon.social/@diego'), {
      ok: true,
      url: 'https://mastodon.social/@diego',
    });
  });

  it('persisted bag stores canonical HTTPS only', () => {
    const values = emptyCrjSocialDraftValues();
    values.instagram = 'http://www.instagram.com/a';
    values.x = 'https://twitter.com/a';
    const patch = buildPostCrjSocialLinksPersistencePatch('personal', values, [
      { name: 'Blog', url: 'http://blog.example.com' },
      { name: 'Bad', url: '@user' },
    ], { website: 'example.com' });
    assert.deepEqual(patch.socialLinksPersonal, {
      website: 'https://example.com/',
      instagram: 'https://www.instagram.com/a',
      twitter: 'https://x.com/a',
      custom: [{ name: 'Blog', url: 'https://blog.example.com/' }],
    });
  });
});

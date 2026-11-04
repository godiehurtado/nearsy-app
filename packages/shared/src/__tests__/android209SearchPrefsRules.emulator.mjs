/**
 * Home age/distance writes against the Firestore rules of Functions #45, on the
 * local emulator with synthetic data only. Not part of the regular suites: it needs
 * a running emulator and the rules file, which lives in nearsy-functions.
 *
 *   firebase emulators:exec --only firestore --project demo-nearsy-rules \
 *     "node --experimental-strip-types --test <this file>"
 *
 * Env: NEARSY_FIRESTORE_RULES = path to firestore/firestore.rules at #45.
 * Refuses anything but a localhost emulator and a demo- project.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { before, beforeEach, describe, it } from 'node:test';

import { buildManualSocialLinkWrite } from '../social/manualSocialLinkCard.ts';
import { buildSearchPreferencesModeWrite } from '../visibility/searchPreferencesWriter.ts';

const RULES_SHA256_AT_45 =
  '2982162c18710fc68b50ded52745ee9e97fd8a008f3f2026548ce90bfdab19c1';
const PROJECT = 'demo-nearsy-rules';
const HOST = process.env.FIRESTORE_EMULATOR_HOST;
const UID = 'synthetic_owner';
const MAX_DISTANCE = 200 / 3.28084;
const MODES = ['personal', 'professional'];
const T = new Date(1760396825669);

assert.match(HOST ?? '', /^(127\.0\.0\.1|localhost):\d+$/, 'emulator only');
const BASE = `http://${HOST}`;
const DOCS = `${BASE}/v1/projects/${PROJECT}/databases/(default)/documents`;

function b64(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function tokenFor(uid) {
  const now = Math.floor(Date.now() / 1000);
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
    sub: uid,
    user_id: uid,
    iat: now,
    exp: now + 3600,
    aud: PROJECT,
    iss: `https://securetoken.google.com/${PROJECT}`,
    auth_time: now,
    firebase: { sign_in_provider: 'custom', identities: {} },
  })}.`;
}

function toValue(value) {
  if (value === null) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toValue) } };
  }
  switch (typeof value) {
    case 'boolean':
      return { booleanValue: value };
    case 'string':
      return { stringValue: value };
    case 'number':
      // As the SDKs encode it: rules tell int from float.
      return Number.isInteger(value)
        ? { integerValue: String(value) }
        : { doubleValue: value };
    default:
      return { mapValue: { fields: toFields(value) } };
  }
}

/** FieldValue.delete(): the path is in the mask and has no value. */
const DELETE_FIELD = Symbol('delete');

function toFields(map) {
  return Object.fromEntries(
    Object.entries(map)
      .filter(([, value]) => value !== DELETE_FIELD)
      .map(([key, value]) => [key, toValue(value)]),
  );
}

/** What set(..., { merge: true }) sends: nested maps merge key by key. */
function mergeMask(map, prefix = '') {
  return Object.entries(map).flatMap(([key, value]) =>
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !(value instanceof Date)
      ? mergeMask(value, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

async function setMerge(path, data, token) {
  const query = mergeMask(data)
    .map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`)
    .join('&');
  return fetch(`${DOCS}/${path}?${query}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: toFields(data) }),
  });
}

/** Rules bypass, for seeding and reading back. */
const seed = async (data) => {
  const res = await fetch(`${DOCS}/users/${UID}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: toFields(data) }),
  });
  assert.equal(res.status, 200, await res.text());
};
const stored = async () => {
  const res = await fetch(`${DOCS}/users/${UID}`, {
    headers: { Authorization: 'Bearer owner' },
  });
  assert.equal(res.status, 200);
  return (await res.json()).fields;
};

/** The exact payload Home sends, with the root stamp the write helper adds. */
function homeWrite(mode, fields, uid = UID, target = UID) {
  return setMerge(
    `users/${target}`,
    {
      ...buildSearchPreferencesModeWrite(mode, fields, 1762200000000),
      updatedAt: 1762200000000,
    },
    tokenFor(uid),
  );
}

async function assertAllowed(response) {
  assert.equal(response.status, 200, await response.text());
}
function assertDenied(response) {
  assert.equal(response.status, 403);
}

const prefsOf = (fields, mode) =>
  fields.searchPreferences?.mapValue?.fields?.[mode]?.mapValue?.fields;
const number = (value) =>
  value.integerValue !== undefined ? Number(value.integerValue) : value.doubleValue;

const catalogIds = (n, tag) => Array.from({ length: n }, (_, i) => `sports_${tag}_${i}`);
const longIds = (n, c) =>
  Array.from({ length: n }, (_, i) => `${c}${String(i).padStart(2, '0')}`.padEnd(128, c));

function prefs(overrides = {}) {
  return {
    ageMin: 18,
    ageMax: 99,
    maxDistanceMeters: MAX_DISTANCE,
    interestIds: [],
    updatedAt: 1760396825669,
    ...overrides,
  };
}

function fullProfile({ personal = [], professional = [], languages = ['en', 'es'], extra = {} } = {}) {
  const face = () => ({
    realName: 'Synthetic',
    bio: 'x'.repeat(120),
    gallery: Array.from({ length: 12 }, (_, i) => ({
      url: `https://example.test/${i}`,
      w: 1,
      h: 1,
    })),
  });
  return {
    email: 'synthetic@example.test',
    realName: 'Synthetic',
    visibility: true,
    schemaVersion: 1,
    profileSetupCompleted: true,
    phone: '+10000000000',
    phoneVerified: true,
    phoneVerifiedAt: T,
    phoneHash: 'synthetic-hash',
    birthCountryCode: 'US',
    residenceCountryCode: 'US',
    languageCodes: languages,
    currentCity: {
      id: '123456',
      provider: 'geonames',
      name: 'City',
      countryCode: 'US',
      region: 'Region',
    },
    location: {
      latitude: 1,
      longitude: 2,
      accuracyMeters: 3,
      geohash: 'abc',
      observedAt: T,
      confirmedAt: T,
    },
    profiles: { personal: face(), professional: face() },
    createdAt: T,
    updatedAt: T,
    searchPreferences: {
      personal: prefs({ interestIds: personal }),
      professional: prefs({ interestIds: professional }),
    },
    ...extra,
  };
}

const VISIBLE_GATES = { visibleToMinAge: 18, visibleToMaxAge: 99 };
const LONGEST_LANGUAGE = 'abc-12345678-12345678-12345678';

const SHAPES = {
  'complete profile, 0+0 interests, 2 languages': () => fullProfile(),
  '12+0': () => fullProfile({ personal: catalogIds(12, 'a') }),
  '0+12': () => fullProfile({ professional: catalogIds(12, 'b') }),
  '6+6': () => fullProfile({ personal: catalogIds(6, 'a'), professional: catalogIds(6, 'b') }),
  '12+12, 10 languages, visible ages': () =>
    fullProfile({
      personal: catalogIds(12, 'a'),
      professional: catalogIds(12, 'b'),
      languages: Array(10).fill('en'),
      extra: VISIBLE_GATES,
    }),
  'maximum lengths: 128-char ids, 30-char languages, visible ages': () =>
    fullProfile({
      personal: longIds(12, 'a'),
      professional: longIds(12, 'b'),
      languages: Array(10).fill(LONGEST_LANGUAGE),
      extra: VISIBLE_GATES,
    }),
};

describe('Home filter writes on the rules of #45', () => {
  before(async () => {
    const file = process.env.NEARSY_FIRESTORE_RULES;
    assert.ok(file, 'NEARSY_FIRESTORE_RULES is required');
    assert.ok(PROJECT.startsWith('demo-'));
    const content = readFileSync(file, 'utf8');
    assert.equal(
      createHash('sha256').update(content).digest('hex'),
      RULES_SHA256_AT_45,
      'not the rules of #45',
    );
    const res = await fetch(`${BASE}/emulator/v1/projects/${PROJECT}:securityRules`, {
      method: 'PUT',
      body: JSON.stringify({
        rules: { files: [{ name: 'firestore.rules', content }] },
      }),
    });
    assert.equal(res.status, 200, await res.text());
  });

  beforeEach(async () => {
    const res = await fetch(
      `${BASE}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`,
      { method: 'DELETE' },
    );
    assert.equal(res.status, 200);
  });

  for (const [shape, make] of Object.entries(SHAPES)) {
    for (const mode of MODES) {
      const other = mode === 'personal' ? 'professional' : 'personal';

      it(`${shape} | ${mode}: distance saves, and nothing else moves`, async () => {
        await seed(make());
        const before = await stored();
        await assertAllowed(await homeWrite(mode, { maxDistanceMeters: 30 }));
        const after = await stored();
        assert.equal(number(prefsOf(after, mode).maxDistanceMeters), 30);
        assert.deepEqual(prefsOf(after, other), prefsOf(before, other));
        assert.deepEqual(prefsOf(after, mode).interestIds, prefsOf(before, mode).interestIds);
        assert.deepEqual(prefsOf(after, mode).ageMin, prefsOf(before, mode).ageMin);
        assert.deepEqual(after.languageCodes, before.languageCodes);
      });

      it(`${shape} | ${mode}: age saves, and nothing else moves`, async () => {
        await seed(make());
        const before = await stored();
        await assertAllowed(await homeWrite(mode, { ageMin: 25, ageMax: 60 }));
        const after = await stored();
        assert.equal(number(prefsOf(after, mode).ageMin), 25);
        assert.equal(number(prefsOf(after, mode).ageMax), 60);
        assert.deepEqual(prefsOf(after, other), prefsOf(before, other));
        assert.deepEqual(
          prefsOf(after, mode).maxDistanceMeters,
          prefsOf(before, mode).maxDistanceMeters,
        );
      });
    }
  }

  describe('limits', () => {
    for (const [label, value] of [
      ['maximum 200 ft', MAX_DISTANCE],
      ['20 ft', 20 / 3.28084],
      ['60 m', 60],
      ['minimum 5 m', 5],
    ]) {
      it(`distance ${label} is accepted`, async () => {
        await seed(fullProfile());
        await assertAllowed(await homeWrite('personal', { maxDistanceMeters: value }));
      });
    }

    it('age 18 to 99 and a single-age range are accepted', async () => {
      await seed(fullProfile());
      await assertAllowed(await homeWrite('personal', { ageMin: 18, ageMax: 99 }));
      await assertAllowed(await homeWrite('personal', { ageMin: 40, ageMax: 40 }));
    });

    for (const [label, fields] of [
      ['distance above the maximum', { maxDistanceMeters: 61 }],
      ['distance below the minimum', { maxDistanceMeters: 4.9 }],
      ['age below 18', { ageMin: 17, ageMax: 40 }],
      ['age above 99', { ageMin: 18, ageMax: 100 }],
      ['inverted range', { ageMin: 50, ageMax: 40 }],
      ['fractional age', { ageMin: 18.5, ageMax: 40 }],
    ]) {
      it(`${label} is denied and changes nothing`, async () => {
        await seed(fullProfile());
        const before = await stored();
        assertDenied(await homeWrite('personal', fields));
        assert.deepEqual((await stored()).searchPreferences, before.searchPreferences);
      });
    }
  });

  describe('first write', () => {
    const complete = {
      ageMin: 18,
      ageMax: 99,
      maxDistanceMeters: 30,
      interestIds: [],
    };

    it('no stored preferences: a complete mode map is accepted', async () => {
      const { searchPreferences: _none, ...profile } = fullProfile();
      await seed(profile);
      await assertAllowed(await homeWrite('professional', complete));
      const after = await stored();
      assert.ok(prefsOf(after, 'professional'));
      assert.equal(prefsOf(after, 'personal'), undefined, 'the other mode is not created');
    });

    it('no stored preferences: edited fields alone are denied, which is why the first is complete', async () => {
      const { searchPreferences: _none, ...profile } = fullProfile();
      await seed(profile);
      assertDenied(await homeWrite('professional', { maxDistanceMeters: 30 }));
    });
  });

  describe('historical data is neither repaired nor bypassed', () => {
    it('an invalid other mode blocks the save and stays exactly as stored', async () => {
      const profile = fullProfile();
      profile.searchPreferences.professional = prefs({ maxDistanceMeters: 500 });
      await seed(profile);
      const before = await stored();
      assertDenied(await homeWrite('personal', { maxDistanceMeters: 30 }));
      assert.deepEqual((await stored()).searchPreferences, before.searchPreferences);
    });

    it('an invalid active mode is not replaced by defaults through an edit', async () => {
      const profile = fullProfile();
      profile.searchPreferences.personal = prefs({ ageMin: 3 });
      await seed(profile);
      const before = await stored();
      assertDenied(await homeWrite('personal', { maxDistanceMeters: 30 }));
      assert.deepEqual((await stored()).searchPreferences, before.searchPreferences);
    });
  });

  describe('manual social links, written the same way', () => {
    const CUSTOM = [
      { name: 'Mastodon', url: 'https://mastodon.social/@ana' },
      { name: 'Old', url: 'not a url' },
    ];
    const withLinks = () =>
      fullProfile({
        extra: {
          socialLinksPersonal: {
            facebook: 'https://www.facebook.com/ana',
            twitter: 'https://x.com/ana',
            custom: CUSTOM,
          },
          socialLinksProfessional: { linkedin: 'https://www.linkedin.com/in/ana' },
        },
      });
    const link = (fields, bag) => fields[bag]?.mapValue?.fields;
    const linkWrite = (mode, field, url) =>
      setMerge(
        `users/${UID}`,
        {
          ...buildManualSocialLinkWrite(mode, field, url, DELETE_FIELD),
          updatedAt: 1762200000000,
        },
        tokenFor(UID),
      );

    it('add and edit keep custom links, other links and the other mode', async () => {
      await seed(withLinks());
      const before = await stored();
      await assertAllowed(
        await linkWrite('personal', 'linkedin', 'https://www.linkedin.com/in/new'),
      );
      await assertAllowed(
        await linkWrite('personal', 'linkedin', 'https://www.linkedin.com/in/edited'),
      );
      const after = await stored();
      const personal = link(after, 'socialLinksPersonal');
      assert.equal(personal.linkedin.stringValue, 'https://www.linkedin.com/in/edited');
      assert.deepEqual(personal.custom, link(before, 'socialLinksPersonal').custom);
      assert.deepEqual(personal.twitter, link(before, 'socialLinksPersonal').twitter);
      assert.deepEqual(after.socialLinksProfessional, before.socialLinksProfessional);
    });

    it('remove really removes, and only that key', async () => {
      await seed(withLinks());
      const before = await stored();
      await assertAllowed(await linkWrite('personal', 'facebook', null));
      const after = await stored();
      const personal = link(after, 'socialLinksPersonal');
      assert.equal(personal.facebook, undefined);
      assert.deepEqual(personal.custom, link(before, 'socialLinksPersonal').custom);
      assert.deepEqual(after.socialLinksProfessional, before.socialLinksProfessional);
    });

    it('the earlier payload could not remove: a merge keeps an omitted key', async () => {
      await seed(withLinks());
      await assertAllowed(
        await setMerge(
          `users/${UID}`,
          { socialLinksPersonal: { twitter: 'https://x.com/ana' } },
          tokenFor(UID),
        ),
      );
      const personal = link(await stored(), 'socialLinksPersonal');
      assert.equal(personal.facebook.stringValue, 'https://www.facebook.com/ana');
    });
  });

  it('another account cannot write these preferences', async () => {
    await seed(fullProfile());
    assertDenied(await homeWrite('personal', { maxDistanceMeters: 30 }, 'someone_else'));
  });
});

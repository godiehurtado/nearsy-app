import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createPushOpenCoordinator, parsePushOpenTarget, PUSH_NAVIGATION_PENDING_TTL_MS } from '../../alerts/pushOpenCoordinator';
import {
  classifyAttributionAccess,
  createPendingAttributionStore,
  parseCampaignLink,
} from '../attribution';
import { matchScoreRange, PROFILE_LIST_MAX_ITEMS } from '../contract';
import {
  buildScoreProperties,
  createDiscoveryEntryTracker,
  createMatchSessionDedupe,
} from '../discoveryTracking';
import {
  createForegroundTracker,
  resolveIsFirstOpen,
  type StringStore,
} from '../lifecycle';
import {
  createLocationPermissionObserver,
  type LocationPermissionReadings,
} from '../locationPermissions';
import {
  buildOnboardingStepProperties,
  computeCompletionTimeMin,
} from '../onboarding';
import {
  buildPersonProperties,
  computeAgeRange,
  diffPersonProperties,
  manualSocialPlatforms,
  newlyAddedManualSocials,
  normalizeForComparison,
  profileWriteAffectsAnalytics,
  summarizeAffiliations,
  summarizeInterests,
} from '../profileProperties';

const NOW = new Date('2026-11-06T12:00:00Z');

function memoryStore(): StringStore {
  const data = new Map<string, string>();
  return {
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value);
    },
    removeItem: async (key) => {
      data.delete(key);
    },
  };
}

describe('app_opened lifecycle', () => {
  it('cold start in foreground counts once', () => {
    const tracker = createForegroundTracker();
    assert.equal(tracker.onAppState('active'), 'cold_start');
    assert.equal(tracker.onAppState('active'), null);
  });

  it('system dialogs (inactive → active) never count', () => {
    const tracker = createForegroundTracker();
    tracker.onAppState('active');
    assert.equal(tracker.onAppState('inactive'), null);
    assert.equal(tracker.onAppState('active'), null);
  });

  it('returning from background counts', () => {
    const tracker = createForegroundTracker();
    tracker.onAppState('active');
    tracker.onAppState('inactive');
    tracker.onAppState('background');
    assert.equal(tracker.onAppState('active'), 'return_from_background');
  });

  it('a background-only launch is not an open until the user arrives', () => {
    const tracker = createForegroundTracker();
    assert.equal(tracker.onAppState('background'), null);
    assert.equal(tracker.onAppState('unknown'), null);
    assert.equal(tracker.onAppState('active'), 'cold_start');
  });

  it('launch passes through inactive without counting twice', () => {
    const tracker = createForegroundTracker();
    assert.equal(tracker.onAppState('inactive'), null);
    assert.equal(tracker.onAppState('active'), 'cold_start');
  });
});

describe('is_first_open', () => {
  const base = { markerRecorded: false, legacyUseEvidence: false, hasSession: false };

  it('true only with no evidence of earlier use', () => {
    assert.equal(resolveIsFirstOpen(base), true);
  });

  it('turning tracking on for an existing install is not a first open', () => {
    assert.equal(resolveIsFirstOpen({ ...base, legacyUseEvidence: true }), false);
    assert.equal(resolveIsFirstOpen({ ...base, hasSession: true }), false);
    assert.equal(resolveIsFirstOpen({ ...base, markerRecorded: true }), false);
  });
});

describe('onboarding payloads', () => {
  it('uses the approved milestone numbers', () => {
    const expected = {
      profile_type: 1,
      basics: 2,
      about: 3,
      affiliations: 4,
      interests: 5,
      socials: 6,
    } as const;
    for (const [step, number] of Object.entries(expected)) {
      const props = buildOnboardingStepProperties(step as keyof typeof expected);
      assert.equal(props.step_number, number);
    }
  });

  it('skipped means finished with no content', () => {
    const empty = buildOnboardingStepProperties('affiliations', { itemCount: 0 });
    assert.equal(empty.skipped, true);
    const partial = buildOnboardingStepProperties('affiliations', {
      itemCount: 2,
      catalogCount: 1,
      customCount: 1,
    });
    assert.equal(partial.skipped, false);
    assert.equal(partial.item_count, 2);
    assert.equal(partial.custom_count, 1);
  });

  it('required steps are never skipped', () => {
    for (const step of ['profile_type', 'basics', 'about'] as const) {
      assert.equal(buildOnboardingStepProperties(step).skipped, false);
    }
  });
});

describe('completion_time_min', () => {
  const now = Date.parse('2026-11-06T12:00:00Z');

  it('elapsed minutes since creation, pauses included', () => {
    assert.equal(computeCompletionTimeMin('2026-11-06T11:00:00Z', now), 60);
    assert.equal(computeCompletionTimeMin('Wed, 04 Nov 2026 12:00:00 GMT', now), 2880);
  });

  it('omitted when missing, invalid or negative', () => {
    for (const value of [null, undefined, '', 'nonsense', '2026-11-07T00:00:00Z']) {
      assert.equal(computeCompletionTimeMin(value, now), undefined);
    }
  });
});

describe('interests and affiliations', () => {
  it('separates catalog ids from original custom text', () => {
    const summary = summarizeInterests([
      { id: 'music_genre_pop', name: 'Pop' },
      { id: 'custom_sports_outdoors_pickle_171000', name: 'Pickleball', isCustom: true },
      { id: 'custom_food_x_1', name: 'Tacos' },
    ]);
    assert.deepEqual(summary.catalog, ['music_genre_pop']);
    assert.deepEqual(summary.custom, ['Pickleball', 'Tacos']);
    assert.equal(summary.total, 3);
  });

  it('custom ids that embed text never pass as catalog', () => {
    const summary = summarizeInterests([
      { id: 'custom_sports_my_private_club_1', name: 'My Club', isCustom: true },
    ]);
    assert.equal(summary.catalog.join().includes('private'), false);
  });

  it('leaves out placeholder rows like the profile patch does', () => {
    const summary = summarizeInterests([
      { id: 'food_other', name: 'Other' },
      { id: 'music_group_rock', name: 'Rock' },
    ]);
    assert.equal(summary.total, 0);
  });

  it('uses provider ids, then topics, for affiliations', () => {
    const summary = summarizeAffiliations([
      { source: 'provider', providerId: 'bitso.com', name: 'Bitso', categoryId: 'work' },
      { source: 'custom', name: 'Club Ñandú', categoryId: 'community' },
      { source: 'custom', name: '', categoryId: 'causes', topic: 'climate' },
      { source: 'custom', name: '', categoryId: 'causes' },
    ]);
    assert.deepEqual(summary.catalog, ['provider:bitso.com', 'topic:causes:climate']);
    assert.deepEqual(summary.custom, ['Club Ñandú']);
  });

  it('comparison form trims, collapses and unifies case, keeps synonyms apart', () => {
    assert.equal(normalizeForComparison('  Pick   Ball '), 'pick ball');
    assert.notEqual(normalizeForComparison('Footy'), normalizeForComparison('Soccer'));
  });
});

describe('person properties', () => {
  const doc = (extra: Record<string, unknown>) => ({
    mode: 'professional',
    profiles: { professional: { occupation: 'Engineer' }, personal: { occupation: 'Baker' } },
    ...extra,
  });

  it('reads only the active mode', () => {
    const { set } = buildPersonProperties(
      doc({
        professionalOnboardingInterests: [{ id: 'business_startups' }],
        personalOnboardingInterests: [{ id: 'food_vegan' }],
      }),
      null,
      NOW,
    );
    assert.equal(set.profile_type, 'professional');
    assert.equal(set.occupation, 'Engineer');
    assert.deepEqual(set.interests, ['business_startups']);
  });

  it('an empty bag clears; an absent bag is unknown', () => {
    const empty = buildPersonProperties(
      doc({ professionalOnboardingInterests: [] }),
      null,
      NOW,
    ).set;
    assert.deepEqual(empty.interests, []);
    assert.equal(empty.interests_count, 0);
    const absent = buildPersonProperties(doc({}), null, NOW).set;
    assert.equal('interests' in absent, false);
    assert.equal('interests_count' in absent, false);
    assert.equal('affiliations' in absent, false);
  });

  it('keeps original and normalized custom text in separate properties', () => {
    const { set } = buildPersonProperties(
      doc({
        professionalOnboardingInterests: [
          { id: 'custom_a_1', name: ' Pick  Ball ', isCustom: true },
          { id: 'custom_b_2', name: 'pick ball', isCustom: true },
        ],
      }),
      null,
      NOW,
    );
    assert.deepEqual(set.interests_custom, ['Pick  Ball', 'pick ball']);
    assert.deepEqual(set.interests_custom_normalized, ['pick ball']);
    assert.equal(set.interests_custom_count, 2);
  });

  it('flags limits instead of cutting silently', () => {
    const rows = Array.from({ length: PROFILE_LIST_MAX_ITEMS + 5 }, (_, i) => ({
      id: `music_${i}`,
    }));
    const { set } = buildPersonProperties(
      doc({ professionalOnboardingInterests: rows }),
      null,
      NOW,
    );
    assert.equal((set.interests as string[]).length, PROFILE_LIST_MAX_ITEMS);
    assert.equal(set.interests_catalog_count, PROFILE_LIST_MAX_ITEMS + 5);
    assert.equal(set.interests_truncated, true);
  });

  it('country_birth from birthCountryCode, country_live from chosen city only', () => {
    const { set, unset } = buildPersonProperties(
      doc({
        birthCountryCode: 'mx',
        residenceCountryCode: 'ES',
        lat: 19.4,
        lng: -99.1,
      }),
      null,
      NOW,
    );
    assert.equal(set.country_birth, 'MX');
    assert.equal('country_live' in set, false);
    assert.ok(unset.includes('country_live'));
    const withCity = buildPersonProperties(
      doc({
        currentCity: {
          id: '3688689',
          provider: 'geonames',
          name: 'Bogotá',
          countryCode: 'CO',
        },
      }),
      null,
      NOW,
    );
    assert.equal(withCity.set.country_live, 'CO');
    const malformed = buildPersonProperties(
      doc({ currentCity: { unexpected: true } }),
      null,
      NOW,
    );
    assert.equal('country_live' in malformed.set, false);
    assert.equal(malformed.unset.includes('country_live'), false);
  });

  it('languages stay stable codes as an array', () => {
    const { set } = buildPersonProperties(doc({ languageCodes: ['es', 'en'] }), null, NOW);
    assert.deepEqual(set.languages, ['es', 'en']);
  });

  it('never includes the excluded fields', () => {
    const { set } = buildPersonProperties(
      doc({ gender: 'x', seniority: 'y', industry: 'z' }),
      null,
      NOW,
    );
    for (const name of ['gender', 'seniority', 'industry', 'birthDate']) {
      assert.equal(name in set, false);
    }
  });

  it('sends properties before a mode exists, without mode fields', () => {
    const { set } = buildPersonProperties({ birthCountryCode: 'MX' }, null, NOW);
    assert.equal(set.country_birth, 'MX');
    assert.equal('profile_type' in set, false);
  });

  it('sends only changes, and each removal once', () => {
    const first = diffPersonProperties(
      {},
      { set: { profile_type: 'personal', languages: ['es'] }, unset: ['country_live'] },
    );
    assert.deepEqual(first.patch.unset, ['country_live']);
    const second = diffPersonProperties(first.next, {
      set: { profile_type: 'personal', languages: ['es', 'en'] },
      unset: ['country_live'],
    });
    assert.deepEqual(second.patch.set, { languages: ['es', 'en'] });
    assert.deepEqual(second.patch.unset, []);
  });

  it('recognizes writes that affect properties', () => {
    assert.equal(profileWriteAffectsAnalytics({ languageCodes: [] }), true);
    assert.equal(profileWriteAffectsAnalytics({ crjResumeStage: 'x' }), false);
    assert.equal(profileWriteAffectsAnalytics({ bgVisible: true }), false);
  });
});

describe('age_range', () => {
  const at = (birthDate: string) => computeAgeRange({ birthDate }, NOW);

  it('maps the approved ranges at their edges', () => {
    const cases: [string, string][] = [
      ['2008-11-06', '18-24'],
      ['2002-11-07', '18-24'],
      ['2001-11-06', '25-34'],
      ['1991-11-06', '35-44'],
      ['1981-11-06', '45-54'],
      ['1971-11-06', '55-64'],
      ['1961-11-06', '65+'],
    ];
    for (const [birthDate, range] of cases) {
      assert.deepEqual(at(birthDate), { status: 'valid', range }, birthDate);
    }
  });

  it('a minor is reported as below minimum, never as an adult', () => {
    assert.deepEqual(at('2008-11-07'), { status: 'below_minimum' });
    const { set, unset } = buildPersonProperties(
      { birthDate: '2010-01-01' },
      null,
      NOW,
    );
    assert.equal(set.age_range_status, 'below_minimum');
    assert.equal('age_range' in set, false);
    assert.ok(unset.includes('age_range'));
    assert.equal(JSON.stringify(set).includes('2010'), false);
  });

  it('a birth year alone reports only an unambiguous range', () => {
    assert.deepEqual(computeAgeRange({ birthYear: 1990 }, NOW), {
      status: 'valid',
      range: '35-44',
    });
    assert.deepEqual(computeAgeRange({ birthYear: 2001 }, NOW), { status: 'unknown' });
    assert.deepEqual(computeAgeRange({ birthYear: 2009 }, NOW), { status: 'below_minimum' });
  });

  it('missing or impossible dates are unknown', () => {
    assert.deepEqual(computeAgeRange({}, NOW), { status: 'unknown' });
    assert.deepEqual(at('2030-01-01'), { status: 'unknown' });
  });
});

describe('socials', () => {
  const links = {
    linkedin: 'https://www.linkedin.com/in/ann',
    twitter: 'https://x.com/ann',
    website: 'https://example.com',
    instagram: 'not a link at all $$',
    custom: [{ name: 'Mastodon', url: 'https://example.social/@ann' }],
  };

  it('counts valid links only, Website included, without duplicates', () => {
    const list = manualSocialPlatforms(links);
    assert.deepEqual(list, ['linkedin', 'x', 'website', 'custom']);
  });

  it('merges manual and verified and keeps the modality apart', () => {
    const { set } = buildPersonProperties(
      {
        mode: 'personal',
        socialLinksPersonal: {
          linkedin: 'https://www.linkedin.com/in/ann',
          youtube: 'https://www.youtube.com/@ann',
        },
      },
      { youtube: true, tiktok: true, instagram: false, x: false },
      NOW,
    );
    assert.deepEqual(set.socials_manual, ['linkedin', 'youtube']);
    assert.deepEqual(set.socials_verified, ['youtube', 'tiktok']);
    assert.deepEqual(set.socials_connected, ['linkedin', 'youtube', 'tiktok']);
    assert.equal(set.has_socials, true);
  });

  it('unknown verification never erases the connected list', () => {
    const { set } = buildPersonProperties(
      { mode: 'personal', socialLinksPersonal: {} },
      null,
      NOW,
    );
    assert.deepEqual(set.socials_manual, []);
    assert.equal('socials_connected' in set, false);
    assert.equal('has_socials' in set, false);
    assert.equal('socials_verified' in set, false);
  });

  it('no connection gives false', () => {
    const { set } = buildPersonProperties(
      { mode: 'personal' },
      { youtube: false, tiktok: false, instagram: false, x: false },
      NOW,
    );
    assert.deepEqual(set.socials_connected, []);
    assert.equal(set.has_socials, false);
  });

  it('only real additions are new links', () => {
    assert.deepEqual(
      newlyAddedManualSocials({}, { website: 'https://a.com' }),
      ['website'],
    );
    assert.deepEqual(
      newlyAddedManualSocials(
        { website: 'https://a.com' },
        { website: 'https://b.com' },
      ),
      [],
    );
    assert.deepEqual(newlyAddedManualSocials({ website: 'https://a.com' }, {}), []);
    assert.deepEqual(
      newlyAddedManualSocials(
        { custom: [{ name: 'A', url: 'https://a.com' }] },
        {
          custom: [
            { name: 'a ', url: 'https://other.com' },
            { name: 'B', url: 'https://b.com' },
          ],
        },
      ),
      ['custom'],
    );
  });
});

describe('location permission events', () => {
  function harness(initial: LocationPermissionReadings) {
    let readings = initial;
    const events: [string, boolean][] = [];
    const states: LocationPermissionReadings[] = [];
    const observer = createLocationPermissionObserver({
      store: memoryStore(),
      read: async () => readings,
      onChange: (kind, granted) => events.push([kind, granted]),
      onState: (state) => states.push(state),
    });
    return {
      observer,
      events,
      states,
      set: (next: LocationPermissionReadings) => {
        readings = next;
      },
    };
  }
  const state = (fg: boolean, fgDecided: boolean, bg: boolean, bgDecided: boolean) => ({
    foreground: { granted: fg, decided: fgDecided },
    background: { granted: bg, decided: bgDecided },
  });

  it('first observation of an existing install only stores a baseline', async () => {
    const h = harness(state(true, true, false, true));
    await h.observer.observe(null);
    assert.deepEqual(h.events, []);
    assert.equal(h.states.length, 1);
  });

  it('reports a request that resolves, granted or denied', async () => {
    const h = harness(state(false, false, false, false));
    await h.observer.observe(null);
    h.set(state(false, true, false, false));
    await h.observer.observe('foreground');
    assert.deepEqual(h.events, [['foreground', false]]);
  });

  it('reports foreground and background separately', async () => {
    const h = harness(state(false, false, false, false));
    await h.observer.observe(null);
    h.set(state(true, true, false, false));
    await h.observer.observe('foreground');
    h.set(state(true, true, true, true));
    await h.observer.observe('background');
    assert.deepEqual(h.events, [
      ['foreground', true],
      ['background', true],
    ]);
  });

  it('reports a change on return from Settings, once', async () => {
    const h = harness(state(true, true, true, true));
    await h.observer.observe(null);
    h.set(state(true, true, false, true));
    await h.observer.observe(null);
    await h.observer.observe(null);
    assert.deepEqual(h.events, [['background', false]]);
  });

  it('repeated observation with no change emits nothing', async () => {
    const h = harness(state(true, true, false, true));
    await h.observer.observe('foreground');
    h.events.length = 0;
    await h.observer.observe('foreground');
    await h.observer.observe(null);
    assert.deepEqual(h.events, []);
  });

  it('a failing read never throws', async () => {
    const observer = createLocationPermissionObserver({
      store: null,
      read: async () => {
        throw new Error('no module');
      },
      onChange: () => assert.fail('no event'),
      onState: () => assert.fail('no state'),
    });
    await observer.observe(null);
  });
});

describe('discovery measurement', () => {
  it('one entry, one event; refreshes do not count', () => {
    const tracker = createDiscoveryEntryTracker();
    assert.equal(tracker.consumeSuccess(), true);
    assert.equal(tracker.consumeSuccess(), false);
  });

  it('an error keeps the entry waiting for a real result', () => {
    const tracker = createDiscoveryEntryTracker();
    tracker.onFocus();
    assert.equal(tracker.consumeSuccess(), true);
  });

  it('coming back from a profile is the same entry', () => {
    const tracker = createDiscoveryEntryTracker();
    tracker.consumeSuccess();
    tracker.onOpenChild();
    tracker.onFocus();
    assert.equal(tracker.consumeSuccess(), false);
  });

  it('returning from another tab is a new entry', () => {
    const tracker = createDiscoveryEntryTracker();
    tracker.consumeSuccess();
    tracker.onFocus();
    assert.equal(tracker.consumeSuccess(), true);
  });

  it('applies the approved score ranges', () => {
    assert.equal(matchScoreRange(0), '0-50');
    assert.equal(matchScoreRange(49), '0-50');
    assert.equal(matchScoreRange(50), '50-75');
    assert.equal(matchScoreRange(74), '50-75');
    assert.equal(matchScoreRange(75), '75-100');
    assert.equal(matchScoreRange(100), '75-100');
    assert.equal(matchScoreRange(101), null);
    assert.equal(matchScoreRange(-1), null);
  });

  it('absent score adds no properties', () => {
    assert.deepEqual(buildScoreProperties(undefined), {});
    assert.deepEqual(buildScoreProperties(null), {});
    assert.deepEqual(buildScoreProperties(0), {
      match_score: 0,
      match_score_range: '0-50',
    });
  });

  it('match dedupe is per viewer, profile and session', () => {
    const dedupe = createMatchSessionDedupe();
    assert.equal(dedupe.claim('s1', 'a', 'x'), true);
    assert.equal(dedupe.claim('s1', 'a', 'x'), false);
    assert.equal(dedupe.claim('s1', 'a', 'y'), true);
    assert.equal(dedupe.claim('s1', 'b', 'x'), true);
    assert.equal(dedupe.claim('s2', 'a', 'x'), true);
  });
});

describe('push open coordinator', () => {
  const response = (identifier: string, data: unknown) => ({
    notification: { request: { identifier, content: { data } } },
  });
  const payload = { kind: 'contact_nearby', actorUid: 'actor1', motive: 'interest' };

  function harness() {
    let ready = false;
    let nowMs = 1000;
    const opened: unknown[] = [];
    const navigated: string[] = [];
    const coordinator = createPushOpenCoordinator({
      canNavigate: () => ready,
      navigateToProfile: (uid) => navigated.push(uid),
      onAlertOpened: (target) => opened.push(target),
      now: () => nowMs,
    });
    return {
      coordinator,
      opened,
      navigated,
      setReady: (value: boolean) => {
        ready = value;
      },
      advance: (ms: number) => {
        nowMs += ms;
      },
    };
  }

  it('listener plus launch response is one tap', () => {
    const h = harness();
    h.setReady(true);
    h.coordinator.handleResponse(response('n1', payload));
    h.coordinator.handleResponse(response('n1', payload));
    assert.equal(h.opened.length, 1);
    assert.deepEqual(h.navigated, ['actor1']);
  });

  it('cold start waits until navigation can show the profile', () => {
    const h = harness();
    h.coordinator.handleResponse(response('n1', payload));
    assert.deepEqual(h.navigated, []);
    assert.equal(h.opened.length, 1);
    h.coordinator.flush();
    assert.deepEqual(h.navigated, []);
    h.setReady(true);
    h.coordinator.flush();
    h.coordinator.flush();
    assert.deepEqual(h.navigated, ['actor1']);
  });

  it('a stale destination is dropped', () => {
    const h = harness();
    h.coordinator.handleResponse(response('n1', payload));
    h.advance(PUSH_NAVIGATION_PENDING_TTL_MS + 1);
    h.setReady(true);
    h.coordinator.flush();
    assert.deepEqual(h.navigated, []);
  });

  it('sign-out clears the destination', () => {
    const h = harness();
    h.coordinator.handleResponse(response('n1', payload));
    h.coordinator.clearPending();
    h.setReady(true);
    h.coordinator.flush();
    assert.deepEqual(h.navigated, []);
  });

  it('tolerates old payloads and invents no alertId', () => {
    assert.deepEqual(parsePushOpenTarget({ actorUid: 'old' }), { actorUid: 'old' });
    const target = parsePushOpenTarget({ ...payload, alertId: ' a-9 ' });
    assert.equal(target.alertId, 'a-9');
    assert.equal('alertId' in parsePushOpenTarget(payload), false);
  });

  it('other pushes neither navigate nor count', () => {
    const h = harness();
    h.setReady(true);
    h.coordinator.handleResponse(response('n2', { kind: 'other' }));
    h.coordinator.handleResponse(response('n3', null));
    h.coordinator.handleResponse(null);
    h.coordinator.handleResponse({});
    assert.equal(h.opened.length, 0);
    assert.deepEqual(h.navigated, []);
  });

  it('a second distinct tap is processed', () => {
    const h = harness();
    h.setReady(true);
    h.coordinator.handleResponse(response('n1', payload));
    h.coordinator.handleResponse(response('n2', payload));
    assert.equal(h.opened.length, 2);
  });
});

describe('campaign link parser', () => {
  const HOSTS = ['go.example.com'];
  const parse = (url: unknown) => parseCampaignLink(url, HOSTS, 5);

  it('maps channel, campaign, piece and tool', () => {
    assert.deepEqual(
      parse(
        'https://GO.example.com/c/x?utm_medium=Email&utm_source=mailchimp&utm_campaign=altercall_summit_2026&utm_content=hero%20a#frag',
      ),
      {
        source: 'email',
        campaign: 'altercall_summit_2026',
        tool: 'mailchimp',
        method: 'universal_link',
        capturedAtMs: 5,
      },
    );
  });

  it('is separate from OAuth returns and other links', () => {
    for (const url of [
      'nearsy://oauth2redirect?utm_campaign=a',
      'nearsy://linkedin-auth?code=x&utm_medium=email',
      'com.googleusercontent.apps.123:/oauth?utm_medium=email',
      'http://go.example.com/c/x?utm_medium=email',
      'https://evil.example.net/c/x?utm_medium=email',
      'https://go.example.com.evil.net/c/x?utm_medium=email',
      'https://user@go.example.com/c/x?utm_medium=email',
      'https://go.example.com/legal?utm_medium=email',
      'https://go.example.com/auth/callback?code=secret&utm_medium=email',
      'https://go.example.com/c/x',
      'https://go.example.com/c/x?foo=bar',
      null,
      42,
      '',
    ]) {
      assert.equal(parse(url), null, String(url));
    }
  });

  it('refuses values that are conclusions or personal data', () => {
    assert.equal(parse('https://go.example.com/c/x?utm_medium=organic'), null);
    assert.equal(parse('https://go.example.com/c/x?utm_medium=unknown'), null);
    assert.equal(parse('https://go.example.com/c/x?utm_medium=jane%40example.com'), null);
    assert.equal(parse('https://go.example.com/c/x?utm_medium=a%20b'), null);
    assert.equal(parse('https://go.example.com/c/x?utm_medium=%E0%A4%A'), null);
    assert.equal(parse(`https://go.example.com/c/x?utm_medium=${'a'.repeat(70)}`), null);
  });

  it('keeps no URL, only validated fields', () => {
    const parsed = parse(
      'https://go.example.com/c/x?utm_campaign=spring&token=SECRET&email=a@b.co',
    );
    assert.deepEqual(Object.keys(parsed ?? {}).sort(), [
      'campaign',
      'capturedAtMs',
      'method',
    ]);
    assert.equal(JSON.stringify(parsed).includes('SECRET'), false);
  });

  it('a very long URL is refused', () => {
    assert.equal(parse(`https://go.example.com/c/x?utm_medium=a&p=${'x'.repeat(3000)}`), null);
  });
});

describe('pending attribution store', () => {
  it('is single use and survives a restart', async () => {
    const store = memoryStore();
    const first = createPendingAttributionStore(store);
    await first.save({ campaign: 'c', method: 'universal_link', capturedAtMs: 1 });
    const restart = createPendingAttributionStore(store);
    assert.equal((await restart.take(2))?.campaign, 'c');
    assert.equal(await restart.take(2), null);
  });

  it('survives corrupt storage', async () => {
    const store = memoryStore();
    await store.setItem('nearsy.analytics.pendingAttribution.v1', '{nope');
    assert.equal(await createPendingAttributionStore(store).take(1), null);
  });
});

describe('attribution classification', () => {
  const created = '2026-11-06T00:00:00Z';
  const base = Date.parse(created);

  it('fresh account with nothing recorded is late acquisition', () => {
    assert.equal(
      classifyAttributionAccess({
        creationTime: created,
        nowMs: base + 3600000,
        acquisitionAlreadyRecorded: false,
      }),
      'late_acquisition',
    );
  });

  it('old accounts, recorded acquisition and unknown dates are access', () => {
    assert.equal(
      classifyAttributionAccess({
        creationTime: created,
        nowMs: base + 2 * 86400000,
        acquisitionAlreadyRecorded: false,
      }),
      'campaign_access',
    );
    assert.equal(
      classifyAttributionAccess({
        creationTime: created,
        nowMs: base + 1000,
        acquisitionAlreadyRecorded: true,
      }),
      'campaign_access',
    );
    assert.equal(
      classifyAttributionAccess({
        creationTime: null,
        nowMs: base,
        acquisitionAlreadyRecorded: false,
      }),
      'campaign_access',
    );
  });
});

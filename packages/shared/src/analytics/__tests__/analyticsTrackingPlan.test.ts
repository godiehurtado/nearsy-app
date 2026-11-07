import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import {
  campaignAccessedProperties,
  createCampaignTouchStore,
  isEstablishedAccount,
  parseCampaignLink,
  parseInstallReferrer,
  resolveAttributionSettings,
  signupAttributionProperties,
} from '../analyticsAttribution.ts';
import { knownCompatibilityScore } from '../analyticsCompatibility.ts';
import {
  resolveAnalyticsConfig,
  resolveAppOpenedMinBackgroundMs,
  resolveSmokeDistinctId,
  SMOKE_DISTINCT_ID_PREFIX,
} from '../analyticsConfig.ts';
import {
  ANALYTICS_EVENTS,
  describeForInspection,
  isAllowedOutgoingEvent,
  matchScoreRange,
  sanitizeOutgoingEvent,
  scoreProperties,
} from '../analyticsContract.ts';
import { createAnalyticsSession, type AnalyticsTransport } from '../analyticsCore.ts';
import {
  createDiscoveryEntryTracker,
  createLocationPermissionObserver,
  createVisibilityObserver,
} from '../analyticsObservers.ts';
import {
  buildOnboardingStepProperties,
  createOnboardingMilestoneTracker,
} from '../analyticsOnboarding.ts';
import { buildPersonProperties, computeAgeRange } from '../analyticsPersonProperties.ts';
import {
  listProperties,
  MAX_ANALYTICS_LIST_ITEMS,
  MAX_ANALYTICS_TEXT_LENGTH,
  normalizeCustomText,
  splitAffiliations,
  splitInterests,
} from '../analyticsProfileLists.ts';
import { describeInterceptedRequest, isOutboundEventPath } from '../analyticsSdkTransport.ts';
import {
  createPendingVerificationMarkers,
  createVerifiedSocialTracker,
  readManualPlatforms,
  socialProperties,
  toSocialPlatformName,
} from '../analyticsSocial.ts';
import { createAppOpenedTracker, OWN_FLOW_MAX_AWAY_MS } from '../appOpenedTracker.ts';
import {
  readLinkedinNewAccountSignal,
  LINKEDIN_NEW_ACCOUNT_FIELD,
} from '../linkedinNewAccountSignal.ts';
import {
  isLocationRequestInFlight,
  setLocationRequestListener,
  setOwnExternalFlowListener,
  withLocationPermissionRequest,
  withOwnExternalFlow,
} from '../ownExternalFlow.ts';
import {
  createPushOpenCoordinator,
  isRouteReachable,
  parsePushResponse,
  PUSH_OPEN_MAX_WAIT_MS,
} from '../pushOpenCoordinator.ts';

const here = dirname(fileURLToPath(import.meta.url));
const src = (path: string) => readFileSync(join(here, '..', '..', path), 'utf8');
const require = createRequire(import.meta.url);

const DEV_CLIENT = {
  nearsyFirebaseEnv: 'development',
  nearsyFirebaseProjectId: 'nearsy-dev',
  nearsyDevClient: true,
};
const SMOKE = {
  enabled: true,
  token: 'phc_abcdefghijklmnopqrstuvwxyz',
  syntheticEmailSuffix: '@nearsy-smoke.test',
};

describe('test modes', () => {
  it('nothing is enabled when the build sets no variable', () => {
    const { resolveAnalyticsExtras, resolveAppLinkIntentFilters } = require(
      '../../../../../apps/nearsy-android/plugins/analyticsBuildConfig.js',
    );
    assert.deepEqual(resolveAnalyticsExtras({}), {
      enabled: false,
      attribution: { installReferrerEnabled: false },
    });
    assert.deepEqual(resolveAppLinkIntentFilters({}), []);
  });

  it('sdk_intercept needs a dev client on the development Firebase', () => {
    const extras = { ...DEV_CLIENT, nearsyAnalytics: { sdkIntercept: true } };
    assert.equal(resolveAnalyticsConfig({ extras, isDev: true }).mode, 'sdk_intercept');
    assert.equal(
      resolveAnalyticsConfig({
        extras: { ...extras, nearsyFirebaseEnv: 'production' },
        isDev: true,
      }).mode,
      'inspect',
    );
    assert.equal(
      resolveAnalyticsConfig({ extras: { ...extras, nearsyDevClient: false }, isDev: true }).mode,
      'inspect',
    );
    assert.equal(resolveAnalyticsConfig({ extras, isDev: false }).mode, 'off');
  });

  it('interception wins over smoke: when both are set nothing leaves', () => {
    const extras = {
      ...DEV_CLIENT,
      nearsyAnalytics: { sdkIntercept: true, smoke: SMOKE },
    };
    assert.equal(
      resolveAnalyticsConfig({ extras, isDev: true, runtimeFirebaseProjectId: 'nearsy-dev' }).mode,
      'sdk_intercept',
    );
  });

  it('smoke is off by default and needs nearsy-dev at runtime', () => {
    const extras = { ...DEV_CLIENT, nearsyAnalytics: { smoke: SMOKE } };
    const resolve = (over: object, project: unknown = 'nearsy-dev', isDev = true) =>
      resolveAnalyticsConfig({
        extras: { ...extras, ...over },
        isDev,
        runtimeFirebaseProjectId: project,
      }).mode;
    assert.equal(resolve({}), 'smoke');
    assert.equal(resolve({ nearsyAnalytics: {} }), 'inspect');
    assert.equal(resolve({}, 'nearsy-pj'), 'inspect');
    assert.equal(resolve({}, null), 'inspect');
    assert.equal(resolve({ nearsyFirebaseProjectId: 'nearsy-pj' }), 'inspect');
    assert.equal(resolve({}, 'nearsy-dev', false), 'off');
  });

  it('smoke rejects a suffix that could match real mail', () => {
    for (const syntheticEmailSuffix of ['@gmail.com', '+qa@gmail.com', '', 'test', '@corp.com']) {
      const extras = {
        ...DEV_CLIENT,
        nearsyAnalytics: { smoke: { ...SMOKE, syntheticEmailSuffix } },
      };
      assert.equal(
        resolveAnalyticsConfig({ extras, isDev: true, runtimeFirebaseProjectId: 'nearsy-dev' }).mode,
        'inspect',
      );
    }
  });

  it('smoke identity is separate and only for synthetic accounts', () => {
    assert.equal(
      resolveSmokeDistinctId({ uid: 'u1', email: 'qa1@nearsy-smoke.test' }, '@nearsy-smoke.test'),
      `${SMOKE_DISTINCT_ID_PREFIX}u1`,
    );
    assert.equal(
      resolveSmokeDistinctId({ uid: 'u1', email: 'person@gmail.com' }, '@nearsy-smoke.test'),
      null,
    );
    assert.equal(resolveSmokeDistinctId({ uid: 'u1' }, '@nearsy-smoke.test'), null);
  });

  it('a token enters the config only when its mode can resolve', () => {
    const { resolveAnalyticsExtras } = require(
      '../../../../../apps/nearsy-android/plugins/analyticsBuildConfig.js',
    );
    const tokens = {
      NEARSY_POSTHOG_TOKEN: 'phc_should_not_appear',
      NEARSY_ANALYTICS_SMOKE_TOKEN: 'phc_should_not_appear',
    };
    for (const env of [
      tokens,
      { ...tokens, NEARSY_ANALYTICS_ENABLED: 'true', NEARSY_ANALYTICS_ENV: 'preview' },
      { ...tokens, NEARSY_ANALYTICS_SMOKE_ENABLED: 'true' },
      { ...tokens, NEARSY_ANALYTICS_SMOKE_ENABLED: 'true', NEARSY_DEV_CLIENT: 'true' },
    ]) {
      assert.ok(!JSON.stringify(resolveAnalyticsExtras(env)).includes('phc_'));
    }
  });

  it('App Links need an exact host and a dedicated prefix', () => {
    const { resolveAppLinkIntentFilters } = require(
      '../../../../../apps/nearsy-android/plugins/analyticsBuildConfig.js',
    );
    for (const env of [
      { NEARSY_APP_LINKS_HOST: 'links.example.test' },
      { NEARSY_APP_LINKS_PATH_PREFIX: '/c' },
      { NEARSY_APP_LINKS_HOST: 'links.example.test', NEARSY_APP_LINKS_PATH_PREFIX: '/' },
      { NEARSY_APP_LINKS_HOST: '*.example.test', NEARSY_APP_LINKS_PATH_PREFIX: '/c' },
    ]) {
      assert.deepEqual(resolveAppLinkIntentFilters(env), []);
    }
    const [filter] = resolveAppLinkIntentFilters({
      NEARSY_APP_LINKS_HOST: 'links.example.test',
      NEARSY_APP_LINKS_PATH_PREFIX: '/c',
    });
    assert.equal(filter.autoVerify, true);
    assert.deepEqual(filter.data, [
      { scheme: 'https', host: 'links.example.test', pathPrefix: '/c' },
    ]);
  });
});

describe('smoke identity in the session', () => {
  function makeSession(user: { uid: string; email?: string } | null) {
    const calls: string[] = [];
    const auth = { user };
    const transport: AnalyticsTransport = {
      getIdentifiedDistinctId: () => null,
      getSessionId: () => 's1',
      identify: (id) => void calls.push(`identify:${id}`),
      setPersonProperties: () => void calls.push('set'),
      reset: () => void calls.push('reset'),
      register: () => {},
      capture: (event) => void calls.push(`capture:${event}`),
    };
    const session = createAnalyticsSession({
      loadTransport: async () => transport,
      getAuthUser: () => auth.user,
      readCreationTime: () => undefined,
      buildBaseProperties: () => ({}),
      buildProfileProperties: () => ({}),
      superProperties: {},
      now: () => 0,
      requirePerson: true,
      distinctIdFor: (next) => resolveSmokeDistinctId(next, '@nearsy-smoke.test'),
    });
    return { auth, calls, session };
  }

  it('a synthetic account is sent under the separate id', async () => {
    const { calls, session } = makeSession({ uid: 'u1', email: 'a@nearsy-smoke.test' });
    session.trackAppOpened();
    session.trackSignupCompleted('u1');
    await session.settled();
    assert.deepEqual(calls, [
      `identify:${SMOKE_DISTINCT_ID_PREFIX}u1`,
      'capture:app_opened',
      'capture:signup_completed',
    ]);
  });

  it('a real account sends nothing at all', async () => {
    const { calls, session } = makeSession({ uid: 'u1', email: 'person@gmail.com' });
    session.trackAppOpened();
    session.trackSignupCompleted('u1');
    session.syncPersonProfile('u1', {});
    await session.settled();
    assert.deepEqual(calls, []);
  });

  it('nothing is sent while signed out', async () => {
    const { calls, session } = makeSession(null);
    session.trackAppOpened();
    await session.settled();
    assert.deepEqual(calls, []);
  });
});

describe('outgoing filter', () => {
  it('every contract event passes, nothing else does', () => {
    for (const event of ANALYTICS_EVENTS) assert.equal(isAllowedOutgoingEvent(event), true);
    assert.ok(ANALYTICS_EVENTS.includes('match_made'));
    for (const event of ['$screen', '$exception', 'Application Opened', 'alert_sent', 'event_cohort']) {
      assert.equal(isAllowedOutgoingEvent(event), false);
    }
  });

  it('keeps SDK and technical keys, drops anything the event does not list', () => {
    const out = sanitizeOutgoingEvent({
      event: 'match_made',
      properties: {
        $session_id: 'kept',
        platform: 'Android',
        score: 80,
        peer_uid: 'must-not-leave',
        email: 'must-not-leave',
      },
    }) as { properties: Record<string, unknown> };
    assert.deepEqual(Object.keys(out.properties).sort(), ['$session_id', 'platform', 'score']);
  });

  it('person updates keep their shape', () => {
    const event = { event: '$set', properties: { $set: { email: 'x' } } };
    assert.equal(sanitizeOutgoingEvent(event), event);
  });

  it('no event carries the other person', () => {
    const contract = src('analytics/analyticsContract.ts');
    assert.ok(!/peer_uid|actor_uid|other_uid|target_uid|match_id/.test(contract));
  });

  it('the inspection view hides free text', () => {
    const view = describeForInspection({
      email: 'a@b.test',
      occupation: 'x',
      interests_custom: ['text'],
      country_birth: 'MX',
      score: 80,
    });
    assert.equal(view.email, '<redacted>');
    assert.equal(view.occupation, '<redacted>');
    assert.equal(view.interests_custom, '<1 items>');
    assert.equal(view.country_birth, '<redacted>');
    assert.equal(view.score, 80);
  });

  it('only event batches may leave', () => {
    assert.equal(isOutboundEventPath('https://us.i.posthog.com/batch/'), true);
    assert.equal(isOutboundEventPath('https://us-assets.i.posthog.com/array/t/config'), false);
    assert.equal(isOutboundEventPath('https://us.i.posthog.com/flags/?v=2'), false);
  });

  it('the interception record holds names, never values', () => {
    const request = describeInterceptedRequest('https://x.invalid/batch/', {
      body: JSON.stringify({
        api_key: 'phc_secret',
        batch: [
          {
            event: '$set',
            distinct_id: 'uid-1',
            properties: { $set: { email: 'a@b.test' }, score: 1 },
          },
        ],
      }),
    });
    const text = JSON.stringify(request);
    for (const value of ['phc_secret', 'uid-1', 'a@b.test']) {
      assert.ok(!text.includes(value));
    }
    assert.deepEqual(request.events[0].personKeys, ['email']);
  });
});

describe('app_opened rule', () => {
  function make(min?: number) {
    let now = 1_000;
    let opens = 0;
    const tracker = createAppOpenedTracker({
      now: () => now,
      emit: () => {
        opens += 1;
      },
      minBackgroundMs: min,
    });
    tracker.noteAuthReady();
    tracker.noteAppState('active');
    return {
      tracker,
      advance: (ms: number) => {
        now += ms;
      },
      opens: () => opens,
    };
  }

  it('the threshold is configurable and defaults to 30 seconds', () => {
    assert.equal(resolveAppOpenedMinBackgroundMs({}), 30_000);
    assert.equal(
      resolveAppOpenedMinBackgroundMs({ nearsyAnalytics: { appOpenedMinBackgroundSec: 60 } }),
      60_000,
    );
    for (const bad of [-1, 'x', Number.NaN, 99_999]) {
      assert.equal(
        resolveAppOpenedMinBackgroundMs({ nearsyAnalytics: { appOpenedMinBackgroundSec: bad } }),
        30_000,
      );
    }
    const { tracker, advance, opens } = make(60_000);
    tracker.noteAppState('background');
    advance(45_000);
    tracker.noteAppState('active');
    assert.equal(opens(), 1);
  });

  it('a long own flow does not count as an open', () => {
    const { tracker, advance, opens } = make();
    const end = tracker.beginOwnFlow();
    tracker.noteAppState('background');
    advance(120_000);
    end();
    tracker.noteAppState('active');
    assert.equal(opens(), 1);
  });

  it('Settings, launched just before the pause, counts as an own flow', () => {
    const { tracker, advance, opens } = make();
    tracker.beginOwnFlow()();
    advance(500);
    tracker.noteAppState('background');
    advance(120_000);
    tracker.noteAppState('active');
    assert.equal(opens(), 1);
  });

  it('an abandoned own flow does not hide a real later open', () => {
    const { tracker, advance, opens } = make();
    const end = tracker.beginOwnFlow();
    tracker.noteAppState('background');
    advance(OWN_FLOW_MAX_AWAY_MS + 1);
    tracker.noteAppState('active');
    end();
    assert.equal(opens(), 2);
  });

  it('leaving after the flow ended counts normally', () => {
    const { tracker, advance, opens } = make();
    tracker.beginOwnFlow()();
    advance(10_000);
    tracker.noteAppState('background');
    advance(40_000);
    tracker.noteAppState('active');
    assert.equal(opens(), 2);
  });

  it('the wrappers keep the result and the rejection of the product call', async () => {
    let ended = 0;
    setOwnExternalFlowListener(() => () => {
      ended += 1;
    });
    try {
      assert.equal(await withOwnExternalFlow(() => 7), 7);
      await assert.rejects(
        withOwnExternalFlow(async () => {
          throw new Error('denied');
        }),
        /denied/,
      );
      assert.equal(ended, 2);
    } finally {
      setOwnExternalFlowListener(null);
    }
  });

  it('a failing analytics listener does not touch the product call', async () => {
    setOwnExternalFlowListener(() => {
      throw new Error('analytics');
    });
    setLocationRequestListener(() => {
      throw new Error('analytics');
    });
    try {
      assert.equal(await withOwnExternalFlow(() => 1), 1);
      const result = await withLocationPermissionRequest('foreground', () => ({
        status: 'granted',
      }));
      assert.equal(result.status, 'granted');
    } finally {
      setOwnExternalFlowListener(null);
      setLocationRequestListener(null);
    }
  });
});

describe('onboarding milestones', () => {
  it('numbers follow the plan', () => {
    const numbers = [
      buildOnboardingStepProperties({ step: 'profile_type', profileType: 'personal' }),
      buildOnboardingStepProperties({ step: 'basics' }),
      buildOnboardingStepProperties({ step: 'about' }),
      buildOnboardingStepProperties({ step: 'affiliations', selected: [] }),
      buildOnboardingStepProperties({ step: 'interests', selected: [] }),
      buildOnboardingStepProperties({ step: 'socials', manualValues: [] }),
    ].map((props) => [props.step_name, props.step_number]);
    assert.deepEqual(numbers, [
      ['profile_type', 1],
      ['basics', 2],
      ['about', 3],
      ['affiliations', 4],
      ['interests', 5],
      ['socials', 6],
    ]);
  });

  it('skipped means no content; partial keeps its amounts', () => {
    assert.equal(
      buildOnboardingStepProperties({ step: 'affiliations', selected: [] }).skipped,
      true,
    );
    const partial = buildOnboardingStepProperties({
      step: 'affiliations',
      selected: [
        { id: 'p1', source: 'provider', providerId: 'p1', name: 'A' },
        { id: 'custom_family_x', source: 'custom', name: 'B' },
      ],
    });
    assert.equal(partial.skipped, false);
    assert.equal(partial.item_count, 2);
    assert.equal(partial.catalog_count, 1);
    assert.equal(partial.custom_count, 1);
  });

  it('socials count manual and verified; an unknown verified count is omitted', () => {
    const unknown = buildOnboardingStepProperties({
      step: 'socials',
      manualValues: ['https://a.test', '', '  '],
    });
    assert.equal(unknown.manual_count, 1);
    assert.equal('verified_count' in unknown, false);
    const verifiedOnly = buildOnboardingStepProperties(
      { step: 'socials', manualValues: [] },
      2,
    );
    assert.equal(verifiedOnly.skipped, false);
    assert.equal(verifiedOnly.verified_count, 2);
  });

  it('rerenders, back and forward do not repeat a milestone', () => {
    const tracker = createOnboardingMilestoneTracker();
    assert.equal(tracker.claim('u', 'about'), true);
    assert.equal(tracker.claim('u', 'about'), false);
    assert.equal(tracker.claim('other', 'about'), true);
  });

  it('resuming does not invent earlier milestones or let them fire again', () => {
    const tracker = createOnboardingMilestoneTracker();
    tracker.noteResumeAt('u', 'interest');
    for (const step of ['profile_type', 'basics', 'about', 'affiliations'] as const) {
      assert.equal(tracker.claim('u', step), false);
    }
    assert.equal(tracker.claim('u', 'interests'), true);
  });

  it('basics completes at the photo, about at details, with no resume cursor involved', () => {
    const source = src('screens/ProfileCompletionScreen.tsx');
    const after = (save: string, step: string) => {
      const start = source.indexOf(`await ${save}();`);
      const track = source.indexOf(`step: '${step}'`, start);
      const next = source.indexOf('commitStepIndex', start);
      assert.ok(start > 0 && track > start && track < next, `${step} after ${save}`);
    };
    after('persistPhoto', 'basics');
    after('persistDetails', 'about');
    assert.ok(!/trackOnboardingStep[^;]*androidCrjResume/.test(source));
  });
});

describe('profile lists', () => {
  const interests = [
    { id: 'music_rock', name: 'Rock', categoryId: 'music' },
    { id: 'music_rock', name: 'Rock', categoryId: 'music' },
    { id: 'music_other', name: 'Other', categoryId: 'music' },
    { id: 'music_group_live', name: 'Live', categoryId: 'music' },
    { id: 'custom_music_my_secret_band_17', name: '  My  Secret BAND ', isCustom: true },
  ];

  it('a custom id with typed text never counts as catalog', () => {
    const props = listProperties('interests', splitInterests(interests));
    assert.deepEqual(props.interests, ['music_rock']);
    assert.ok(!JSON.stringify(props.interests).includes('secret'));
    assert.deepEqual(props.interests_custom, ['My  Secret BAND']);
    assert.deepEqual(props.interests_custom_normalized, ['my secret band']);
    assert.equal(props.interests_count, 2);
    assert.equal(props.interests_catalog_count, 1);
    assert.equal(props.interests_custom_count, 1);
  });

  it('a custom id is custom even without its marker', () => {
    const split = splitAffiliations([{ id: 'custom_community_my_club', name: 'My Club' }]);
    assert.deepEqual(split, { catalog: [], custom: ['My Club'] });
  });

  it('a provider row uses the stable provider id', () => {
    const split = splitAffiliations([
      { id: 'row-1', providerId: 'q123', source: 'provider', name: 'Acme' },
    ]);
    assert.deepEqual(split.catalog, ['q123']);
  });

  it('normalization does not merge synonyms', () => {
    assert.equal(normalizeCustomText(' Rock   Music '), 'rock music');
    assert.notEqual(normalizeCustomText('Cine'), normalizeCustomText('Películas'));
  });

  it('limits shape the payload, counts stay real', () => {
    const many = Array.from({ length: MAX_ANALYTICS_LIST_ITEMS + 5 }, (_, i) => ({
      id: `custom_x_${i}`,
      name: `${'n'.repeat(MAX_ANALYTICS_TEXT_LENGTH + 10)}${i}`,
      isCustom: true,
    }));
    const props = listProperties('interests', splitInterests(many));
    assert.equal((props.interests_custom as string[]).length, MAX_ANALYTICS_LIST_ITEMS);
    assert.equal((props.interests_custom as string[])[0].length, MAX_ANALYTICS_TEXT_LENGTH);
    assert.equal(props.interests_custom_count, MAX_ANALYTICS_LIST_ITEMS + 5);
  });
});

describe('approved person properties', () => {
  const build = (doc: unknown, verified?: string[]) =>
    buildPersonProperties({
      doc,
      authEmail: 'a@b.test',
      normalizeLanguages: (values) => values as string[],
      verifiedSocialsFor: () => verified,
      now: new Date(2026, 10, 6),
    });

  it('reads the active mode only', () => {
    const props = build({
      mode: 'professional',
      personalOnboardingInterests: [{ id: 'personal_one' }],
      professionalOnboardingInterests: [{ id: 'pro_one' }],
      professionalOnboardingAffiliations: [],
    });
    assert.deepEqual(props?.interests, ['pro_one']);
    assert.deepEqual(props?.affiliations, []);
    assert.equal(props?.affiliations_count, 0);
  });

  it('confirmed empty clears; unknown stays out', () => {
    const empty = build({
      mode: 'personal',
      personalOnboardingInterests: [],
      birthCountryCode: '',
      currentCity: null,
      languageCodes: [],
    });
    assert.deepEqual(empty?.interests, []);
    assert.equal(empty?.country_birth, null);
    assert.equal(empty?.country_live, null);
    assert.deepEqual(empty?.languages, []);
    const unknown = build({ mode: 'personal' }) ?? {};
    for (const key of ['country_birth', 'country_live', 'age_range', 'languages']) {
      assert.equal(key in unknown, false, key);
    }
    const noMode = build({}) ?? {};
    for (const key of ['interests', 'affiliations', 'social_platforms_manual']) {
      assert.equal(key in noMode, false, key);
    }
  });

  it('a mode switch clears the lists of the previous mode', () => {
    const props = build({
      mode: 'professional',
      personalOnboardingInterests: [{ id: 'personal_one' }],
      personalOnboardingAffiliations: [{ id: 'p1', source: 'provider' }],
      socialLinksPersonal: { website: 'https://me.test' },
    });
    assert.deepEqual(props?.interests, []);
    assert.equal(props?.interests_count, 0);
    assert.deepEqual(props?.affiliations, []);
    assert.deepEqual(props?.social_platforms_manual, []);
  });

  it('legacy rows are unknown, not empty', () => {
    const props = build({
      mode: 'personal',
      personalInterests: ['Rock'],
      personalOnboardingAffiliations: [],
      personalAffiliations: [{ category: 'x', label: 'Club' }],
    }) ?? {};
    assert.equal('interests' in props, false);
    assert.equal('affiliations' in props, false);
  });

  it('country_live is the declared city, never another source', () => {
    const props = build({
      birthCountryCode: 'mx',
      currentCity: { id: '1', provider: 'geonames', name: 'X', countryCode: 'us' },
      location: { countryCode: 'FR' },
      lastKnownCountry: 'FR',
    });
    assert.equal(props?.country_birth, 'MX');
    assert.equal(props?.country_live, 'US');
  });

  it('age ranges keep their edges and never classify a minor as an adult', () => {
    const now = new Date(2026, 10, 6);
    const cases: Array<[string, string | null]> = [
      ['2008-11-07', null],
      ['2008-11-06', '18-24'],
      ['2001-11-07', '18-24'],
      ['2001-11-06', '25-34'],
      ['1991-11-06', '35-44'],
      ['1981-11-06', '45-54'],
      ['1971-11-06', '55-64'],
      ['1961-11-06', '65+'],
    ];
    for (const [birthDate, expected] of cases) {
      assert.equal(computeAgeRange(birthDate, now), expected, birthDate);
    }
    for (const bad of ['2030-01-01', '2001-02-31', 'x', 12]) {
      assert.equal(computeAgeRange(bad, now), undefined);
    }
  });

  it('sends no other profile text', () => {
    const props = build({
      mode: 'personal',
      bio: 'private bio',
      firstName: 'private name',
      company: 'private company',
    });
    assert.ok(!JSON.stringify(props).includes('private'));
  });
});

describe('social properties', () => {
  const doc = {
    socialLinksPersonal: {
      website: 'https://me.test',
      twitter: 'https://x.com/me',
      linkedin: '',
      facebook: 'not a url',
      custom: [{ name: 'free text', url: 'https://c.test' }],
    },
  };

  it('valid manual links only, Website included, X under one name', () => {
    assert.deepEqual(readManualPlatforms(doc, 'personal'), ['custom', 'website', 'x']);
    assert.deepEqual(readManualPlatforms(doc, 'professional'), []);
    assert.equal(readManualPlatforms({ socialLinksPersonal: 'x' }, 'personal'), undefined);
    assert.equal(toSocialPlatformName('twitter'), 'x');
  });

  it('a custom network name is not sent', () => {
    assert.ok(!JSON.stringify(readManualPlatforms(doc, 'personal')).includes('free text'));
  });

  it('socials_connected has no duplicates and has_socials follows it', () => {
    const props = socialProperties(['x', 'website'], ['x', 'tiktok']);
    assert.deepEqual(props.socials_connected, ['tiktok', 'website', 'x']);
    assert.equal(props.has_socials, true);
    assert.equal(socialProperties([], []).has_socials, false);
  });

  it('unknown verified state does not clear socials', () => {
    const props = socialProperties(['website'], undefined);
    assert.deepEqual(props, { social_platforms_manual: ['website'] });
  });

  it('verified is known only once every network of the mode was confirmed', () => {
    const tracker = createVerifiedSocialTracker();
    tracker.note('personal', 'youtube', true);
    tracker.note('personal', 'tiktok', false);
    tracker.note('personal', 'x', false);
    assert.equal(tracker.verifiedFor('personal'), undefined);
    tracker.note('personal', 'instagram', false);
    assert.deepEqual(tracker.verifiedFor('personal'), ['youtube']);
    assert.equal(tracker.verifiedFor('professional'), undefined);
  });

  it('social_linked is wired to adding, never to hydration, edit or pending', () => {
    const manual = src('components/profile/useManualSocialLinks.ts');
    assert.ok(/result\.url && !valuesRef\.current\[field\]\?\.trim\(\)/.test(manual));
    for (const file of ['Tiktok', 'X', 'Youtube']) {
      const source = src(`components/profile/${file}OwnershipCard.tsx`);
      const refresh = source.slice(
        source.indexOf('const refreshForMode'),
        source.indexOf('useEffect(', source.indexOf('const refreshForMode')),
      );
      assert.ok(!refresh.includes('trackSocialLinked'), `${file} hydration`);
      assert.ok(source.includes('trackSocialLinked'), file);
    }
    const instagram = src('components/profile/InstagramOwnershipCard.tsx');
    assert.ok(instagram.includes("noteSocialVerificationPending(forMode, 'instagram')"));
    assert.ok(!instagram.includes('trackSocialLinked'));
  });

  it('a pending verification survives the card, once, and hydration has no marker', async () => {
    const data = new Map<string, string>();
    const markers = createPendingVerificationMarkers({
      getItem: async (key) => data.get(key) ?? null,
      setItem: async (key, value) => void data.set(key, value),
    });
    assert.equal(await markers.consume('u:personal:instagram'), false);
    await markers.mark('u:personal:instagram');
    await markers.mark('u:personal:instagram');
    assert.equal(await markers.consume('u:professional:instagram'), false);
    assert.equal(await markers.consume('u:personal:instagram'), true);
    assert.equal(await markers.consume('u:personal:instagram'), false);
  });

  it('damaged markers read as none', async () => {
    const markers = createPendingVerificationMarkers({
      getItem: async () => '{bad',
      setItem: async () => {},
    });
    assert.equal(await markers.consume('x'), false);
  });

  it('a failed read does not report a network as not linked', () => {
    const card = src('components/profile/TiktokOwnershipCard.tsx');
    const effect = card.slice(card.indexOf('shouldReportOwnershipConnectedChange(phase)'));
    assert.ok(!effect.slice(0, 120).includes('noteSocialOwnership'));
    const load = src('social/ownProfileSocialSummaryLoad.android.ts');
    assert.ok(load.includes("status === 'verified' || status === 'not_linked'"));
  });
});

describe('permissions and visibility', () => {
  function makeObserver() {
    const events: unknown[][] = [];
    const person: unknown[][] = [];
    const observer = createLocationPermissionObserver({
      emit: (...args) => events.push(args),
      setPerson: (...args) => person.push(args),
    });
    return { events, observer, person };
  }

  it('the first reading updates the person without an event', () => {
    const { events, observer, person } = makeObserver();
    observer.noteState('foreground', true);
    assert.deepEqual(events, []);
    assert.deepEqual(person, [['foreground', true]]);
  });

  it('a change on return from Settings emits once', () => {
    const { events, observer } = makeObserver();
    observer.noteState('background', false);
    observer.noteState('background', true);
    observer.noteState('background', true);
    assert.deepEqual(events, [['background', true, 'state_change']]);
  });

  it('a request reports its result; one that was already granted is silent', () => {
    const { events, observer } = makeObserver();
    observer.noteState('foreground', true);
    observer.noteRequest('foreground', true);
    assert.deepEqual(events, []);
    observer.noteState('background', false);
    observer.noteRequest('background', false);
    observer.noteRequest('background', true);
    assert.deepEqual(events, [
      ['background', false, 'request'],
      ['background', true, 'request'],
    ]);
  });

  it('a request is in flight until its result is reported', async () => {
    let release: (value: { status: string }) => void = () => {};
    const seen: Array<[boolean, boolean]> = [];
    setLocationRequestListener((_kind, granted) =>
      seen.push([granted, isLocationRequestInFlight('foreground')]),
    );
    try {
      const request = withLocationPermissionRequest(
        'foreground',
        () => new Promise<{ status: string }>((resolve) => { release = resolve; }),
      );
      assert.equal(isLocationRequestInFlight('foreground'), true);
      assert.equal(isLocationRequestInFlight('background'), false);
      release({ status: 'granted' });
      await request;
      assert.deepEqual(seen, [[true, false]]);
      await assert.rejects(
        withLocationPermissionRequest('foreground', async () => {
          throw new Error('denied');
        }),
      );
      assert.equal(isLocationRequestInFlight('foreground'), false);
    } finally {
      setLocationRequestListener(null);
    }
  });

  it('location request sites report the result and add no request', () => {
    const count = (text: string, re: RegExp) => (text.match(re) ?? []).length;
    for (const file of [
      'visibility/orchestration.ts',
      'location/startGatedBackgroundLocation.ts',
      'services/backgroundLocation.ts',
      'screens/MoreScreen.tsx',
      'screens/ProfileCompletionScreen.tsx',
    ]) {
      const source = src(file);
      const requests = count(source, /Location\.request(Foreground|Background)PermissionsAsync\(\)/g);
      const wrapped = count(source, /withLocationPermissionRequest\('(foreground|background)'/g);
      assert.equal(requests, wrapped, file);
    }
    const binding = src('analytics/analytics.android.ts');
    assert.ok(!/request(Foreground|Background)PermissionsAsync/.test(binding));
    assert.ok(!/getCurrentPositionAsync|getLastKnownPositionAsync|latitude|longitude/.test(binding));
  });

  it('visibility emits per real transition', () => {
    const seen: boolean[] = [];
    const observer = createVisibilityObserver((value) => seen.push(value));
    observer.note(true);
    observer.note(true);
    observer.note(false);
    assert.deepEqual(seen, [true, false]);
  });

  it('visibility is reported after the success points', () => {
    const home = src('screens/MainHomeScreen.tsx');
    const on = home.indexOf('trackVisibilityChanged(uid, true)');
    assert.ok(on > home.indexOf('outcome.ok === true'));
    const off = home.indexOf('trackVisibilityChanged(uid, false)');
    assert.ok(off > home.indexOf('deactivateVisibilityFlow(client)'));
    assert.ok(off > home.indexOf('if (outcome.ok === false)', home.indexOf('deactivateVisibilityFlow(client)')));
  });
});

describe('discovery and match', () => {
  it('first successful load per entry, empty included; refreshes do not count', () => {
    let now = 1_000;
    const tracker = createDiscoveryEntryTracker(() => now);
    tracker.noteAttemptStart();
    now += 1_260;
    assert.deepEqual(tracker.noteSuccess(0), { load_time_sec: 1.3, people_shown: 0 });
    tracker.noteAttemptStart();
    assert.equal(tracker.noteSuccess(5), null);
  });

  it('an error is not a success: the retry reports with its own time', () => {
    let now = 0;
    const tracker = createDiscoveryEntryTracker(() => now);
    tracker.noteAttemptStart();
    now = 5_000;
    tracker.noteAttemptStart();
    now = 5_500;
    assert.deepEqual(tracker.noteSuccess(2), { load_time_sec: 0.5, people_shown: 2 });
  });

  it('nothing is reported without an attempt', () => {
    assert.equal(createDiscoveryEntryTracker(() => 0).noteSuccess(1), null);
  });

  it('score ranges keep their edges; unknown is not zero', () => {
    const cases: Array<[number, string]> = [
      [0, 'low'],
      [49.9, 'low'],
      [50, 'medium'],
      [74.9, 'medium'],
      [75, 'high'],
      [100, 'high'],
    ];
    for (const [score, range] of cases) assert.equal(matchScoreRange(score), range);
    assert.deepEqual(scoreProperties(0), { score: 0, match_score_range: 'low' });
    for (const unknown of [undefined, null, 'x', -1, 101, Number.NaN]) {
      assert.deepEqual(scoreProperties(unknown), {});
    }
  });

  it('only an available compatibility has a score', () => {
    assert.equal(knownCompatibilityScore({ available: true, score: 80 }), 80);
    assert.equal(knownCompatibilityScore({ available: true, score: 0 }), 0);
    assert.equal(knownCompatibilityScore({ available: false, score: 80 }), undefined);
    assert.equal(knownCompatibilityScore(undefined), undefined);
  });

  function makeSession(sessionId: { value: string }) {
    const captures: Array<[string, unknown]> = [];
    const transport: AnalyticsTransport = {
      getIdentifiedDistinctId: () => 'u1',
      getSessionId: () => sessionId.value,
      identify: () => {},
      setPersonProperties: () => {},
      reset: () => {},
      register: () => {},
      capture: (event, properties) => void captures.push([event, properties]),
    };
    const session = createAnalyticsSession({
      loadTransport: async () => transport,
      getAuthUser: () => ({ uid: 'u1' }),
      readCreationTime: () => undefined,
      buildBaseProperties: () => ({}),
      buildProfileProperties: () => ({}),
      superProperties: {},
      now: () => 0,
    });
    return { captures, session };
  }

  it('match dedupes by profile and SDK session; another session counts again', async () => {
    const current = { value: 's1' };
    const { captures, session } = makeSession(current);
    const present = (peer: string) =>
      session.trackForUser('u1', ({ sessionId }) => ({
        event: 'match_made',
        onceKey: `match_made:${sessionId}:${peer}`,
        properties: { score: 80 },
      }));
    present('peer-a');
    present('peer-a');
    present('peer-b');
    await session.settled();
    assert.equal(captures.length, 2);
    current.value = 's2';
    present('peer-a');
    await session.settled();
    assert.equal(captures.length, 3);
    assert.ok(!JSON.stringify(captures).includes('peer-'));
  });

  it('match comes from what was presented, not from the load', () => {
    const screen = src('screens/NearbySearchScreen.tsx');
    assert.ok(screen.includes('onViewableItemsChanged={onViewableItemsChangedRef.current}'));
    const load = screen.slice(screen.indexOf('const loadData = useCallback'), screen.indexOf('const onRefresh'));
    assert.ok(!load.includes('trackMatchPresented'));
    const alerts = src('hooks/useNearbyAlerts.ts');
    assert.ok(!alerts.includes('trackMatchPresented'));
  });

  it('a refocus reload is one profile view', () => {
    const screen = src('screens/DiscoveryProfileScreen.tsx');
    assert.ok(screen.includes('viewedProfileRef.current !== uid'));
  });

  it('a tap records the open result without changing how the link opens', () => {
    const row = src('components/profileExploration/DiscoverySocialMediaRow.tsx');
    assert.ok(row.includes('trackOpen(link.platform, openLink(link.platform, link.url))'));
    const hook = src('components/profileExploration/useOpenSocialLink.ts');
    assert.ok(hook.includes('openSocialLink(platform, url, Linking)'));
  });
});

describe('alert opens', () => {
  const response = (identifier: string, data: Record<string, unknown>) => ({
    notification: { date: 1, request: { identifier, content: { data } } },
  });

  function make(options: { lastHandled?: string | null; ready?: boolean } = {}) {
    const state = { ready: options.ready ?? true, now: 0, uid: 'A' as string | null };
    const opened: unknown[] = [];
    const profiles: string[] = [];
    const coordinator = createPushOpenCoordinator({
      now: () => state.now,
      currentUid: () => state.uid,
      canNavigate: () => state.ready,
      openProfile: (uid) => profiles.push(uid),
      emitOpened: (alertId) => opened.push(alertId),
      readLastHandledId: async () => options.lastHandled ?? null,
      writeLastHandledId: async () => {},
    });
    return { coordinator, opened, profiles, state };
  }

  it('alertId is optional and never fabricated', () => {
    assert.equal(parsePushResponse(response('n', { actorUid: 'a' }))?.alertId, undefined);
    assert.equal(parsePushResponse(response('n', { actorUid: 'a', alertId: 'x1' }))?.alertId, 'x1');
    assert.equal(
      parsePushResponse(response('n', { actorUid: 'a', alertId: 'has spaces' }))?.alertId,
      undefined,
    );
    assert.equal(parsePushResponse(response('n', { other: 1 })), null);
    assert.equal(parsePushResponse(null), null);
  });

  it('initial response and listener handle one tap once', async () => {
    const { coordinator, opened, profiles } = make();
    const tap = response('n1', { actorUid: 'a' });
    await coordinator.handleInitialResponse(tap);
    coordinator.handleResponse(tap);
    assert.equal(opened.length, 1);
    assert.deepEqual(profiles, ['a']);
  });

  it('listener first, then initial response, also handles it once', async () => {
    const { coordinator, opened } = make();
    const tap = response('n1', { actorUid: 'a' });
    coordinator.handleResponse(tap);
    await coordinator.handleInitialResponse(tap);
    assert.equal(opened.length, 1);
  });

  it('a cold start waits for navigation', async () => {
    const { coordinator, opened, profiles, state } = make({ ready: false });
    await coordinator.handleInitialResponse(response('n1', { actorUid: 'a' }));
    coordinator.flush();
    assert.deepEqual(profiles, []);
    state.ready = true;
    coordinator.flush();
    coordinator.flush();
    assert.deepEqual(profiles, ['a']);
    assert.equal(opened.length, 1);
  });

  it('a tap already handled by a previous run is not replayed', async () => {
    const { coordinator, opened } = make({ lastHandled: 'n1' });
    await coordinator.handleInitialResponse(response('n1', { actorUid: 'a' }));
    assert.equal(opened.length, 0);
  });

  it('a tap does not cross to another account', () => {
    const { coordinator, opened, profiles, state } = make({ ready: false });
    coordinator.handleResponse(response('n1', { actorUid: 'a' }));
    state.uid = 'B';
    state.ready = true;
    coordinator.flush();
    assert.deepEqual(profiles, []);
    assert.equal(opened.length, 0);
  });

  it('a cold start before auth restored still opens', () => {
    const { coordinator, profiles, state } = make({ ready: false });
    state.uid = null;
    coordinator.handleResponse(response('n1', { actorUid: 'a' }));
    state.uid = 'A';
    state.ready = true;
    coordinator.flush();
    assert.deepEqual(profiles, ['a']);
  });

  it('a tap that waited too long is dropped', async () => {
    const { coordinator, profiles, state } = make({ ready: false });
    coordinator.handleResponse(response('n1', { actorUid: 'a' }));
    state.now = PUSH_OPEN_MAX_WAIT_MS + 1;
    state.ready = true;
    coordinator.flush();
    assert.deepEqual(profiles, []);
  });

  it('a failing analytics call still opens the profile', () => {
    const profiles: string[] = [];
    const coordinator = createPushOpenCoordinator({
      now: () => 0,
      currentUid: () => 'A',
      canNavigate: () => true,
      openProfile: (uid) => profiles.push(uid),
      emitOpened: () => {
        throw new Error('analytics');
      },
      readLastHandledId: async () => null,
      writeLastHandledId: async () => {},
    });
    coordinator.handleResponse(response('n1', { actorUid: 'a' }));
    assert.deepEqual(profiles, ['a']);
  });

  it('finds a nested route', () => {
    assert.equal(
      isRouteReachable(
        { routes: [{ name: 'Root', state: { routeNames: ['Home', 'Alerts'], routes: [] } }] },
        'Home',
      ),
      true,
    );
    assert.equal(isRouteReachable({ routeNames: ['Login'], routes: [{ name: 'Login' }] }, 'Home'), false);
    assert.equal(isRouteReachable(undefined, 'Home'), false);
  });

  it('the inbox never sends the alert id, which is the other person', () => {
    const screen = src('screens/AlertsScreen.tsx');
    assert.ok(screen.includes("trackAlertOpened('inbox')"));
  });

  it('token registration is untouched by this wiring', () => {
    const wiring = src('analytics/alertPushOpens.ts');
    assert.ok(!/registerPushToken|getExpoPushTokenAsync|scheduleNotification/.test(wiring));
  });
});

describe('campaign attribution', () => {
  const settings = { appLinks: { host: 'links.example.test', pathPrefix: '/c' } };

  it('reads the allowlist from a configured link', () => {
    const touch = parseCampaignLink(
      'https://links.example.test/c/spring?utm_source=ig&utm_campaign=launch&utm_content=a1&nearsy_tool=qr&fbclid=abc&email=x%40y.test',
      settings,
    );
    assert.deepEqual(touch, {
      source: 'ig',
      campaign: 'launch',
      content: 'a1',
      tool: 'qr',
      method: 'app_link',
    });
    assert.ok(!JSON.stringify(touch).includes('abc'));
    assert.ok(!JSON.stringify(touch).includes('x@y'));
  });

  it('never reads OAuth returns or any other address', () => {
    for (const url of [
      'nearsy://linkedin-auth?transactionId=t&result=ok&mode=personal',
      'nearsy://youtube-ownership?transactionId=t&result=ok&utm_source=ig',
      'nearsy://tiktok-ownership?utm_source=ig',
      'nearsy://x-ownership?utm_source=ig',
      'nearsy://campaign?utm_source=ig&code=abc',
      'nearsy://campaign?utm_source=ig&state=abc',
      'https://other.example.test/c?utm_source=ig',
      'https://links.example.test/other?utm_source=ig',
      'https://links.example.test/cc?utm_source=ig',
      'http://links.example.test/c?utm_source=ig',
      null,
      42,
    ]) {
      assert.equal(parseCampaignLink(url, settings), null, String(url));
    }
  });

  it('without a domain only the reserved scheme address works', () => {
    assert.equal(parseCampaignLink('https://links.example.test/c?utm_source=ig', {}), null);
    assert.equal(
      parseCampaignLink('nearsy://campaign?utm_source=ig', {})?.method,
      'custom_scheme',
    );
  });

  it('rejects values that are not safe tokens', () => {
    assert.equal(parseCampaignLink('nearsy://campaign?utm_source=a%20b%40c.test', {}), null);
    assert.deepEqual(parseCampaignLink('nearsy://campaign?utm_source=ig&utm_content=a%20b', {}), {
      source: 'ig',
      method: 'custom_scheme',
    });
    assert.equal(parseCampaignLink('nearsy://campaign?utm_source=%E0%A4%A', {}), null);
  });

  it('the install referrer is evidence only with a campaign', () => {
    assert.deepEqual(parseInstallReferrer('utm_source=ig&utm_campaign=launch'), {
      source: 'ig',
      campaign: 'launch',
      method: 'install_referrer',
    });
    assert.equal(parseInstallReferrer('utm_source=google-play&utm_medium=organic'), null);
    assert.equal(parseInstallReferrer(''), null);
  });

  it('acquisition and later campaigns use their own names; no organic or unknown', () => {
    const touch = { source: 'ig', method: 'app_link' as const };
    assert.deepEqual(signupAttributionProperties(touch), {
      signup_source: 'ig',
      attribution_method: 'app_link',
    });
    assert.deepEqual(campaignAccessedProperties(touch), {
      campaign_source: 'ig',
      attribution_method: 'app_link',
    });
    const code = src('analytics/analyticsAttribution.ts') + src('analytics/analytics.android.ts');
    assert.ok(!/(signup_\w+|campaign_\w+|attribution_method): '(organic|unknown)'/.test(code));
    assert.ok(!/source: '(organic|unknown)'/.test(code));
  });

  function memoryStorage() {
    const data = new Map<string, string>();
    return {
      data,
      getItem: async (key: string) => data.get(key) ?? null,
      setItem: async (key: string, value: string) => void data.set(key, value),
      removeItem: async (key: string) => void data.delete(key),
    };
  }

  it('the store holds the first touch, expires it, and consumes once', async () => {
    const storage = memoryStorage();
    let now = 1_000;
    const store = createCampaignTouchStore({ storage, now: () => now, expiryMs: 100 });
    await store.save({ source: 'first', method: 'app_link' });
    await store.save({ source: 'second', method: 'app_link' });
    assert.equal((await store.read())?.source, 'first');
    assert.equal((await store.consume())?.source, 'first');
    assert.equal(await store.consume(), null);

    await store.save({ source: 'old', method: 'app_link' });
    now += 101;
    assert.equal(await store.read(), null);
    assert.equal(storage.data.size, 0);
  });

  it('a damaged record is dropped', async () => {
    const storage = memoryStorage();
    storage.data.set('NEARSY_ANALYTICS_CAMPAIGN_TOUCH', '{bad');
    const store = createCampaignTouchStore({ storage, now: () => 0, expiryMs: 100 });
    assert.equal(await store.read(), null);
  });

  it('only allowlisted fields reach the store', async () => {
    const storage = memoryStorage();
    const store = createCampaignTouchStore({ storage, now: () => 0, expiryMs: 100 });
    const touch = parseCampaignLink('nearsy://campaign?utm_source=ig&full=https%3A%2F%2Fa.test', {});
    assert.ok(touch);
    await store.save(touch);
    assert.deepEqual(Object.keys(JSON.parse(storage.data.values().next().value as string)).sort(), [
      'method',
      'source',
      'storedAt',
    ]);
  });

  it('a recent account keeps the touch for its signup', () => {
    const now = Date.parse('2026-11-06T12:00:00Z');
    assert.equal(isEstablishedAccount('2026-11-06T11:59:30Z', now), false);
    assert.equal(isEstablishedAccount('2026-11-06T11:00:00Z', now), true);
    assert.equal(isEstablishedAccount(undefined, now), false);
  });

  it('expiry is configurable with a safe default', () => {
    assert.equal(resolveAttributionSettings(undefined).expiryMs, 7 * 24 * 3_600_000);
    assert.equal(
      resolveAttributionSettings({ attributionExpiryHours: 24 }).expiryMs,
      24 * 3_600_000,
    );
    assert.equal(
      resolveAttributionSettings({ attributionExpiryHours: -1 }).expiryMs,
      7 * 24 * 3_600_000,
    );
  });

  it('person writes keep first acquisition through set_once', async () => {
    const onceCalls: unknown[] = [];
    const transport: AnalyticsTransport = {
      getIdentifiedDistinctId: () => 'u1',
      getSessionId: () => undefined,
      identify: () => {},
      setPersonProperties: (set, once) => void onceCalls.push([set, once]),
      reset: () => {},
      register: () => {},
      capture: () => {},
    };
    const session = createAnalyticsSession({
      loadTransport: async () => transport,
      getAuthUser: () => ({ uid: 'u1' }),
      readCreationTime: () => undefined,
      buildBaseProperties: () => ({}),
      buildProfileProperties: () => ({}),
      superProperties: {},
      now: () => 0,
    });
    session.setPersonForUser('u1', {}, { signup_source: 'ig' });
    await session.settled();
    assert.deepEqual(onceCalls, [[{}, { signup_source: 'ig' }]]);
  });

  it('the link listener only reads, and is separate from the OAuth ports', () => {
    const binding = src('analytics/analytics.android.ts');
    assert.ok(binding.includes("Linking.addEventListener('url'"));
    assert.ok(!/openURL|WebBrowser|maybeCompleteAuthSession/.test(binding));
  });
});

describe('LinkedIn new account signal', () => {
  it('nothing is inferred until Identity agrees on the field', () => {
    assert.equal(LINKEDIN_NEW_ACCOUNT_FIELD, null);
    assert.equal(readLinkedinNewAccountSignal({ isNewUser: true }), false);
    assert.equal(readLinkedinNewAccountSignal({ isNewAccount: true }), false);
  });

  it('only an explicit true counts once the field is known', () => {
    assert.equal(readLinkedinNewAccountSignal({ agreed: true }, 'agreed'), true);
    assert.equal(readLinkedinNewAccountSignal({ agreed: 'true' }, 'agreed'), false);
    assert.equal(readLinkedinNewAccountSignal({}, 'agreed'), false);
    assert.equal(readLinkedinNewAccountSignal(null, 'agreed'), false);
  });
});

describe('product flows are protected', () => {
  it('every track call of the binding is guarded', () => {
    const binding = src('analytics/analytics.android.ts');
    const exports = binding.match(/^export const \w+: AnalyticsApi\['\w+'\] = .*$/gm) ?? [];
    assert.ok(exports.length >= 13);
    for (const line of exports) {
      if (line.includes('startAnalytics')) continue;
      assert.ok(line.includes('= safely('), line);
    }
  });

  it('a track call in a save flow is not awaited', () => {
    const screen = src('screens/ProfileCompletionScreen.tsx');
    assert.ok(!/await track[A-Z]/.test(screen));
    assert.ok(!/await track[A-Z]/.test(src('screens/MainHomeScreen.tsx')));
    assert.ok(!/await track[A-Z]/.test(src('screens/NearbySearchScreen.tsx')));
  });

  it('a build callback that throws stays inside the session', async () => {
    const calls: string[] = [];
    const transport: AnalyticsTransport = {
      getIdentifiedDistinctId: () => 'u1',
      getSessionId: () => 's',
      identify: () => {},
      setPersonProperties: () => {},
      reset: () => {},
      register: () => {},
      capture: (event) => void calls.push(event),
    };
    const session = createAnalyticsSession({
      loadTransport: async () => transport,
      getAuthUser: () => ({ uid: 'u1' }),
      readCreationTime: () => undefined,
      buildBaseProperties: () => ({}),
      buildProfileProperties: () => ({}),
      superProperties: {},
      now: () => 0,
    });
    session.trackForUser('u1', () => {
      throw new Error('analytics');
    });
    session.trackAppOpened();
    await session.settled();
    assert.deepEqual(calls, ['app_opened']);
  });
});

describe('out of scope stays out', () => {
  it('no excluded property or server-owned value is sent by the app', () => {
    const code = [
      'analytics/analyticsContract.ts',
      'analytics/analyticsPersonProperties.ts',
      'analytics/analytics.android.ts',
    ]
      .map(src)
      .join('\n');
    for (const name of ['gender', 'seniority', 'industry', 'subscription', 'event_cohort', 'alert_sent']) {
      assert.ok(!code.includes(name), name);
    }
  });
});

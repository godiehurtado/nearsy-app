/**
 * Nearsy iOS 2.1.0 — Spanish register, More › iPhone notifications, and the
 * PostHog person name properties.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import en from '../i18n/locales/en';
import es from '../i18n/locales/es';
import {
  EVENT_RULES,
  FORBIDDEN_PROPERTY_NAMES,
  PERSON_PROPERTY_RULES,
  SUPER_PROPERTY_RULES,
} from '../analytics/contract';
import {
  buildPersonProperties,
  profileWriteAffectsAnalytics,
} from '../analytics/profileProperties';
import { sanitizeProperties } from '../analytics/sanitize';
import {
  allowsPushDelivery,
  buildNotificationPermissionRow,
  handleNotificationPermissionTap,
  readNotificationPermission,
  refreshNotificationPermission,
  resolveNotificationPermissionState,
  type NotificationPermissionIO,
  type PermissionSnapshot,
} from '../settings/notificationPermission';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(here, '..', rel), 'utf8');

function lookup(resources: unknown) {
  return (key: string): string => {
    let node: any = resources;
    for (const part of key.split('.')) node = node?.[part];
    assert.equal(typeof node, 'string', `missing i18n key ${key}`);
    return node as string;
  };
}
const tEn = lookup(en);
const tEs = lookup(es);

describe('2.1.0 Spanish: "comparten", never "compartís"', () => {
  it('no Spanish string uses the vosotros form', () => {
    assert.equal(JSON.stringify(es).includes('compartís'), false);
  });

  it('interest and affiliation inbox texts share the "comparten" register', () => {
    assert.equal(
      tEs('notifications.messages.interestNearby'),
      '{{name}} está cerca y comparten intereses{{interests}}.',
    );
    assert.equal(
      tEs('notifications.messages.affiliationNearby'),
      '{{name}} está cerca y comparten afiliaciones.',
    );
    assert.equal(
      tEs('notifications.messages.affiliationNearbyOne'),
      '{{name}} está cerca y comparten una afiliación.',
    );
  });
});

const IOS = { NOT_DETERMINED: 0, DENIED: 1, AUTHORIZED: 2, PROVISIONAL: 3, EPHEMERAL: 4 };
const snap = (status: number, extra: Record<string, unknown> = {}): PermissionSnapshot => ({
  ios: { status },
  ...extra,
});

function fakeIO(initial: number) {
  let current = initial;
  const calls = { read: 0, request: 0, openSettings: 0, register: 0 };
  const io: NotificationPermissionIO = {
    read: async () => {
      calls.read += 1;
      return snap(current);
    },
    request: async () => {
      calls.request += 1;
      if (current === IOS.NOT_DETERMINED) current = IOS.AUTHORIZED;
      return snap(current);
    },
    openSettings: async () => {
      calls.openSettings += 1;
    },
    registerToken: async () => {
      calls.register += 1;
    },
  };
  return { io, calls, set: (s: number) => (current = s) };
}

describe('More › iPhone notifications permission', () => {
  it('maps every iOS authorization status, and the generic fallback', () => {
    assert.equal(resolveNotificationPermissionState(snap(IOS.NOT_DETERMINED)), 'notDetermined');
    assert.equal(resolveNotificationPermissionState(snap(IOS.DENIED)), 'denied');
    assert.equal(resolveNotificationPermissionState(snap(IOS.AUTHORIZED)), 'authorized');
    assert.equal(resolveNotificationPermissionState(snap(IOS.PROVISIONAL)), 'provisional');
    assert.equal(resolveNotificationPermissionState(snap(IOS.EPHEMERAL)), 'ephemeral');
    assert.equal(resolveNotificationPermissionState({ status: 'undetermined' }), 'notDetermined');
    assert.equal(resolveNotificationPermissionState({ status: 'granted', granted: true }), 'authorized');
    assert.equal(resolveNotificationPermissionState({ status: 'denied' }), 'denied');
    assert.equal(resolveNotificationPermissionState(null), 'unknown');
    assert.equal(resolveNotificationPermissionState(snap(99)), 'unknown');
  });

  it('push delivery: authorized, provisional and ephemeral only', () => {
    assert.equal(allowsPushDelivery('authorized'), true);
    assert.equal(allowsPushDelivery('provisional'), true);
    assert.equal(allowsPushDelivery('ephemeral'), true);
    assert.equal(allowsPushDelivery('denied'), false);
    assert.equal(allowsPushDelivery('notDetermined'), false);
    assert.equal(allowsPushDelivery('unknown'), false);
  });

  it('row action: request only when never asked; Settings otherwise', () => {
    assert.equal(buildNotificationPermissionRow('notDetermined').action, 'request');
    assert.equal(buildNotificationPermissionRow('denied').action, 'openSettings');
    assert.equal(buildNotificationPermissionRow('provisional').action, 'openSettings');
    assert.equal(buildNotificationPermissionRow('authorized').action, 'openSettings');
    assert.equal(buildNotificationPermissionRow('ephemeral').action, 'openSettings');
    assert.equal(buildNotificationPermissionRow('unknown').action, 'none');
  });

  it('every row resolves in EN and ES; the copy separates permission from notice types', () => {
    for (const state of ['notDetermined', 'denied', 'provisional', 'authorized', 'unknown'] as const) {
      const row = buildNotificationPermissionRow(state);
      for (const t of [tEn, tEs]) {
        assert.ok(t(row.valueKey));
        assert.ok(t(row.noteKey));
      }
    }
    assert.match(tEn('settings.notificationPermission.notes.notDetermined'), /notice types below/);
    assert.match(tEs('settings.notificationPermission.notes.denied'), /Ajustes/);
    assert.equal(tEs('settings.notificationPermission.title'), 'Notificaciones del iPhone');
  });

  it('not requested: a tap requests once and registers the token', async () => {
    const { io, calls } = fakeIO(IOS.NOT_DETERMINED);
    const state = await readNotificationPermission(io);
    assert.equal(calls.request, 0, 'reading never prompts');
    const result = await handleNotificationPermissionTap(state, io);
    assert.deepEqual(result, { state: 'authorized', awaitingSettingsReturn: false });
    assert.equal(calls.request, 1);
    assert.equal(calls.register, 1);
  });

  it('not requested + declined: no token, row moves to denied', async () => {
    const { io, calls, set } = fakeIO(IOS.NOT_DETERMINED);
    io.request = async () => {
      calls.request += 1;
      set(IOS.DENIED);
      return snap(IOS.DENIED);
    };
    const result = await handleNotificationPermissionTap('notDetermined', io);
    assert.equal(result.state, 'denied');
    assert.equal(calls.register, 0);
  });

  it('denied: opens Settings, never requests; return re-reads and registers', async () => {
    const { io, calls, set } = fakeIO(IOS.DENIED);
    const tap = await handleNotificationPermissionTap('denied', io);
    assert.deepEqual(tap, { state: 'denied', awaitingSettingsReturn: true });
    assert.equal(calls.openSettings, 1);
    assert.equal(calls.request, 0);
    set(IOS.AUTHORIZED); // user turned it on in Settings
    assert.equal(await refreshNotificationPermission('denied', io), 'authorized');
    assert.equal(calls.register, 1);
    assert.equal(calls.request, 0);
  });

  it('return without a change re-reads but does not re-register', async () => {
    const { io, calls } = fakeIO(IOS.DENIED);
    assert.equal(await refreshNotificationPermission('denied', io), 'denied');
    assert.equal(calls.register, 0);
    const granted = fakeIO(IOS.AUTHORIZED);
    assert.equal(await refreshNotificationPermission('authorized', granted.io), 'authorized');
    assert.equal(granted.calls.register, 0);
  });

  it('turned off in Settings while away: row shows denied, no prompt', async () => {
    const { io, calls } = fakeIO(IOS.DENIED);
    assert.equal(await refreshNotificationPermission('authorized', io), 'denied');
    assert.equal(calls.request, 0);
    assert.equal(calls.register, 0);
  });

  it('provisional registers the token and offers Settings for full alerts', async () => {
    const { io, calls } = fakeIO(IOS.PROVISIONAL);
    assert.equal(await refreshNotificationPermission('notDetermined', io), 'provisional');
    assert.equal(calls.register, 1);
    const tap = await handleNotificationPermissionTap('provisional', io);
    assert.equal(tap.awaitingSettingsReturn, true);
    assert.equal(calls.request, 0);
  });

  it('read, request and token failures never throw', async () => {
    const broken: NotificationPermissionIO = {
      read: async () => {
        throw new Error('x');
      },
      request: async () => {
        throw new Error('x');
      },
      openSettings: async () => {
        throw new Error('x');
      },
      registerToken: async () => {
        throw new Error('x');
      },
    };
    assert.equal(await readNotificationPermission(broken), 'unknown');
    assert.deepEqual(await handleNotificationPermissionTap('notDetermined', broken), {
      state: 'unknown',
      awaitingSettingsReturn: false,
    });
    assert.deepEqual(await handleNotificationPermissionTap('denied', broken), {
      state: 'denied',
      awaitingSettingsReturn: false,
    });
    const ok = fakeIO(IOS.AUTHORIZED);
    ok.io.registerToken = async () => {
      throw new Error('network');
    };
    assert.equal(await refreshNotificationPermission('denied', ok.io), 'authorized');
  });

  it('wiring: iOS only, first row of Privacy, request only inside the tap path', () => {
    const more = read('screens/MoreScreen.tsx');
    assert.match(more, /useNotificationPermissionRow\(Platform\.OS === 'ios'\)/);
    const privacy = more.indexOf("title={t('settings.sections.privacy')}");
    const row = more.indexOf("t('settings.notificationPermission.title')");
    const notices = more.indexOf("t('settings.nearbyNotices.title')");
    assert.ok(privacy > 0 && privacy < row && row < notices);
    assert.doesNotMatch(more, /requestPermissionsAsync/);

    const hook = read('settings/useNotificationPermissionRow.ts');
    assert.equal(hook.match(/requestPermissionsAsync/g)?.length, 1);
    assert.match(hook, /request: \(\) =>\s*Notifications\.requestPermissionsAsync/);
    // Mount and foreground only read; the request lives in the tap handler.
    assert.match(hook, /readNotificationPermission\(io\)/);
    assert.match(hook, /refreshNotificationPermission\(previous, io\)/);
    assert.match(hook, /handleNotificationPermissionTap\(stateRef\.current, io\)/);
    // Never touches visibility or the notice-type preferences.
    assert.doesNotMatch(hook, /visibility|notifyNearby/i);
  });
});

describe('PostHog person properties: first_name / last_name', () => {
  const base = { mode: 'professional', profiles: { professional: { occupation: 'Engineer' } } };

  it('come from top-level realName / lastName, trimmed', () => {
    const { set, unset } = buildPersonProperties(
      { ...base, realName: '  Ana María ', lastName: ' de la Cruz ', displayName: 'Ignored Name' },
      null,
      new Date('2026-11-12T00:00:00Z'),
    );
    assert.equal(set.first_name, 'Ana María');
    assert.equal(set.last_name, 'de la Cruz');
    assert.equal(unset.includes('first_name'), false);
  });

  it('never split a display name; missing or removed parts are unset', () => {
    const { set, unset } = buildPersonProperties(
      { ...base, displayName: 'Ana Cruz', realName: '', lastName: null },
      null,
      new Date('2026-11-12T00:00:00Z'),
    );
    assert.equal('first_name' in set, false);
    assert.equal('last_name' in set, false);
    assert.ok(unset.includes('first_name') && unset.includes('last_name'));
  });

  it('are kept when the profile mode is unknown (account-level, not mode-scoped)', () => {
    const { set } = buildPersonProperties(
      { realName: 'Ana', lastName: 'Cruz' },
      null,
      new Date('2026-11-12T00:00:00Z'),
    );
    assert.equal(set.first_name, 'Ana');
    assert.equal(set.last_name, 'Cruz');
  });

  it('cap at 80 characters and pass the outbound rules', () => {
    const long = 'x'.repeat(200);
    const { set } = buildPersonProperties(
      { ...base, realName: long, lastName: 'Cruz' },
      null,
      new Date('2026-11-12T00:00:00Z'),
    );
    assert.equal((set.first_name as string).length, 80);
    const clean = sanitizeProperties(PERSON_PROPERTY_RULES, {
      first_name: set.first_name,
      last_name: set.last_name,
    });
    assert.deepEqual(clean.droppedNames, []);
  });

  it('are person-only: never super-properties, never on events', () => {
    for (const name of ['first_name', 'last_name']) {
      assert.equal(name in SUPER_PROPERTY_RULES, false);
      for (const rules of Object.values(EVENT_RULES)) {
        assert.equal(name in (rules as Record<string, unknown>), false);
      }
      assert.equal(FORBIDDEN_PROPERTY_NAMES.has(name), false);
    }
  });

  it('a name save triggers a person sync', () => {
    assert.equal(profileWriteAffectsAnalytics({ realName: 'Ana' }), true);
    assert.equal(profileWriteAffectsAnalytics({ lastName: 'Cruz' }), true);
  });
});

describe('PostHog person property: industry (Product decision 2.1.0)', () => {
  const at = new Date('2026-11-12T00:00:00Z');
  const professional = { mode: 'professional', professionalIndustryId: 'technology' };

  it('sends the professional catalog id', () => {
    const { set, unset } = buildPersonProperties(professional, null, at);
    assert.equal(set.industry, 'technology');
    assert.equal(unset.includes('industry'), false);
    assert.equal(set.profile_type, 'professional');
  });

  it('is kept while the personal mode is active; profile_type segments it', () => {
    const { set, unset } = buildPersonProperties(
      { ...professional, mode: 'personal' },
      null,
      at,
    );
    assert.equal(set.industry, 'technology');
    assert.equal(set.profile_type, 'personal');
    assert.equal(unset.includes('industry'), false);
  });

  it('a mode switch alone never changes it', () => {
    const asProfessional = buildPersonProperties(professional, null, at);
    const asPersonal = buildPersonProperties({ ...professional, mode: 'personal' }, null, at);
    assert.equal(asProfessional.set.industry, asPersonal.set.industry);
    assert.equal(profileWriteAffectsAnalytics({ mode: 'personal' }), true);
  });

  it('clearing the selection (null, "Not specified") unsets it', () => {
    for (const cleared of [null, undefined, '', '   ']) {
      const { set, unset } = buildPersonProperties(
        { mode: 'personal', professionalIndustryId: cleared },
        null,
        at,
      );
      assert.equal('industry' in set, false);
      assert.ok(unset.includes('industry'));
    }
  });

  it('only a well-formed id is sent; malformed values unset it', () => {
    for (const bad of ['Technology', '1tech', 't', 'tech-x', 'a'.repeat(42), 42]) {
      const { set, unset } = buildPersonProperties(
        { mode: 'professional', professionalIndustryId: bad },
        null,
        at,
      );
      assert.equal('industry' in set, false, String(bad));
      assert.ok(unset.includes('industry'));
    }
    const ok = buildPersonProperties(
      { mode: 'professional', professionalIndustryId: 'a'.repeat(41) },
      null,
      at,
    );
    assert.deepEqual(sanitizeProperties(PERSON_PROPERTY_RULES, { industry: ok.set.industry }).droppedNames, []);
  });

  it('never reads the affiliation category or a bare "industry" field', () => {
    const { set } = buildPersonProperties(
      {
        mode: 'professional',
        industry: 'technology',
        professionalOnboardingAffiliations: [{ id: 'x', category: 'industry' }],
      },
      null,
      at,
    );
    assert.equal('industry' in set, false);
  });

  it('is person-only and a selection save triggers a sync', () => {
    assert.equal('industry' in SUPER_PROPERTY_RULES, false);
    for (const rules of Object.values(EVENT_RULES)) {
      assert.equal('industry' in (rules as Record<string, unknown>), false);
    }
    assert.equal(FORBIDDEN_PROPERTY_NAMES.has('industry'), false);
    assert.equal(profileWriteAffectsAnalytics({ professionalIndustryId: null }), true);
  });
});

/**
 * QA 2.1.0 (82) follow-ups, Owner-approved 2026-11-16:
 * 1 shared alerts fetch with coalesced triggers; 2 occupation from its own
 * mode; 3 inbox alert_opened once per appearance; 4 inbox_item_id withdrawn;
 * 5 editing an inactive face never looks like a confirmed switch.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  createRefreshCoalescer,
  requestAlertsRefresh,
  subscribeAlertsRefresh,
} from '../alerts/alertsRefresh';
import {
  resetInboxOpenTrackingForTests,
  shouldReportInboxOpen,
} from '../alerts/inboxOpenTracking';
import { EVENT_RULES, FORBIDDEN_PROPERTY_NAMES, TRACKING_PLAN_VERSION } from '../analytics/contract';
import { buildPersonProperties } from '../analytics/profileProperties';
import { sanitizeProperties } from '../analytics/sanitize';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(here, '..', rel), 'utf8');
const NOW = new Date('2026-11-16T12:00:00Z');

describe('1. shared alerts fetch, coalesced triggers', () => {
  function harness() {
    const timers: Array<() => void> = [];
    let runs = 0;
    let release: (() => void) | null = null;
    const coalescer = createRefreshCoalescer({
      schedule: (_ms, run) => timers.push(run),
      run: async () => {
        runs++;
        await new Promise<void>((r) => (release = r));
      },
    });
    const tick = async () => {
      const due = timers.splice(0);
      due.forEach((run) => run());
      await new Promise((r) => setImmediate(r));
    };
    return { coalescer, timers, tick, runs: () => runs, release: () => release?.() };
  }

  it('simultaneous triggers (push + foreground + focus) make one fetch', async () => {
    const h = harness();
    h.coalescer.request();
    h.coalescer.request();
    h.coalescer.request();
    assert.equal(h.timers.length, 1);
    await h.tick();
    assert.equal(h.runs(), 1);
  });

  it('a trigger during a fetch runs exactly once more afterwards, never in parallel', async () => {
    const h = harness();
    h.coalescer.request();
    await h.tick();
    h.coalescer.request();
    h.coalescer.request();
    assert.equal(h.timers.length, 0, 'not scheduled while running');
    h.release();
    await new Promise((r) => setImmediate(r));
    assert.equal(h.timers.length, 1);
    await h.tick();
    assert.equal(h.runs(), 2);
  });

  it('the refresh bus reaches every subscriber and stops after unsubscribe', () => {
    const got: string[] = [];
    const off = subscribeAlertsRefresh((reason) => got.push(reason));
    requestAlertsRefresh('push');
    off();
    requestAlertsRefresh('focus');
    assert.deepEqual(got, ['push']);
  });

  it('wiring: one provider for badge and inbox; push, foreground, focus and 30 s triggers', () => {
    const hook = read('hooks/useNearbyAlerts.ts');
    assert.match(hook, /export function NearbyAlertsProvider/);
    assert.match(hook, /subscribeAlertsRefresh\(requestRefresh\)/);
    assert.match(hook, /next === 'active'\) requestRefresh\('foreground'\)/);
    assert.match(hook, /requestRefresh\('interval'\)/);
    assert.match(hook, /buildAlertsRef\.current\('interval', true\)/);
    const tabs = read('navigation/RootTabs.tsx');
    assert.match(tabs, /<NearbyAlertsProvider>\s*<RootTabsNavigator \/>/);
    const screen = read('screens/AlertsScreen.tsx');
    assert.match(screen, /requestRefresh\('focus'\)/);
    const app = read('App.tsx');
    assert.match(app, /if \(target\.actorUid\) requestAlertsRefresh\('push'\)/);
    // Read-state protections stay.
    assert.match(hook, /mergeSeenMaps\(loadedSeen, localSeenFor\(uid\)\)/);
  });
});

describe('2. occupation from its own mode', () => {
  it('a literal-only doc reports its mode occupation (never the other mode, never top level)', () => {
    const doc = {
      mode: 'professional',
      occupation: 'TopLevel',
      'profiles.personal.occupation': 'Baker',
      'profiles.professional.occupation': 'Engineer',
    };
    const patch = buildPersonProperties(doc, null, NOW);
    assert.equal(patch.set.occupation, 'Engineer');
    const personal = buildPersonProperties({ ...doc, mode: 'personal' }, null, NOW);
    assert.equal(personal.set.occupation, 'Baker');
  });

  it('literal wins over nested; blank counts as absent; nothing falls back to top level or the other mode', () => {
    assert.equal(
      buildPersonProperties(
        { mode: 'personal', 'profiles.personal.occupation': 'New', profiles: { personal: { occupation: 'Old' } } },
        null,
        NOW,
      ).set.occupation,
      'New',
    );
    const blank = buildPersonProperties(
      {
        mode: 'personal',
        occupation: 'TopLevel',
        'profiles.personal.occupation': '  ',
        profiles: { personal: { occupation: '' }, professional: { occupation: 'Engineer' } },
        'profiles.professional.occupation': 'Engineer',
      },
      null,
      NOW,
    );
    assert.equal(blank.set.occupation, undefined);
    assert.ok(blank.unset.includes('occupation'));
    assert.ok(blank.unset.includes('occupation_truncated'));
  });
});

describe('3. inbox alert_opened once per appearance', () => {
  beforeEach(() => resetInboxOpenTrackingForTests());

  it('first tap on an unseen appearance reports; reopening does not', () => {
    const item = { uid: 'peer', appearanceKey: 'peer:3', unseen: true };
    assert.equal(shouldReportInboxOpen('me', item), true);
    assert.equal(shouldReportInboxOpen('me', item), false);
    assert.equal(shouldReportInboxOpen('me', { ...item, unseen: false }), false);
  });

  it('a row already seen (e.g. by a push tap) does not report; a new appearance does', () => {
    assert.equal(shouldReportInboxOpen('me', { uid: 'peer', appearanceKey: 'peer:3', unseen: false }), false);
    assert.equal(shouldReportInboxOpen('me', { uid: 'peer', appearanceKey: 'peer:4', unseen: true }), true);
  });

  it('per account', () => {
    const item = { uid: 'peer', appearanceKey: 'peer:3', unseen: true };
    assert.equal(shouldReportInboxOpen('accountA', item), true);
    assert.equal(shouldReportInboxOpen('accountB', item), true);
    assert.equal(shouldReportInboxOpen(null, item), false);
  });

  it('wiring: decided before the seen mark; push opens keep alert_id', () => {
    const screen = read('screens/AlertsScreen.tsx');
    const tap = screen.slice(screen.indexOf('const openDiscoveryProfile'));
    assert.ok(tap.indexOf('shouldReportInboxOpen(') < tap.indexOf('void markAlertOpened(item)'));
    assert.match(read('App.tsx'), /trackAlertOpened\(\{ source: 'push', alertId, motive \}\)/);
  });
});

describe('4. inbox_item_id withdrawn', () => {
  it('not in the contract, blocked if a caller sends it, plan version bumped', () => {
    assert.equal('inbox_item_id' in EVENT_RULES.alert_opened, false);
    assert.equal(FORBIDDEN_PROPERTY_NAMES.has('inbox_item_id'), true);
    const { values } = sanitizeProperties(EVENT_RULES.alert_opened, {
      source: 'inbox',
      inbox_item_id: 'c160e5969253fa9a3c3dc669fcecf3b8',
    });
    assert.deepEqual(values, { source: 'inbox' });
    assert.equal(TRACKING_PLAN_VERSION, '2026-11-16.1');
  });
});

describe('5. editing an inactive face vs activating it', () => {
  it('the filled segment is the server-confirmed mode; the edited inactive face is only outlined', () => {
    const screen = read('screens/CompleteProfileScreen.tsx');
    assert.match(screen, /mode=\{confirmedActive\}\s*editingMode=\{activeMode\}/);
    const sw = read('components/ModeSwitch.tsx');
    assert.match(sw, /const selected = mode === option;/);
    assert.match(sw, /editingMode !== mode && editingMode === option/);
    assert.match(sw, /onToggle\(option\)/);
  });

  it('confirmedMode changes only from a server response or the loaded doc', () => {
    const screen = read('screens/CompleteProfileScreen.tsx');
    const calls = screen.match(/setConfirmedMode\(([^)]*)\)/g) ?? [];
    assert.deepEqual(calls.sort(), ['setConfirmedMode(currentMode)', 'setConfirmedMode(response.mode)'].sort());
  });

  it('the pressed segment decides: back to active, or activate only a complete saved face', () => {
    const screen = read('screens/CompleteProfileScreen.tsx');
    assert.match(screen, /requested \?\? \(editing === 'personal' \? 'professional' : 'personal'\)/);
    assert.match(screen, /openDestinationOrSwitch\(requested\)/);
  });

  it('EN/ES copy explains the inactive state without technical detail', () => {
    const en = read('i18n/resources/profile.ts');
    const es = read('i18n/locales/es.ts');
    assert.match(en, /Personal is still active: save, then tap Professional to activate it\./);
    assert.match(es, /Personal sigue activo: guarda y luego toca Profesional para activarlo\./);
  });
});

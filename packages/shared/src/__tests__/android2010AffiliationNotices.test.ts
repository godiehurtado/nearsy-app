import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  encounterNotifyCopyKey,
  parseEncounterNotifyPayload,
} from '../alerts/encounterNotifyPayload.ts';
import {
  affiliationFieldsChanged,
  reevaluateAfterAffiliationSave,
} from '../affiliations/affiliationReevaluate.ts';
import { createPushOpenCoordinator } from '../analytics/pushOpenCoordinator.ts';
import settingsEn from '../i18n/resources/settings.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

const push = (motive: unknown, extra: Record<string, unknown> = {}) =>
  parseEncounterNotifyPayload({ kind: 'contact_nearby', actorUid: 'peer1', motive, ...extra });

describe('encounter motives (Functions contract)', () => {
  it('accepts affiliation and contact_affiliation, keeping interest, contact and both', () => {
    assert.equal(push('affiliation')?.motive, 'affiliation');
    assert.equal(push('affiliation')?.fromContacts, false);
    assert.equal(push('contact_affiliation')?.motive, 'contact_affiliation');
    assert.equal(push('contact_affiliation')?.fromContacts, true);
    assert.equal(push('interest')?.motive, 'interest');
    assert.equal(push('contact')?.fromContacts, true);
    assert.equal(push('both')?.fromContacts, true);
  });

  it('an unknown motive still parses, with the actor to open', () => {
    const parsed = push('venue_cohort');
    assert.equal(parsed?.motive, 'unknown');
    assert.equal(parsed?.actorUid, 'peer1');
    assert.equal(encounterNotifyCopyKey('unknown'), 'generic');
    assert.equal(push(42)?.motive, 'interest');
    assert.equal(push(undefined, { fromContacts: true })?.motive, 'contact');
  });

  it('a push with a new motive opens the profile and reports alert_opened once', () => {
    const opened: string[] = [];
    const emitted: unknown[] = [];
    const coordinator = createPushOpenCoordinator({
      now: () => 0,
      currentUid: () => 'me',
      canNavigate: () => true,
      openProfile: (uid) => opened.push(uid),
      emitOpened: (alertId) => emitted.push(alertId),
      readLastHandledId: async () => null,
      writeLastHandledId: async () => {},
    });
    const response = {
      actionIdentifier: 'default',
      notification: {
        date: 1,
        request: {
          identifier: 'n1',
          content: {
            data: {
              kind: 'contact_nearby',
              actorUid: 'peer1',
              motive: 'contact_affiliation',
              alertId: 'alert_1',
            },
          },
        },
      },
    };
    coordinator.handleResponse(response as never);
    coordinator.handleResponse(response as never);
    assert.deepEqual(opened, ['peer1']);
    assert.equal(emitted.length, 1);
  });
});

describe('notifyNearbyInterests label', () => {
  it('renamed in EN and ES; the stored field is unchanged', () => {
    assert.equal(settingsEn.nearbyNotices.title, 'Shared interests and affiliations');
    assert.ok(src('i18n/locales/es.ts').includes("title: 'Intereses y afiliaciones compartidos'"));
    const more = src('screens/MoreScreen.tsx');
    assert.ok(more.includes('data.notifyNearbyInterests !== false'));
    assert.ok(more.includes('buildNotifyNearbyInterestsPatch(enabled)'));
  });
});

describe('re-evaluation after saving affiliations', () => {
  const row = { category: 'sport', label: 'Club', imageUrl: null };

  it('only a real change asks for it', () => {
    const patch = { personalAffiliations: [row], personalOnboardingAffiliations: [{ id: 'a', name: 'Club' }] };
    assert.equal(affiliationFieldsChanged(patch, patch), false);
    // Key order of a stored map is not a change.
    assert.equal(
      affiliationFieldsChanged(patch, {
        personalOnboardingAffiliations: [{ name: 'Club', id: 'a' }],
        personalAffiliations: [{ imageUrl: null, label: 'Club', category: 'sport' }],
      }),
      false,
    );
    assert.equal(affiliationFieldsChanged(patch, {}), true);
    assert.equal(affiliationFieldsChanged({ personalAffiliations: [] }, {}), false);
    assert.equal(affiliationFieldsChanged({ personalAffiliations: [] }, { personalAffiliations: [row] }), true);
    // Lifecycle keys are not affiliations.
    assert.equal(affiliationFieldsChanged({ profileSetupCompleted: false }, {}), false);
  });

  it('schedules once per change and a failure never escapes', () => {
    let calls = 0;
    reevaluateAfterAffiliationSave(false, () => (calls += 1));
    reevaluateAfterAffiliationSave(true, () => (calls += 1));
    assert.equal(calls, 1);
    assert.doesNotThrow(() =>
      reevaluateAfterAffiliationSave(true, () => {
        throw new Error('offline');
      }),
    );
  });

  it('both editors call it after the write succeeds', () => {
    const editor = src('screens/AffiliationsScreen.tsx');
    const write = editor.indexOf(".set({ ...patch, updatedAt: Date.now() }, { merge: true });");
    const call = editor.indexOf('reevaluateAfterAffiliationSave(');
    assert.ok(write > 0 && call > write);
    const crj = src('screens/ProfileCompletionScreen.tsx');
    const persist = crj.slice(crj.indexOf('async function persistAffiliations()'));
    const crjWrite = persist.indexOf('await updateUserProfilePartial(uid, patch);');
    const crjCall = persist.indexOf('affiliationFieldsChanged(patch, shellData)');
    assert.ok(crjWrite > 0 && crjCall > crjWrite);
  });
});

/**
 * Approved Functions contract: affiliation motives, unknown motives, the
 * renamed notice setting and reevaluation after affiliation saves.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { reevaluateAfterAffiliationSave } from '../affiliations/affiliationReevaluation';
import type { OnboardingSelectedAffiliation } from '../affiliations/onboardingAffiliationCatalog';
import { parseEncounterNotifyPayload } from '../alerts/encounterNotifyPayload';
import { parsePushOpenTarget } from '../alerts/pushOpenCoordinator';
import { EVENT_RULES } from '../analytics/contract';
import { buildNotifyNearbyInterestsPatch, resolveNotifyNearbyInterests } from '../alerts/notifyPrefs';
import es from '../i18n/locales/es';
import enSettings from '../i18n/resources/settings';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path: string) => readFileSync(join(here, '..', path), 'utf8');
const base = { kind: 'contact_nearby', actorUid: 'peer-1' };

describe('encounter motives', () => {
  it('keeps interest, contact and both', () => {
    for (const motive of ['interest', 'contact', 'both'] as const) {
      assert.equal(parseEncounterNotifyPayload({ ...base, motive })?.motive, motive);
    }
  });

  it('accepts affiliation and contact_affiliation', () => {
    const affiliation = parseEncounterNotifyPayload({ ...base, motive: 'affiliation' });
    assert.equal(affiliation?.motive, 'affiliation');
    assert.equal(affiliation?.fromContacts, false);
    const contactAffiliation = parseEncounterNotifyPayload({ ...base, motive: 'contact_affiliation' });
    assert.equal(contactAffiliation?.motive, 'contact_affiliation');
    assert.equal(contactAffiliation?.fromContacts, true);
  });

  it('an unknown motive is left out, never guessed, and the push still parses', () => {
    for (const motive of ['venue', 'AFFILIATION', '', 42, {}]) {
      const parsed = parseEncounterNotifyPayload({ ...base, motive });
      assert.ok(parsed, String(motive));
      assert.equal(parsed?.actorUid, 'peer-1');
      assert.equal('motive' in (parsed ?? {}), false, String(motive));
    }
    assert.equal(parseEncounterNotifyPayload({ ...base, motive: 'venue', fromContacts: true })?.fromContacts, true);
  });

  it('old payloads without a motive keep their fallback', () => {
    assert.equal(parseEncounterNotifyPayload({ ...base })?.motive, 'interest');
    assert.equal(parseEncounterNotifyPayload({ ...base, fromContacts: true })?.motive, 'contact');
  });

  it('the tap target keeps actorUid and alertId with any motive', () => {
    for (const motive of ['affiliation', 'contact_affiliation', 'venue', undefined]) {
      const target = parsePushOpenTarget({ ...base, motive, alertId: 'a-1' });
      assert.equal(target.actorUid, 'peer-1');
      assert.equal(target.alertId, 'a-1');
    }
    assert.equal(parsePushOpenTarget({ ...base, motive: 'venue' }).motive, undefined);
    assert.equal(parsePushOpenTarget({ ...base, motive: 'affiliation' }).motive, 'affiliation');
  });

  it('analytics accepts the new motives', () => {
    const values = (EVENT_RULES.alert_opened.alert_motive as { values: readonly string[] }).values;
    assert.deepEqual([...values], ['interest', 'contact', 'both', 'affiliation', 'contact_affiliation', 'industry']);
  });
});

describe('notice setting', () => {
  it('is renamed in both languages', () => {
    assert.equal(enSettings.nearbyNotices.title, 'Shared interests and affiliations');
    assert.equal((es as any).settings.nearbyNotices.title, 'Intereses y afiliaciones compartidos');
    assert.match(enSettings.nearbyNotices.description, /interest or affiliation/);
    assert.match((es as any).settings.nearbyNotices.description, /interés o una afiliación/);
  });

  it('keeps the stored field and its default', () => {
    assert.deepEqual(buildNotifyNearbyInterestsPatch(false), { notifyNearbyInterests: false });
    assert.equal(resolveNotifyNearbyInterests(undefined), true);
    assert.match(read('screens/MoreScreen.tsx'), /value=\{notifyNearbyInterests\}/);
  });
});

describe('reevaluation after affiliation saves', () => {
  const org = (id: string): OnboardingSelectedAffiliation =>
    ({ id, name: id, categoryId: 'education' }) as OnboardingSelectedAffiliation;

  it('schedules once for a real change and never for an unchanged save', () => {
    let calls = 0;
    const schedule = () => {
      calls += 1;
    };
    assert.equal(reevaluateAfterAffiliationSave([org('a')], [org('a')], schedule), false);
    assert.equal(calls, 0);
    assert.equal(reevaluateAfterAffiliationSave([org('a')], [org('a'), org('b')], schedule), true);
    assert.equal(reevaluateAfterAffiliationSave([org('a'), org('b')], [org('b')], schedule), true);
    assert.equal(calls, 2);
  });

  it('a scheduling failure never fails the save', () => {
    assert.equal(
      reevaluateAfterAffiliationSave([], [org('a')], () => {
        throw new Error('pending store unavailable');
      }),
      true,
    );
  });

  it('both save paths call it only after the write succeeded', () => {
    assert.match(
      read('screens/AffiliationsScreen.tsx'),
      /await updateUserProfilePartial\(editorUid, patch\);\s*reevaluateAfterAffiliationSave\(snapshotRef\.current, resolved\);\s*snapshotRef\.current = resolved;/,
    );
    assert.match(
      read('screens/ProfileCompletionScreen.tsx'),
      /const saved = readOnboardingAffiliationsFromDoc\(shellData, mode\);[\s\S]{0,200}await updateUserProfilePartial\(uid, patch\);\s*reevaluateAfterAffiliationSave\(saved, resolved\);/,
    );
  });

  it('the shared scheduler is debounced and swallows a failed pending mark', () => {
    const scheduler = read('alerts/reevaluateProximityNotices.ts');
    assert.match(scheduler, /const DEBOUNCE_MS = 10_000;/);
    assert.match(scheduler, /if \(timer\) clearTimeout\(timer\);/);
    assert.match(scheduler, /void getReevaluatePendingStore\(\)\.markPending\(uid\)\.catch\(\(\) => \{\}\);/);
  });
});

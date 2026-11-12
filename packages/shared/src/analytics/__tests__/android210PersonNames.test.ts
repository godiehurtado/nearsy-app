/**
 * 2.1.0 contract with iOS and Functions: `first_name` / `last_name` person
 * properties from the top-level account fields `realName` / `lastName`.
 * At most 80 characters, $unset when removed, never on events or in logs.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildPersonProperties,
  personKeysToUnset,
  PERSON_NAME_MAX,
} from '../analyticsPersonProperties.ts';
import { describeForInspection } from '../analyticsContract.ts';

const here = dirname(fileURLToPath(import.meta.url));

const person = (doc: Record<string, unknown>) =>
  buildPersonProperties({
    doc,
    authEmail: null,
    normalizeLanguages: (values) => values as string[],
    now: new Date('2026-11-12T00:00:00Z'),
  })!;

describe('first_name and last_name', () => {
  it('come from the top-level account fields, trimmed', () => {
    const out = person({ mode: 'personal', realName: '  Ana María ', lastName: ' Gómez ' });
    assert.equal(out.first_name, 'Ana María');
    assert.equal(out.last_name, 'Gómez');
  });

  it('never split a display name, and never read the per-mode presentation', () => {
    const out = person({
      mode: 'professional',
      displayName: 'Ana Gómez',
      profiles: { professional: { realName: 'Ana', lastName: 'Gómez' } },
    });
    assert.ok(!('first_name' in out));
    assert.ok(!('last_name' in out));
  });

  it('are cut at 80 characters, not UTF-16 units', () => {
    const out = person({ realName: '🏀'.repeat(90), lastName: 'ñ'.repeat(81) });
    assert.equal(Array.from(out.first_name as string).length, PERSON_NAME_MAX);
    assert.equal(Array.from(out.last_name as string).length, PERSON_NAME_MAX);
    assert.doesNotMatch(out.first_name as string, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });

  it('removed or blank: left out of $set and removed with $unset, never null', () => {
    for (const doc of [{ mode: 'personal' }, { mode: 'personal', realName: '   ', lastName: '' }]) {
      const properties = person(doc);
      assert.ok(!('first_name' in properties));
      assert.ok(!('last_name' in properties));
      const unset = personKeysToUnset({ doc, properties, previousMode: 'personal' });
      assert.ok(unset.includes('first_name'));
      assert.ok(unset.includes('last_name'));
    }
    const kept = person({ mode: 'personal', realName: 'Ana' });
    const unset = personKeysToUnset({ doc: { mode: 'personal', realName: 'Ana' }, properties: kept, previousMode: 'personal' });
    assert.ok(!unset.includes('first_name'));
    assert.ok(unset.includes('last_name'));
  });

  it('a mode switch does not clear them', () => {
    const doc = { mode: 'professional', realName: 'Ana', lastName: 'Gómez' };
    const unset = personKeysToUnset({ doc, properties: person(doc), previousMode: 'personal' });
    assert.ok(!unset.includes('first_name'));
    assert.ok(!unset.includes('last_name'));
  });

  it('are masked in local inspection logs', () => {
    const shown = describeForInspection({ first_name: 'Ana', last_name: 'Gómez' });
    assert.deepEqual(shown, { first_name: '<redacted>', last_name: '<redacted>' });
  });

  it('are person properties only: no event contract or super property carries them', () => {
    const contract = readFileSync(join(here, '..', 'analyticsContract.ts'), 'utf8');
    assert.doesNotMatch(contract, /first_name|last_name/);
    const binding = readFileSync(join(here, '..', 'analytics.android.ts'), 'utf8');
    assert.doesNotMatch(binding, /first_name|last_name|realName|lastName/);
  });
});

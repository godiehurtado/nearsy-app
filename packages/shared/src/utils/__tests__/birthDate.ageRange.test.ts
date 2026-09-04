/**
 * Registration age window — Nearsy 2.0 is 18–99 (not legacy 14).
 *
 * Run:
 *   node --experimental-strip-types --test packages/shared/src/utils/__tests__/birthDate.ageRange.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MAX_REGISTRATION_AGE,
  MIN_REGISTRATION_AGE,
  meetsMaximumRegistrationAge,
  meetsMinimumRegistrationAge,
  meetsRegistrationAgeRange,
  type BirthDateParts,
} from '../birthDate.ts';

const asOf = new Date(2026, 8, 4); // 2026-09-04 local

function parts(year: number, month: number, day: number): BirthDateParts {
  return { year, month, day };
}

describe('Nearsy 2.0 registration age window', () => {
  it('exports 18–99 product bounds', () => {
    assert.equal(MIN_REGISTRATION_AGE, 18);
    assert.equal(MAX_REGISTRATION_AGE, 99);
  });

  it('turns 18 today → allowed; turns 18 tomorrow → blocked', () => {
    assert.equal(meetsMinimumRegistrationAge(parts(2008, 9, 4), asOf), true);
    assert.equal(meetsMinimumRegistrationAge(parts(2008, 9, 5), asOf), false);
    assert.equal(meetsRegistrationAgeRange(parts(2008, 9, 4), asOf), true);
  });

  it('legacy age 14 is not sufficient', () => {
    assert.equal(meetsMinimumRegistrationAge(parts(2012, 9, 4), asOf), false);
    assert.equal(meetsRegistrationAgeRange(parts(2012, 9, 4), asOf), false);
  });

  it('turns 99 today → allowed; turns 100 today → blocked', () => {
    assert.equal(meetsMaximumRegistrationAge(parts(1927, 9, 4), asOf), true);
    assert.equal(meetsMaximumRegistrationAge(parts(1926, 9, 4), asOf), false);
    assert.equal(meetsRegistrationAgeRange(parts(1927, 9, 4), asOf), true);
    assert.equal(meetsRegistrationAgeRange(parts(1926, 9, 4), asOf), false);
  });
});

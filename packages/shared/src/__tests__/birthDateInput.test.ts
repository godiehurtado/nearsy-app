import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ageFromBirthDate,
  applyBirthDateTextChange,
  applyCalendarBirthDate,
  birthDatePlaceholderForOrder,
  birthDateToIso,
  birthPartsFromDigits,
  birthPartsFromIso,
  birthPartsToLocalDate,
  commitCalendarSelection,
  defaultAdultBirthDate,
  digitsFromBirthParts,
  formatBirthDateDigits,
  formatBirthPartsVisible,
  isCompleteBirthDate,
  isBirthDateInFuture,
  isSelectableAdultBirthDate,
  localDateToBirthParts,
  maxAdultBirthDate,
  meetsMinimumRegistrationAge,
  MIN_REGISTRATION_AGE,
  normalizeBirthDateInput,
  resolveBirthDateOrder,
  resolveCalendarInitialBirthDate,
  type BirthDateParts,
} from '../utils/birthDate';

describe('resolveBirthDateOrder (device locale, not app language)', () => {
  it('uses MDY for en-US', () => {
    assert.equal(resolveBirthDateOrder('en-US'), 'MDY');
  });

  it('uses DMY for en-GB even when app language could be English', () => {
    assert.equal(resolveBirthDateOrder('en-GB'), 'DMY');
  });

  it('uses DMY for es-ES', () => {
    assert.equal(resolveBirthDateOrder('es-ES'), 'DMY');
  });

  it('uses MDY for es-US (Spanish app language + US region)', () => {
    assert.equal(resolveBirthDateOrder('es-US'), 'MDY');
  });
});

describe('masked birth date input MDY', () => {
  it('inserts separators for progressive typing', () => {
    assert.equal(formatBirthDateDigits('1', 'MDY'), '1');
    assert.equal(formatBirthDateDigits('12', 'MDY'), '12');
    assert.equal(formatBirthDateDigits('123', 'MDY'), '12/3');
    assert.equal(formatBirthDateDigits('1231', 'MDY'), '12/31');
    assert.equal(formatBirthDateDigits('12311990', 'MDY'), '12/31/1990');
  });

  it('supports backspace across separators', () => {
    const formatted = '12/31/1990';
    const afterSepDelete = applyBirthDateTextChange(
      formatted,
      '12/31/199',
      'MDY',
    );
    assert.equal(afterSepDelete, '1231199');
    assert.equal(formatBirthDateDigits(afterSepDelete, 'MDY'), '12/31/199');

    // Deleting a separator keeps the same digit count → drop last digit.
    const acrossSlash = applyBirthDateTextChange('12/31', '1231', 'MDY');
    assert.equal(acrossSlash, '123');
    assert.equal(formatBirthDateDigits(acrossSlash, 'MDY'), '12/3');
  });

  it('pastes with separators and eight digits', () => {
    assert.equal(normalizeBirthDateInput('12/31/1990', 'MDY'), '12311990');
    assert.equal(normalizeBirthDateInput('12311990', 'MDY'), '12311990');
    assert.equal(
      formatBirthDateDigits(normalizeBirthDateInput('12311990', 'MDY'), 'MDY'),
      '12/31/1990',
    );
  });
});

describe('masked birth date input DMY', () => {
  it('formats day-first progressive typing', () => {
    assert.equal(formatBirthDateDigits('31121990', 'DMY'), '31/12/1990');
    assert.equal(formatBirthDateDigits('3112', 'DMY'), '31/12');
  });

  it('pastes day-first values', () => {
    assert.equal(normalizeBirthDateInput('31/12/1990', 'DMY'), '31121990');
    assert.equal(normalizeBirthDateInput('31121990', 'DMY'), '31121990');
  });
});

describe('civil validation', () => {
  const asOf = new Date(2026, 7, 13);

  it('accepts a valid civil date', () => {
    const parts = birthPartsFromDigits('12311990', 'MDY');
    assert.deepEqual(parts, { month: 12, day: 31, year: 1990 });
    assert.equal(isCompleteBirthDate(parts), true);
    assert.equal(birthDateToIso(parts), '1990-12-31');
  });

  it('rejects impossible day', () => {
    assert.equal(
      isCompleteBirthDate(birthPartsFromDigits('02312000', 'MDY')),
      false,
    );
    assert.equal(
      isCompleteBirthDate({ day: 31, month: 2, year: 2000 }),
      false,
    );
  });

  it('rejects impossible month', () => {
    assert.equal(
      isCompleteBirthDate(birthPartsFromDigits('13011990', 'MDY')),
      false,
    );
  });

  it('accepts leap-day Feb 29 on leap year', () => {
    assert.equal(
      isCompleteBirthDate({ day: 29, month: 2, year: 2000 }),
      true,
    );
  });

  it('rejects leap-day Feb 29 on non-leap year', () => {
    assert.equal(
      isCompleteBirthDate({ day: 29, month: 2, year: 2001 }),
      false,
    );
  });

  it('rejects future dates', () => {
    const future: BirthDateParts = { day: 1, month: 1, year: 2030 };
    assert.equal(isBirthDateInFuture(future, asOf), true);
    assert.equal(meetsMinimumRegistrationAge(future, asOf), false);
    assert.equal(birthDateToIso(future), null);
  });

  it('allows exactly 18 years old today', () => {
    const b: BirthDateParts = { day: 13, month: 8, year: 2008 };
    assert.equal(meetsMinimumRegistrationAge(b, asOf), true);
    assert.equal(ageFromBirthDate(b, asOf), 18);
  });

  it('blocks one day under 18', () => {
    const b: BirthDateParts = { day: 14, month: 8, year: 2008 };
    assert.equal(meetsMinimumRegistrationAge(b, asOf), false);
    assert.equal(ageFromBirthDate(b, asOf), 17);
  });

  it('supports year changes without Date rollover', () => {
    const leapOk = birthPartsFromDigits('02292000', 'MDY');
    const leapBad = birthPartsFromDigits('02292001', 'MDY');
    assert.equal(isCompleteBirthDate(leapOk), true);
    assert.equal(isCompleteBirthDate(leapBad), false);
    assert.equal(birthDateToIso(leapBad), null);
  });
});

describe('canonical identity across locales', () => {
  const canonical = '1990-12-31';
  const parts = birthPartsFromIso(canonical)!;

  it('loads existing ISO into civil parts', () => {
    assert.deepEqual(parts, { year: 1990, month: 12, day: 31 });
  });

  it('converts civil → visible → civil → canonical for MDY and DMY', () => {
    for (const order of ['MDY', 'DMY'] as const) {
      const digits = digitsFromBirthParts(parts, order);
      const visible = formatBirthDateDigits(digits, order);
      const again = birthPartsFromDigits(
        normalizeBirthDateInput(visible, order),
        order,
      );
      assert.equal(birthDateToIso(again), canonical);
      assert.equal(formatBirthPartsVisible(parts, order), visible);
    }
  });

  it('keeps the same canonical value when only locale/order changes', () => {
    const usDigits = digitsFromBirthParts(parts, 'MDY');
    const dfDigits = digitsFromBirthParts(parts, 'DMY');
    assert.equal(formatBirthDateDigits(usDigits, 'MDY'), '12/31/1990');
    assert.equal(formatBirthDateDigits(dfDigits, 'DMY'), '31/12/1990');
    assert.equal(
      birthDateToIso(birthPartsFromDigits(usDigits, 'MDY')),
      canonical,
    );
    assert.equal(
      birthDateToIso(birthPartsFromDigits(dfDigits, 'DMY')),
      canonical,
    );
  });

  it('normalizes ISO paste into the active visible order digits', () => {
    assert.equal(normalizeBirthDateInput(canonical, 'MDY'), '12311990');
    assert.equal(normalizeBirthDateInput(canonical, 'DMY'), '31121990');
  });

  it('does not silently reinterpret US slash order under DMY', () => {
    // Digits follow the visible DMY order; 12/31/1990 → day 12, month 31 → invalid.
    const digits = normalizeBirthDateInput('12/31/1990', 'DMY');
    assert.equal(digits, '12311990');
    assert.equal(isCompleteBirthDate(birthPartsFromDigits(digits, 'DMY')), false);
  });
});

describe('editing existing value', () => {
  it('round-trips persisted ISO through digits for edit sessions', () => {
    const iso = '1995-06-15';
    const parts = birthPartsFromIso(iso)!;
    const digits = digitsFromBirthParts(parts, 'MDY');
    assert.equal(formatBirthDateDigits(digits, 'MDY'), '06/15/1995');
    const edited = applyBirthDateTextChange(
      '06/15/1995',
      '06/15/1996',
      'MDY',
    );
    assert.equal(edited, '06151996');
    assert.equal(
      birthDateToIso(birthPartsFromDigits(edited, 'MDY')),
      '1996-06-15',
    );
  });
});

describe('placeholders and calendar bounds helpers', () => {
  it('exposes localized placeholders', () => {
    assert.equal(birthDatePlaceholderForOrder('MDY'), 'MM/DD/YYYY');
    assert.equal(birthDatePlaceholderForOrder('DMY'), 'DD/MM/YYYY');
    assert.equal(birthDatePlaceholderForOrder('YMD'), 'YYYY/MM/DD');
  });

  it('maxAdultBirthDate is exactly today minus 18 years', () => {
    const asOf = new Date(2026, 7, 13);
    assert.deepEqual(maxAdultBirthDate(asOf), {
      year: 2008,
      month: 8,
      day: 13,
    });
    assert.equal(MIN_REGISTRATION_AGE, 18);
    assert.equal(
      meetsMinimumRegistrationAge(maxAdultBirthDate(asOf), asOf),
      true,
    );
  });

  it('defaultAdultBirthDate is today minus 25 years', () => {
    const asOf = new Date(2026, 7, 13);
    assert.deepEqual(defaultAdultBirthDate(asOf), {
      year: 2001,
      month: 8,
      day: 13,
    });
  });
});

describe('calendar civil date helpers', () => {
  const asOf = new Date(2026, 7, 17);
  const canonical = '1990-12-31';
  const parts = birthPartsFromIso(canonical)!;

  it('converts canonical → picker local Date → civil parts → canonical', () => {
    const pickerDate = birthPartsToLocalDate(parts);
    assert.ok(pickerDate);
    assert.equal(pickerDate.getFullYear(), 1990);
    assert.equal(pickerDate.getMonth(), 11);
    assert.equal(pickerDate.getDate(), 31);
    const back = localDateToBirthParts(pickerDate);
    assert.equal(birthDateToIso(back), canonical);
  });

  it('maxAdultBirthDate is exactly today minus 18 years (not year-only)', () => {
    assert.deepEqual(maxAdultBirthDate(asOf), {
      year: 2008,
      month: 8,
      day: 17,
    });
    const maxDate = birthPartsToLocalDate(maxAdultBirthDate(asOf))!;
    assert.equal(maxDate.getFullYear(), 2008);
    assert.equal(maxDate.getMonth(), 7);
    assert.equal(maxDate.getDate(), 17);
  });

  it('fallback today-25 is inside the allowed adult range', () => {
    const fallback = defaultAdultBirthDate(asOf);
    assert.deepEqual(fallback, { year: 2001, month: 8, day: 17 });
    assert.equal(isSelectableAdultBirthDate(fallback, asOf), true);
    const max = maxAdultBirthDate(asOf);
    const fallbackTime = birthPartsToLocalDate(fallback)!.getTime();
    const maxTime = birthPartsToLocalDate(max)!.getTime();
    assert.equal(fallbackTime <= maxTime, true);
  });

  it('exactly 18 years is selectable; one day younger is not', () => {
    const exactly18: BirthDateParts = { day: 17, month: 8, year: 2008 };
    const tomorrow18: BirthDateParts = { day: 18, month: 8, year: 2008 };
    assert.equal(isSelectableAdultBirthDate(exactly18, asOf), true);
    assert.equal(isSelectableAdultBirthDate(tomorrow18, asOf), false);
    assert.equal(applyCalendarBirthDate(tomorrow18, 'MDY', asOf), null);
  });

  it('opens on typed valid date and uses fallback for invalid input', () => {
    assert.deepEqual(resolveCalendarInitialBirthDate(parts, asOf), parts);
    const invalid: BirthDateParts = { day: 31, month: 2, year: 2000 };
    assert.deepEqual(
      resolveCalendarInitialBirthDate(invalid, asOf),
      defaultAdultBirthDate(asOf),
    );
    const empty: BirthDateParts = { day: null, month: null, year: null };
    assert.deepEqual(
      resolveCalendarInitialBirthDate(empty, asOf),
      defaultAdultBirthDate(asOf),
    );
  });

  it('round-trips manual digits → calendar civil → canonical', () => {
    const digits = normalizeBirthDateInput('12/31/1990', 'MDY');
    const typed = birthPartsFromDigits(digits, 'MDY');
    const initial = resolveCalendarInitialBirthDate(typed, asOf);
    const pickerDate = birthPartsToLocalDate(initial)!;
    const selected = localDateToBirthParts(pickerDate);
    assert.equal(birthDateToIso(selected), canonical);
  });

  it('calendar selection formats US and day-first without changing canonical', () => {
    const pickerDate = birthPartsToLocalDate(parts)!;
    const selected = localDateToBirthParts(pickerDate);
    const usDigits = applyCalendarBirthDate(selected, 'MDY', asOf);
    const dfDigits = applyCalendarBirthDate(selected, 'DMY', asOf);
    assert.equal(formatBirthDateDigits(usDigits!, 'MDY'), '12/31/1990');
    assert.equal(formatBirthDateDigits(dfDigits!, 'DMY'), '31/12/1990');
    assert.equal(birthDateToIso(birthPartsFromDigits(usDigits!, 'MDY')), canonical);
    assert.equal(birthDateToIso(birthPartsFromDigits(dfDigits!, 'DMY')), canonical);
  });

  it('cancel keeps the previous digit buffer', () => {
    const previous = digitsFromBirthParts(parts, 'MDY');
    assert.equal(commitCalendarSelection(previous, null, 'MDY', asOf), previous);
    assert.equal(
      formatBirthDateDigits(
        commitCalendarSelection(previous, null, 'MDY', asOf),
        'MDY',
      ),
      '12/31/1990',
    );
  });
});

/** Full birth date — day, month and year. Never year-only (CRJ / TSB-001). */

/** Productive minimum age for registration (do not change without product approval). */
export const MIN_REGISTRATION_AGE = 18;
/** Productive maximum age for registration and onboarding (do not change without product approval). */
export const MAX_REGISTRATION_AGE = 99;

export type BirthDateParts = {
  day: number | null;
  month: number | null;
  year: number | null;
};

export type BirthDateStrings = {
  day: string;
  month: string;
  year: string;
};

/** Visible segment order for a localized civil date (not an instant). */
export type BirthDateOrder = 'MDY' | 'DMY' | 'YMD';

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function birthPartsFromStrings(b: BirthDateStrings): BirthDateParts {
  const day = b.day ? Number(b.day) : null;
  const month = b.month ? Number(b.month) : null;
  const year = b.year ? Number(b.year) : null;
  return {
    day: Number.isFinite(day as number) ? day : null,
    month: Number.isFinite(month as number) ? month : null,
    year: Number.isFinite(year as number) ? year : null,
  };
}

/**
 * True when day/month/year form a real calendar date
 * (rejects impossible dates such as 31/02 and 29/02 on non-leap years).
 */
export function isCompleteBirthDate(b: BirthDateParts): boolean {
  if (b.day == null || b.month == null || b.year == null) return false;
  if (b.year < 1900 || b.month < 1 || b.month > 12 || b.day < 1 || b.day > 31) {
    return false;
  }
  const dt = new Date(b.year, b.month - 1, b.day);
  return (
    dt.getFullYear() === b.year &&
    dt.getMonth() === b.month - 1 &&
    dt.getDate() === b.day
  );
}

export function isBirthDateInFuture(
  b: BirthDateParts,
  asOf: Date = new Date(),
): boolean {
  if (
    !isCompleteBirthDate(b) ||
    b.day == null ||
    b.month == null ||
    b.year == null
  ) {
    return false;
  }
  const birth = startOfLocalDay(new Date(b.year, b.month - 1, b.day));
  const today = startOfLocalDay(asOf);
  return birth.getTime() > today.getTime();
}

/** Age in full years from a complete birth date; null if incomplete/invalid. */
export function ageFromBirthDate(
  b: BirthDateParts,
  asOf: Date = new Date(),
): number | null {
  if (
    !isCompleteBirthDate(b) ||
    b.day == null ||
    b.month == null ||
    b.year == null
  ) {
    return null;
  }
  if (isBirthDateInFuture(b, asOf)) return null;

  const today = startOfLocalDay(asOf);
  let age = today.getFullYear() - b.year;
  const beforeBirthday =
    today.getMonth() + 1 < b.month ||
    (today.getMonth() + 1 === b.month && today.getDate() < b.day);
  if (beforeBirthday) age -= 1;
  return age;
}

/**
 * Exact calendar age gate: turns 18 today → allowed; turns 18 tomorrow → blocked.
 * Future / non-existent dates → blocked.
 */
export function meetsMinimumRegistrationAge(
  b: BirthDateParts,
  asOf: Date = new Date(),
): boolean {
  const age = ageFromBirthDate(b, asOf);
  return age !== null && age >= MIN_REGISTRATION_AGE;
}

/** Exact calendar age gate: turns 99 today → allowed; turns 100 today → blocked. */
export function meetsMaximumRegistrationAge(
  b: BirthDateParts,
  asOf: Date = new Date(),
): boolean {
  const age = ageFromBirthDate(b, asOf);
  return age !== null && age <= MAX_REGISTRATION_AGE;
}

/** Registration/onboarding age window (18–99 inclusive), using full birth date. */
export function meetsRegistrationAgeRange(
  b: BirthDateParts,
  asOf: Date = new Date(),
): boolean {
  return (
    meetsMinimumRegistrationAge(b, asOf) &&
    meetsMaximumRegistrationAge(b, asOf)
  );
}

/** Persistable ISO date `YYYY-MM-DD` for new registrations. */
export function birthDateToIso(b: BirthDateParts): string | null {
  if (
    !isCompleteBirthDate(b) ||
    isBirthDateInFuture(b) ||
    b.day == null ||
    b.month == null ||
    b.year == null
  ) {
    return null;
  }
  const mm = String(b.month).padStart(2, '0');
  const dd = String(b.day).padStart(2, '0');
  return `${b.year}-${mm}-${dd}`;
}

/** Parse canonical `YYYY-MM-DD` into civil parts (no timezone parsing). */
export function birthPartsFromIso(iso: string): BirthDateParts | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const parts: BirthDateParts = { day, month, year };
  return isCompleteBirthDate(parts) ? parts : null;
}

/**
 * Resolve visible order from a BCP-47 locale tag (device region), not app language.
 * US region is always MDY (e.g. es-US still MM/DD/YYYY). Otherwise uses
 * Intl.formatToParts on a fixed civil date so order follows the OS locale.
 */
export function resolveBirthDateOrder(localeTag: string): BirthDateOrder {
  const tag = localeTag.trim() || 'en-US';
  const region = tag.split(/[-_]/).pop()?.toUpperCase();
  if (region === 'US') return 'MDY';

  try {
    const types = new Intl.DateTimeFormat(tag, {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    })
      .formatToParts(new Date(2000, 11, 31))
      .filter(
        (p) => p.type === 'day' || p.type === 'month' || p.type === 'year',
      )
      .map((p) => p.type);

    const key = types.join('-');
    if (key === 'month-day-year') return 'MDY';
    if (key === 'day-month-year') return 'DMY';
    if (key === 'year-month-day') return 'YMD';
  } catch {
    // fall through
  }

  return 'DMY';
}

export function birthDatePlaceholderForOrder(order: BirthDateOrder): string {
  if (order === 'MDY') return 'MM/DD/YYYY';
  if (order === 'DMY') return 'DD/MM/YYYY';
  return 'YYYY/MM/DD';
}

export function extractBirthDateDigits(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 8);
}

/** Format up to 8 digits into a localized masked display string. */
export function formatBirthDateDigits(
  digits: string,
  order: BirthDateOrder,
): string {
  const d = extractBirthDateDigits(digits);
  if (order === 'YMD') {
    if (d.length <= 4) return d;
    if (d.length <= 6) return `${d.slice(0, 4)}/${d.slice(4)}`;
    return `${d.slice(0, 4)}/${d.slice(4, 6)}/${d.slice(6)}`;
  }
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

export function digitsFromBirthParts(
  parts: BirthDateParts,
  order: BirthDateOrder,
): string {
  if (parts.day == null || parts.month == null || parts.year == null) {
    return '';
  }
  const dd = String(parts.day).padStart(2, '0');
  const mm = String(parts.month).padStart(2, '0');
  const yyyy = String(parts.year).padStart(4, '0');
  if (order === 'MDY') return `${mm}${dd}${yyyy}`;
  if (order === 'DMY') return `${dd}${mm}${yyyy}`;
  return `${yyyy}${mm}${dd}`;
}

export function formatBirthPartsVisible(
  parts: BirthDateParts,
  order: BirthDateOrder,
): string {
  const digits = digitsFromBirthParts(parts, order);
  if (digits.length !== 8) return '';
  return formatBirthDateDigits(digits, order);
}

/**
 * Map digit buffer to civil parts. Incomplete buffers yield null components
 * for missing segments (never Date-string parsing).
 */
export function birthPartsFromDigits(
  digits: string,
  order: BirthDateOrder,
): BirthDateParts {
  const d = extractBirthDateDigits(digits);
  const empty: BirthDateParts = { day: null, month: null, year: null };
  if (!d) return empty;

  const num = (slice: string): number | null => {
    if (!slice) return null;
    const n = Number(slice);
    return Number.isFinite(n) ? n : null;
  };

  if (order === 'YMD') {
    return {
      year: d.length >= 4 ? num(d.slice(0, 4)) : null,
      month: d.length >= 6 ? num(d.slice(4, 6)) : null,
      day: d.length >= 8 ? num(d.slice(6, 8)) : null,
    };
  }

  if (order === 'MDY') {
    return {
      month: d.length >= 1 ? num(d.slice(0, Math.min(2, d.length))) : null,
      day: d.length >= 3 ? num(d.slice(2, Math.min(4, d.length))) : null,
      year: d.length >= 5 ? num(d.slice(4, 8)) : null,
    };
  }

  // DMY
  return {
    day: d.length >= 1 ? num(d.slice(0, Math.min(2, d.length))) : null,
    month: d.length >= 3 ? num(d.slice(2, Math.min(4, d.length))) : null,
    year: d.length >= 5 ? num(d.slice(4, 8)) : null,
  };
}

/**
 * Normalize typed/pasted text into the digit buffer for the active order.
 * Accepts ISO `YYYY-MM-DD` explicitly; otherwise strips to digits in visible order
 * (no silent locale reinterpretation of ambiguous slash dates).
 */
export function normalizeBirthDateInput(
  raw: string,
  order: BirthDateOrder,
): string {
  const trimmed = raw.trim();
  const iso = birthPartsFromIso(trimmed);
  if (iso) {
    return digitsFromBirthParts(iso, order);
  }
  return extractBirthDateDigits(trimmed);
}

/**
 * Apply a TextInput change while treating separator backspace as digit delete.
 */
export function applyBirthDateTextChange(
  previousFormatted: string,
  nextRaw: string,
  order: BirthDateOrder,
): string {
  const prevDigits = extractBirthDateDigits(previousFormatted);
  const nextDigits = normalizeBirthDateInput(nextRaw, order);

  if (
    nextRaw.length < previousFormatted.length &&
    nextDigits.length === prevDigits.length &&
    prevDigits.length > 0
  ) {
    return prevDigits.slice(0, -1);
  }

  return nextDigits;
}

/** Civil date exactly 18 years before `asOf` (max selectable / adult today). */
export function maxAdultBirthDate(asOf: Date = new Date()): BirthDateParts {
  const today = startOfLocalDay(asOf);
  return {
    year: today.getFullYear() - MIN_REGISTRATION_AGE,
    month: today.getMonth() + 1,
    day: today.getDate(),
  };
}

/**
 * Earliest birth date still within the 99-year registration window.
 * Civil rule: day after (asOf − 100 years), not asOf − 99 years.
 */
export function minRegistrationBirthDate(asOf: Date = new Date()): BirthDateParts {
  const today = startOfLocalDay(asOf);
  const centennial = new Date(
    today.getFullYear() - (MAX_REGISTRATION_AGE + 1),
    today.getMonth(),
    today.getDate(),
  );
  const minimum = new Date(
    centennial.getFullYear(),
    centennial.getMonth(),
    centennial.getDate() + 1,
  );
  return localDateToBirthParts(minimum);
}

/** Reasonable adult default for an empty calendar (today − 25 years). */
export function defaultAdultBirthDate(asOf: Date = new Date()): BirthDateParts {
  const today = startOfLocalDay(asOf);
  return {
    year: today.getFullYear() - 25,
    month: today.getMonth() + 1,
    day: today.getDate(),
  };
}

/** Earliest civil year accepted by CRJ completeness checks. */
export const MIN_BIRTH_YEAR = 1900;

export function minBirthDateParts(): BirthDateParts {
  return { year: MIN_BIRTH_YEAR, month: 1, day: 1 };
}

/** Local Date for picker interop only — convert back to parts immediately. */
export function birthPartsToLocalDate(b: BirthDateParts): Date | null {
  if (
    !isCompleteBirthDate(b) ||
    b.day == null ||
    b.month == null ||
    b.year == null
  ) {
    return null;
  }
  return new Date(b.year, b.month - 1, b.day);
}

export function localDateToBirthParts(d: Date): BirthDateParts {
  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
  };
}

export function isSelectableAdultBirthDate(
  b: BirthDateParts,
  asOf: Date = new Date(),
): boolean {
  return isCompleteBirthDate(b) && meetsMinimumRegistrationAge(b, asOf);
}

/**
 * Calendar initial civil date: typed value only when it is a real adult date.
 * Otherwise today − 25 years (always on or before maxAdult).
 */
export function resolveCalendarInitialBirthDate(
  parts: BirthDateParts,
  asOf: Date = new Date(),
): BirthDateParts {
  if (isSelectableAdultBirthDate(parts, asOf)) {
    return { day: parts.day, month: parts.month, year: parts.year };
  }
  return defaultAdultBirthDate(asOf);
}

/** Digit buffer for a confirmed picker date; null if not an allowed adult date. */
export function applyCalendarBirthDate(
  selected: BirthDateParts,
  order: BirthDateOrder,
  asOf: Date = new Date(),
): string | null {
  if (!isSelectableAdultBirthDate(selected, asOf)) return null;
  return digitsFromBirthParts(selected, order);
}

/**
 * Confirm applies a civil selection; cancel (`selected === null`) keeps digits.
 */
export function commitCalendarSelection(
  previousDigits: string,
  selected: BirthDateParts | null,
  order: BirthDateOrder,
  asOf: Date = new Date(),
): string {
  if (selected == null) return previousDigits;
  return applyCalendarBirthDate(selected, order, asOf) ?? previousDigits;
}

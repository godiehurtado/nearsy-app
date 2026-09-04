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

/** Parse `YYYY-MM-DD` into civil parts; null if incomplete/invalid calendar date. */
export function birthPartsFromIso(iso: string): BirthDateParts | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const parts: BirthDateParts = { day, month, year };
  return isCompleteBirthDate(parts) ? parts : null;
}

/** Local civil parts from a Date (picker / Timestamp interop). */
export function localDateToBirthParts(d: Date): BirthDateParts {
  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
  };
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

/**
 * Oldest allowed registration civil date (turns MAX+1 yesterday → blocked;
 * turns MAX today → allowed).
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

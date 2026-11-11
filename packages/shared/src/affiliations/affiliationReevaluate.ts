/**
 * Proximity notices now match on affiliations too (Functions contract), so a
 * saved change to them asks the server to re-evaluate. Only a real change, and
 * the request never turns a successful save into a failed one.
 */

const AFFILIATION_FIELD_KEYS = [
  'personalAffiliations',
  'personalOnboardingAffiliations',
  'professionalAffiliations',
  'professionalOnboardingAffiliations',
] as const;

/** Key order of a stored map is not a change. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    return `{${Object.keys(rec)
      .filter((key) => rec[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(rec[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/**
 * True when the affiliation fields written by `patch` differ from `previous`
 * (the stored document, or the patch built from the last saved selection).
 * A missing previous field counts as an empty list.
 */
export function affiliationFieldsChanged(
  patch: Record<string, unknown>,
  previous: Record<string, unknown> | null | undefined,
): boolean {
  return AFFILIATION_FIELD_KEYS.some((key) => {
    if (!(key in patch)) return false;
    const before = previous?.[key];
    return canonical(patch[key]) !== canonical(before === undefined || before === null ? [] : before);
  });
}

/** Debounced by the scheduler itself; a failure here is swallowed. */
export function reevaluateAfterAffiliationSave(changed: boolean, schedule: () => void): void {
  if (!changed) return;
  try {
    schedule();
  } catch {
    // The save already succeeded; a pending re-evaluation is retried on its own.
  }
}

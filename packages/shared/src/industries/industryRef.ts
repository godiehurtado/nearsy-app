/**
 * Industry ids and the Discovery `{ id, name }` object (Industry contract §2,
 * §4). No catalog import, so parsers stay light.
 */

/** Contract §2: catalog id, or null for "Not specified". */
export const INDUSTRY_ID_PATTERN = /^[a-z][a-z0-9_]{1,40}$/;
/** Discovery `name` is the English catalog label (≤ 40); 80 leaves headroom. */
export const INDUSTRY_NAME_MAX_CHARS = 80;

export function isIndustryId(value: unknown): value is string {
  return typeof value === 'string' && INDUSTRY_ID_PATTERN.test(value);
}

export function cleanIndustryName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.replace(/\s+/g, ' ').trim();
  if (!name) return null;
  const chars = [...name];
  return chars.length > INDUSTRY_NAME_MAX_CHARS
    ? chars.slice(0, INDUSTRY_NAME_MAX_CHARS).join('')
    : name;
}

/** Discovery `{ id, name }`; `name` is the English label, a fallback only. */
export type IndustryRef = { id: string; name: string };

/** Exactly `{ id, name }` per contract §4; anything malformed is ignored. */
export function parseIndustryRef(value: unknown): IndustryRef | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const { id, name } = value as { id?: unknown; name?: unknown };
  if (!isIndustryId(id)) return undefined;
  const clean = cleanIndustryName(name);
  if (!clean) return undefined;
  return { id, name: clean };
}

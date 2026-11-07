/**
 * Interests and affiliations as person properties.
 *
 * Custom rows have ids such as `custom_music_<slug>_<ts>` that embed what the
 * user typed, so a custom id never reaches `interests` or `affiliations`: those
 * only hold stable catalog or provider ids. The original text goes to
 * `*_custom`, and a comparable form to `*_custom_normalized`.
 *
 * These limits only shape what analytics sends. Counts are real totals, and the
 * profile is never modified.
 */
import type { AnalyticsProperties } from './analyticsContract.ts';

export const MAX_ANALYTICS_LIST_ITEMS = 100;
export const MAX_ANALYTICS_TEXT_LENGTH = 120;

/** Trim, collapse spaces, lowercase. Synonyms are not merged. */
export function normalizeCustomText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

type SplitRows = { catalog: string[]; custom: string[] };

function toRow(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Same exclusions as `countFinalOnboardingInterests`. */
export function splitInterests(rows: readonly unknown[]): SplitRows {
  const catalog = new Set<string>();
  const custom = new Map<string, string>();
  for (const item of rows) {
    const row = toRow(item);
    const id = textOf(row?.id);
    if (!row || !id) continue;
    if (row.isCustom === true || id.startsWith('custom_')) {
      const name = textOf(row.name);
      if (name) custom.set(id, name);
      continue;
    }
    if (id.endsWith('_other') || id.includes('_group_')) continue;
    catalog.add(id);
  }
  return { catalog: [...catalog], custom: [...custom.values()] };
}

export function splitAffiliations(rows: readonly unknown[]): SplitRows {
  const catalog = new Set<string>();
  const custom = new Map<string, string>();
  for (const item of rows) {
    const row = toRow(item);
    const id = textOf(row?.id);
    if (!row || !id) continue;
    if (row.source === 'custom' || id.startsWith('custom_')) {
      const name = textOf(row.name);
      if (name) custom.set(id, name);
      continue;
    }
    catalog.add(textOf(row.providerId) || id);
  }
  return { catalog: [...catalog], custom: [...custom.values()] };
}

function capped(values: string[]): string[] {
  return values.slice(0, MAX_ANALYTICS_LIST_ITEMS);
}

export function listProperties(
  prefix: 'interests' | 'affiliations',
  split: SplitRows,
): AnalyticsProperties {
  const texts = split.custom.map((value) =>
    value.slice(0, MAX_ANALYTICS_TEXT_LENGTH),
  );
  return {
    [prefix]: capped(split.catalog),
    [`${prefix}_custom`]: capped(texts),
    [`${prefix}_custom_normalized`]: capped([
      ...new Set(texts.map(normalizeCustomText)),
    ]),
    [`${prefix}_count`]: split.catalog.length + split.custom.length,
    [`${prefix}_catalog_count`]: split.catalog.length,
    [`${prefix}_custom_count`]: split.custom.length,
  };
}

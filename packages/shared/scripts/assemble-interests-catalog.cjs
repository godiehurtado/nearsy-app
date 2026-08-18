const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../src/interests');
const categories = fs.readFileSync(
  path.join(root, '_generatedCategories.ts.txt'),
  'utf8',
);

const header = `/**
 * CRJ onboarding interests catalog (isolated from in-app InterestsScreen).
 *
 * ID scheme (stable, deterministic):
 *   {categoryId}_{slug}                    e.g. business_entrepreneurship
 *   music_{groupPrefix}_{slug}             e.g. music_genre_pop
 *   food_{groupPrefix}_{slug}              e.g. food_dietary_vegan
 *   sports_* / outdoors_* (merged category sports_outdoors)
 *   custom_{categoryId}_{slug}_{ts}        e.g. custom_sports_outdoors_pickle_171000
 *
 * INTERNAL INTERESTS MIGRATION — pending
 * The authenticated InterestsScreen still uses the legacy InterestLabel catalog.
 */

export const MIN_ONBOARDING_INTERESTS = 10;
export const CUSTOM_INTEREST_MAX_LENGTH = 40;

/** Coherent mid-saturation palette — readable on light and dark backgrounds. */
export const CRJ_ICON_COLOR_PALETTE = [
  '#2563EB', // blue
  '#0891B2', // cyan
  '#0D9488', // teal
  '#059669', // emerald
  '#16A34A', // green
  '#CA8A04', // gold
  '#EA580C', // orange
  '#DC2626', // red
  '#7C3AED', // violet
  '#C026D3', // fuchsia
  '#DB2777', // pink
  '#4F46E5', // indigo
] as const;

const OTHER_ICON = 'add-circle-outline';
const OTHER_COLOR = '#64748B'; // slate — neutral for Other chips

export type OnboardingInterestCategoryId =
  | 'business'
  | 'technology'
  | 'arts'
  | 'music'
  | 'food'
  | 'fitness'
  | 'sports_outdoors'
  | 'travel'
  | 'learning'
  | 'social'
  | 'community';

export type OnboardingInterestItem = {
  id: string;
  /** i18n key suffix under onboarding.profileCompletion.interests.items.* */
  nameKey: string;
  /** English fallback / persistence display name */
  name: string;
  /** Ionicons name */
  icon: string;
  /** Hex color */
  iconColor: string;
  isOther?: boolean;
};

export type OnboardingInterestGroup = {
  id: string;
  nameKey: string;
  name: string;
  icon: string;
  iconColor: string;
  items: OnboardingInterestItem[];
};

export type OnboardingInterestCategory = {
  id: OnboardingInterestCategoryId;
  nameKey: string;
  name: string;
  /** Flat chips (standard categories). */
  items?: OnboardingInterestItem[];
  /** Hierarchical pills (Music, Food, Sports/Outdoors). */
  groups?: OnboardingInterestGroup[];
};

function item(
  id: string,
  name: string,
  icon: string,
  iconColor: string,
  opts?: { isOther?: boolean },
): OnboardingInterestItem {
  return {
    id,
    name,
    nameKey: id,
    icon,
    iconColor,
    isOther: opts?.isOther,
  };
}

function group(
  id: string,
  name: string,
  icon: string,
  iconColor: string,
  items: OnboardingInterestItem[],
): OnboardingInterestGroup {
  return { id, name, nameKey: id, icon, iconColor, items };
}

export const ONBOARDING_INTEREST_CATEGORIES: OnboardingInterestCategory[] = [
${categories}
];

/** Controlled Ionicons catalog for custom interests (no free-text icons). */
export const ONBOARDING_CUSTOM_INTEREST_ICONS = [
  'star-outline',
  'heart-outline',
  'flame-outline',
  'leaf-outline',
  'musical-notes-outline',
  'camera-outline',
  'bicycle-outline',
  'airplane-outline',
  'book-outline',
  'briefcase-outline',
  'cafe-outline',
  'game-controller-outline',
  'globe-outline',
  'home-outline',
  'people-outline',
  'rocket-outline',
  'football-outline',
  'color-palette-outline',
  'hardware-chip-outline',
  'restaurant-outline',
] as const;

export type OnboardingCustomIconName =
  (typeof ONBOARDING_CUSTOM_INTEREST_ICONS)[number];

export type OnboardingSelectedInterest = {
  id: string;
  name: string;
  categoryId: OnboardingInterestCategoryId;
  icon: string;
  iconColor: string;
  isCustom?: boolean;
  /** Hierarchical group id when selected from a grouped category. */
  groupId?: string;
};

export function deterministicIconColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return CRJ_ICON_COLOR_PALETTE[hash % CRJ_ICON_COLOR_PALETTE.length]!;
}

/**
 * Strip undefined/null optionals so Firestore never receives undefined keys.
 * Required: id, name, categoryId, icon, iconColor.
 * Optional only when defined: isCustom (true only), groupId (non-empty string).
 */
export function sanitizeOnboardingInterestForPersistence(
  item: OnboardingSelectedInterest,
): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {
    id: item.id,
    name: item.name,
    categoryId: item.categoryId,
    icon: item.icon || 'star-outline',
    iconColor:
      item.iconColor || deterministicIconColor(item.id || item.name || 'interest'),
  };
  if (item.isCustom === true) {
    out.isCustom = true;
  }
  if (typeof item.groupId === 'string' && item.groupId.length > 0) {
    out.groupId = item.groupId;
  }
  return out;
}

export function assertNoUndefinedDeep(value: unknown, path = '$'): void {
  if (value === undefined) {
    throw new Error(\`Undefined value at \${path}\`);
  }
  if (value === null || typeof value !== 'object') {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      assertNoUndefinedDeep(entry, \`\${path}[\${index}]\`);
    });
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    assertNoUndefinedDeep(child, \`\${path}.\${key}\`);
  }
}

export function payloadContainsUndefined(value: unknown): boolean {
  if (value === undefined) return true;
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) {
    return value.some((entry) => payloadContainsUndefined(entry));
  }
  return Object.values(value as Record<string, unknown>).some((child) =>
    payloadContainsUndefined(child),
  );
}

/** Throws if any catalog item or group is missing icon / iconColor. */
export function assertCatalogIconCoverage(): void {
  for (const cat of ONBOARDING_INTEREST_CATEGORIES) {
    if (cat.items) {
      for (const it of cat.items) {
        if (!it.icon?.trim() || !it.iconColor?.trim()) {
          throw new Error(
            \`Catalog item missing icon/iconColor: \${it.id} (\${cat.id})\`,
          );
        }
      }
    }
    if (cat.groups) {
      for (const g of cat.groups) {
        if (!g.icon?.trim() || !g.iconColor?.trim()) {
          throw new Error(
            \`Interest group missing icon/iconColor: \${g.id}\`,
          );
        }
        for (const it of g.items) {
          if (!it.icon?.trim() || !it.iconColor?.trim()) {
            throw new Error(
              \`Catalog item missing icon/iconColor: \${it.id} (group \${g.id})\`,
            );
          }
        }
      }
    }
  }
}

export function getOnboardingCategory(
  id: OnboardingInterestCategoryId,
): OnboardingInterestCategory {
  const found = ONBOARDING_INTEREST_CATEGORIES.find((c) => c.id === id);
  if (!found) {
    throw new Error(\`Unknown onboarding interest category: \${id}\`);
  }
  return found;
}

export function listOnboardingCategoryIds(): OnboardingInterestCategoryId[] {
  return ONBOARDING_INTEREST_CATEGORIES.map((c) => c.id);
}

export function slugifyInterestName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
}

export function buildCustomInterestId(
  categoryId: OnboardingInterestCategoryId,
  name: string,
  groupId?: string,
  nowMs: number = Date.now(),
): string {
  const slug = slugifyInterestName(name) || 'interest';
  const groupPart =
    typeof groupId === 'string' && groupId.length > 0
      ? \`_\${slugifyInterestName(groupId)}\`
      : '';
  return \`custom_\${categoryId}\${groupPart}_\${slug}_\${nowMs}\`;
}

export function normalizeCustomInterestName(name: string): string {
  return name.trim().replace(/\\s+/g, ' ');
}

export function validateCustomInterestInput(input: {
  name: string;
  icon?: string | null;
  iconColor?: string | null;
  categoryId: OnboardingInterestCategoryId;
  groupId?: string | null;
  existingInCategory: OnboardingSelectedInterest[];
}):
  | { ok: true; name: string; icon: string; iconColor: string }
  | { ok: false; reason: string } {
  const name = normalizeCustomInterestName(input.name);
  if (!name) {
    return { ok: false, reason: 'nameRequired' };
  }
  if (name.length > CUSTOM_INTEREST_MAX_LENGTH) {
    return { ok: false, reason: 'nameTooLong' };
  }
  if (!input.icon || !ONBOARDING_CUSTOM_INTEREST_ICONS.includes(input.icon as any)) {
    return { ok: false, reason: 'iconRequired' };
  }
  const scope = input.existingInCategory.filter((s) => {
    if (input.groupId) {
      return s.groupId === input.groupId;
    }
    return !s.groupId;
  });
  const duplicate = scope.some(
    (s) => s.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (duplicate) {
    return { ok: false, reason: 'duplicate' };
  }
  const iconColor =
    typeof input.iconColor === 'string' && input.iconColor.trim()
      ? input.iconColor.trim()
      : deterministicIconColor(name);
  return { ok: true, name, icon: input.icon, iconColor };
}

export function countSelectedInterests(
  selected: OnboardingSelectedInterest[],
): number {
  return countFinalOnboardingInterests(selected);
}

/**
 * Final selectable interests only (unique by id).
 * Level-1 group pills are navigation-only and never enter \`selected\`.
 * The Other chip is not an interest until a custom entry is added.
 */
export function countFinalOnboardingInterests(
  selected: OnboardingSelectedInterest[],
): number {
  const ids = new Set<string>();
  for (const s of selected) {
    if (!s?.id) continue;
    if (s.id.endsWith('_other') && !s.isCustom) continue;
    if (s.id.includes('_group_') && !s.isCustom) continue;
    ids.add(s.id);
  }
  return ids.size;
}

export function meetsMinimumOnboardingInterests(
  selected: OnboardingSelectedInterest[],
): boolean {
  return countFinalOnboardingInterests(selected) >= MIN_ONBOARDING_INTERESTS;
}

export function interestsRemainingToMinimum(
  selected: OnboardingSelectedInterest[],
): number {
  return Math.max(
    0,
    MIN_ONBOARDING_INTERESTS - countFinalOnboardingInterests(selected),
  );
}

/**
 * Flat catalog items for lookup (excludes Other placeholders).
 * Each item includes icon + iconColor.
 */
export function flattenCatalogInterestItems(): OnboardingInterestItem[] {
  const out: OnboardingInterestItem[] = [];
  for (const cat of ONBOARDING_INTEREST_CATEGORIES) {
    if (cat.items) {
      for (const it of cat.items) {
        if (!it.isOther) out.push(it);
      }
    }
    if (cat.groups) {
      for (const g of cat.groups) {
        for (const it of g.items) {
          if (!it.isOther) out.push(it);
        }
      }
    }
  }
  return out;
}

/**
 * Bridge for MVP matching readers (Alerts / Nearby affinity):
 * case-insensitive string labels in personalInterests / professionalInterests.
 *
 * Detailed CRJ context (categoryId, groupId, icon, iconColor, isCustom) is stored separately
 * in personalOnboardingInterests / professionalOnboardingInterests.
 *
 * Does NOT write personalInterestAffiliations / professionalInterestAffiliations —
 * those remain legacy InterestLabel maps for the in-app InterestsScreen / ProfileDetail.
 * INTERNAL INTERESTS MIGRATION — pending
 * CUSTOM INTEREST MATCHING — pending (customs persist + string-match only)
 */
export function selectedInterestsToLabelList(
  selected: OnboardingSelectedInterest[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of selected) {
    if (s.id.endsWith('_other') && !s.isCustom) continue;
    if (s.id.includes('_group_') && !s.isCustom) continue;
    const name = (s.name || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

export type CrjInterestPersistencePatch = {
  personalInterests?: string[];
  professionalInterests?: string[];
  personalOnboardingInterests?: Record<string, string | boolean>[];
  professionalOnboardingInterests?: Record<string, string | boolean>[];
  profileSetupCompleted: false;
};

/**
 * Minimal CRJ write for matching compatibility.
 * Writes labels for active mode only; never contaminates the opposite mode;
 * never invents legacy InterestAffiliations.
 * Detailed rows are sanitized so Firestore never receives undefined keys.
 */
export function buildCrjInterestPersistencePatch(
  mode: 'personal' | 'professional',
  selected: OnboardingSelectedInterest[],
): CrjInterestPersistencePatch {
  const labels = selectedInterestsToLabelList(selected);
  const detailed = selected
    .filter(
      (s) =>
        !(s.id.endsWith('_other') && !s.isCustom) &&
        !(s.id.includes('_group_') && !s.isCustom),
    )
    .map(sanitizeOnboardingInterestForPersistence);

  if (mode === 'personal') {
    return {
      profileSetupCompleted: false,
      personalInterests: labels,
      personalOnboardingInterests: detailed,
    };
  }
  return {
    profileSetupCompleted: false,
    professionalInterests: labels,
    professionalOnboardingInterests: detailed,
  };
}

/** True when a selection retained hierarchical group context. */
export function isHierarchicalInterestSelection(
  item: OnboardingSelectedInterest,
): boolean {
  return !!item.groupId && !!item.id;
}

/** @deprecated Use isHierarchicalInterestSelection */
export function isMusicHierarchySelection(
  item: OnboardingSelectedInterest,
): boolean {
  return item.categoryId === 'music' && isHierarchicalInterestSelection(item);
}

assertCatalogIconCoverage();
`;

fs.writeFileSync(
  path.join(root, 'onboardingInterestCatalog.ts'),
  header,
  'utf8',
);
console.log('Wrote onboardingInterestCatalog.ts');

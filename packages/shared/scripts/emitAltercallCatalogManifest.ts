/**
 * One-off emitter for docs/android-209-altercall-catalog-manifest.md
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { onboardingTranslations } from '../src/i18n/resources/onboarding.ts';
import {
  CUSTOM_INTEREST_ICON_CATALOG,
  HISTORICAL_ANDROID_CUSTOM_ICONS,
  ONBOARDING_CUSTOM_INTEREST_ICONS,
  ONBOARDING_INTEREST_CATEGORIES,
} from '../src/interests/onboardingInterestCatalog.ts';
import { DEPRECATED_INTEREST_DISPLAY_ITEMS } from '../src/interests/onboardingInterestLegacyCatalog.ts';

const NEW_IDS = new Set([
  'sports_mma',
  'sports_polo',
  'sports_martial_arts',
  'sports_padel',
  'sports_rugby',
  'sports_cricket',
  'sports_field_hockey',
  'sports_table_tennis',
  'sports_badminton',
  'sports_fencing',
  'sports_archery',
  'sports_car_racing',
  'sports_ice_hockey',
  'travel_world_cultures',
]);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const outPath = join(ROOT, 'docs', 'android-209-altercall-catalog-manifest.md');

function statusFor(id: string): 'existing' | 'new' | 'legacy' {
  if (NEW_IDS.has(id)) return 'new';
  return 'existing';
}

const lines: string[] = [
  '# Android 2.0.9 Altercall catalog manifesto',
  '',
  'Accessible copy for Control Center contrast with iOS #109.',
  'Baseline labels are `origin/develop-android` `2f4a8b78`.',
  '',
  '## Official interests',
  '',
  '| id | previous EN | EN | ES | category | icon | status |',
  '|---|---|---|---|---|---|---|',
];

for (const cat of ONBOARDING_INTEREST_CATEGORIES) {
  const rows = [
    ...(cat.items ?? []),
    ...(cat.groups ?? []).flatMap((group) => group.items),
  ].filter((item) => !item.isOther);
  for (const item of rows) {
    const en =
      onboardingTranslations.en.profileCompletion.interests.items[
        item.id as keyof typeof onboardingTranslations.en.profileCompletion.interests.items
      ] ?? item.name;
    const es =
      onboardingTranslations.es.profileCompletion.interests.items[
        item.id as keyof typeof onboardingTranslations.es.profileCompletion.interests.items
      ] ?? item.name;
    const status = statusFor(item.id);
    const previous = status === 'new' ? '—' : en;
    lines.push(
      `| ${item.id} | ${previous} | ${en} | ${es} | ${cat.id} | ${item.icon} | ${status} |`,
    );
  }
}

lines.push(
  '',
  '## Legacy display-only (visible and removable; not offered as new options)',
  '',
  '| id | previous EN | EN | ES | category | icon | status |',
  '|---|---|---|---|---|---|---|',
);

for (const item of DEPRECATED_INTEREST_DISPLAY_ITEMS) {
  const en =
    onboardingTranslations.en.profileCompletion.interests.items[
      item.id as keyof typeof onboardingTranslations.en.profileCompletion.interests.items
    ] ?? item.name;
  const es =
    onboardingTranslations.es.profileCompletion.interests.items[
      item.id as keyof typeof onboardingTranslations.es.profileCompletion.interests.items
    ] ?? item.name;
  lines.push(
    `| ${item.id} | ${en} | ${en} | ${es} | ${item.categoryId} | ${item.icon} | legacy |`,
  );
}

lines.push(
  '',
  '## Sports / travel coverage notes',
  '',
  '- `sports_boxing` and `sports_pickleball` are **existing**.',
  '- `sports_motorsports` remains **Motorsports / Deportes de motor** (generic). Not relabeled Car Racing.',
  '- `sports_hockey` remains **Hockey**. Not relabeled Ice Hockey.',
  '- New coverage IDs: `sports_car_racing` (Car Racing / Automovilismo), `sports_ice_hockey` (Ice Hockey / Hockey sobre hielo).',
  '- `travel_local` already meant Local Exploration / Exploración local — reused, not renamed.',
  '- `travel_world_cultures` is new. `travel_cultural` and `travel_latin_culture` stay legacy.',
  '- New official IDs are client-catalog only until Functions embeddings/validation admit them.',
  '',
  '## Other icons (common 113 Ionicons)',
  '',
  `Picker count: **${ONBOARDING_CUSTOM_INTEREST_ICONS.length}** unique names.`,
  'Compared read-only with iOS #109 `customInterestIconCatalog.ts` unique names (bicycle listed twice there, then deduped).',
  'All 113 exist in the Android Ionicons glyphmap from `@expo/vector-icons`.',
  '',
  '| # | icon | category | search EN | search ES | historical 20 |',
  '|---|---|---|---|---|---|',
);

CUSTOM_INTEREST_ICON_CATALOG.forEach((entry, index) => {
  lines.push(
    `| ${index + 1} | ${entry.icon} | ${entry.category} | ${entry.searchEn} | ${entry.searchEs} | ${index < 20 ? 'yes' : 'no'} |`,
  );
});

lines.push(
  '',
  '## Historical Android extras (not in the common 113 picker)',
  '',
  'These names were in the unreleased 88-icon Android draft. Saved customs still render; new adds must pick from the 113.',
  '',
  HISTORICAL_ANDROID_CUSTOM_ICONS.map((icon) => `- \`${icon}\``).join('\n'),
  '',
);

writeFileSync(outPath, `${lines.join('\n')}\n`);
console.log(`Wrote ${outPath}`);

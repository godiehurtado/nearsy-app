/**
 * One-off generator: Claude INTEREST_CATEGORIES → onboardingInterestCatalog.ts body.
 * Run: node packages/shared/scripts/gen-interests-v2-catalog.cjs
 */
const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(
  path.join(
    process.env.USERPROFILE,
    'OneDrive/Freelance/ANA_PEREZ/NEARCY/Standardization_Nearsy/04_AI_Development/design-prototypes/crj-final-handoff/01_sources/Nearsy - Completo/Nearsy App - Dark.dc.html',
  ),
  'utf8',
);
const start = HTML.indexOf('const INTEREST_CATEGORIES = [');
const end = HTML.indexOf('];', start) + 2;
const INTEREST_CATEGORIES = eval(
  HTML.slice(start, end).replace('const INTEREST_CATEGORIES =', ''),
);

const EXISTING = fs.readFileSync(
  path.join(__dirname, '../src/interests/onboardingInterestCatalog.ts'),
  'utf8',
);

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

function catGroups(cat) {
  if (!cat?.heads) return null;
  const out = [];
  let cur = null;
  for (const it of cat.items) {
    if (cat.heads[it]) {
      cur = { name: cat.heads[it], items: [] };
      out.push(cur);
    }
    if (cur) cur.items.push(it);
  }
  return out.length ? out : null;
}

/** Parse existing item() lines for name → {icon, iconColor, id} */
const iconByName = new Map();
const idByName = new Map();
for (const m of EXISTING.matchAll(
  /item\('([^']+)', '([^']+)', '([^']+)', '([^']+)'/g,
)) {
  idByName.set(m[2], m[1]);
  iconByName.set(m[2], { icon: m[3], color: m[4], id: m[1] });
}

const PALETTE = [
  '#2563EB', '#0891B2', '#0D9488', '#059669', '#16A34A', '#CA8A04',
  '#EA580C', '#DC2626', '#7C3AED', '#C026D3', '#DB2777', '#4F46E5',
];
function detColor(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

const CAT_META = {
  'Business & Career': { id: 'business', nameKey: 'business' },
  'Technology & Innovation': { id: 'technology', nameKey: 'technology' },
  'Arts & Creativity': { id: 'arts', nameKey: 'arts' },
  'Music & Entertainment': { id: 'music', nameKey: 'music' },
  'Food, Dining & Dietary Lifestyle': { id: 'food', nameKey: 'food_dining' },
  'Fitness & Wellness': { id: 'fitness', nameKey: 'fitness' },
  'Sports, Outdoors & Adventure': { id: 'sports_outdoors', nameKey: 'sports_outdoors' },
  'Travel & Culture': { id: 'travel', nameKey: 'travel' },
  'Learning & Growth': { id: 'learning', nameKey: 'learning' },
  'Social Life & Activities': { id: 'social', nameKey: 'social' },
  'Community, Family & Lifestyle': { id: 'community', nameKey: 'community' },
};

const GROUP_IDS = {
  'Business & Career': {},
  'Music Genres': 'music_group_genres',
  Dance: 'music_group_dance',
  'Live Entertainment': 'music_group_live',
  'Performing Arts': 'music_group_performing',
  'Movies & Television': 'music_group_movies_tv',
  Anime: 'music_group_anime',
  'Dietary Lifestyle': 'food_group_dietary',
  'Favorite Cuisines': 'food_group_cuisines',
  'Food Experiences': 'food_group_experiences',
  Beverages: 'food_group_beverages',
  Sports: 'sports_outdoors_group_sports',
  'Outdoors & Adventure': 'sports_outdoors_group_outdoors',
};

const GROUP_ICON = {
  'Music Genres': ['musical-notes-outline', '#7C3AED'],
  Dance: ['footsteps-outline', '#DB2777'],
  'Live Entertainment': ['mic-outline', '#EA580C'],
  'Performing Arts': ['ticket-outline', '#4F46E5'],
  'Movies & Television': ['film-outline', '#0891B2'],
  Anime: ['planet-outline', '#C026D3'],
  'Dietary Lifestyle': ['nutrition-outline', '#16A34A'],
  'Favorite Cuisines': ['restaurant-outline', '#EA580C'],
  'Food Experiences': ['cafe-outline', '#CA8A04'],
  Beverages: ['wine-outline', '#7C3AED'],
  Sports: ['basketball-outline', '#DC2626'],
  'Outdoors & Adventure': ['compass-outline', '#059669'],
};

const DEFAULT_ICON = {
  'Trying New Restaurants': ['storefront-outline', '#DC2626'],
  'Street Food': ['fast-food-outline', '#EA580C'],
  'Farmers Markets': ['basket-outline', '#16A34A'],
  'Food Festivals': ['balloon-outline', '#C026D3'],
  'Costa Rican': ['flag-outline', '#0891B2'],
  Colombian: ['flag-outline', '#CA8A04'],
  'Plant-Based': ['leaf-outline', '#059669'],
  Flexitarian: ['nutrition-outline', '#0D9488'],
  Pescatarian: ['fish-outline', '#0891B2'],
  Keto: ['fitness-outline', '#7C3AED'],
  Halal: ['moon-outline', '#4F46E5'],
  Kosher: ['star-outline', '#CA8A04'],
  'Gluten-Free': ['remove-circle-outline', '#EA580C'],
  'Dairy-Free': ['water-outline', '#2563EB'],
  Mexican: ['flame-outline', '#DC2626'],
  Caribbean: ['sunny-outline', '#CA8A04'],
  Mediterranean: ['boat-outline', '#0891B2'],
  Indian: ['sparkles-outline', '#C026D3'],
  Japanese: ['flower-outline', '#DB2777'],
  Chinese: ['restaurant-outline', '#DC2626'],
  Thai: ['leaf-outline', '#16A34A'],
  American: ['flag-outline', '#2563EB'],
  'Middle Eastern': ['globe-outline', '#EA580C'],
  African: ['earth-outline', '#059669'],
  Brazilian: ['football-outline', '#16A34A'],
  Tea: ['cafe-outline', '#059669'],
  Smoothies: ['nutrition-outline', '#16A34A'],
  Mocktails: ['wine-outline', '#C026D3'],
  Cocktails: ['wine-outline', '#7C3AED'],
  'Craft Beer': ['beer-outline', '#CA8A04'],
  Dancing: ['body-outline', '#DB2777'],
  'Anime Series': ['tv-outline', '#C026D3'],
  'Anime Movies': ['film-outline', '#DB2777'],
  Manga: ['book-outline', '#7C3AED'],
  'Manhwa / Webtoon': ['phone-portrait-outline', '#0891B2'],
  'Anime Video Games': ['game-controller-outline', '#4F46E5'],
};

const MUSIC_GROUP_PREFIX = {
  music_genres: 'genre',
  dance: 'dance',
  live_entertainment: 'live',
  performing_arts: 'performing',
  movies_and_television: 'movies',
  anime: 'anime',
};

function idAllowedForCategory(id, categoryId) {
  if (!id) return false;
  if (id.startsWith(`${categoryId}_`)) return true;
  if (categoryId === 'sports_outdoors') {
    return id.startsWith('sports_') || id.startsWith('outdoors_');
  }
  if (categoryId === 'music') {
    return id.startsWith('music_');
  }
  if (categoryId === 'food') {
    return id.startsWith('food_');
  }
  return false;
}

function resolveItem(categoryId, groupSlug, name) {
  const prev = iconByName.get(name);
  let id =
    prev?.id && idAllowedForCategory(prev.id, categoryId) ? prev.id : null;
  if (!id) {
    if (categoryId === 'food' && groupSlug) {
      const short = {
        dietary_lifestyle: 'dietary',
        favorite_cuisines: 'cuisine',
        food_experiences: 'experience',
        beverages: 'beverage',
      }[groupSlug];
      id = short
        ? `food_${short}_${slugify(name)}`
        : `food_${groupSlug}_${slugify(name)}`;
    } else if (categoryId === 'music' && groupSlug) {
      const prefix = MUSIC_GROUP_PREFIX[groupSlug] || groupSlug;
      const anime = {
        'Anime Series': 'music_anime_series',
        'Anime Movies': 'music_anime_movies',
        Manga: 'music_anime_manga',
        'Manhwa / Webtoon': 'music_anime_manhwa',
        'Anime Video Games': 'music_anime_games',
      };
      if (groupSlug === 'anime' && anime[name]) {
        id = anime[name];
      } else if (groupSlug === 'dance' && name === 'Dancing') {
        id = 'music_dance_dancing';
      } else {
        id = `music_${prefix}_${slugify(name)}`;
      }
    } else if (categoryId === 'sports_outdoors' && groupSlug) {
      const prefix = groupSlug === 'sports' ? 'sports' : 'outdoors';
      id = `${prefix}_${slugify(name)}`;
    } else {
      id = `${categoryId}_${slugify(name)}`;
    }
  }
  const def = DEFAULT_ICON[name];
  const icon = prev?.icon || def?.[0] || 'star-outline';
  const color = prev?.color || def?.[1] || detColor(id);
  return { id, icon, color };
}

function emitItem(categoryId, groupSlug, name, indent) {
  const { id, icon, color } = resolveItem(categoryId, groupSlug, name);
  return `${indent}item('${id}', '${name.replace(/'/g, "\\'")}', '${icon}', '${color}'),\n`;
}

const lines = [];
for (const cat of INTEREST_CATEGORIES) {
  const meta = CAT_META[cat.name];
  if (!meta) throw new Error('Missing meta for ' + cat.name);
  lines.push(`  {\n    id: '${meta.id}',\n    name: '${cat.name.replace(/'/g, "\\'")}',\n    nameKey: '${meta.nameKey}',\n`);
  const gs = catGroups(cat);
  if (!gs) {
    lines.push('    items: [\n');
    for (const name of cat.items) {
      lines.push(emitItem(meta.id, null, name, '      '));
    }
    lines.push(`      item('${meta.id}_other', 'Other', OTHER_ICON, OTHER_COLOR, { isOther: true }),\n    ],\n  },\n`);
    continue;
  }
  lines.push('    groups: [\n');
  for (const g of gs) {
    const gSlug = slugify(g.name);
    const gId = GROUP_IDS[g.name] || `${meta.id}_group_${gSlug}`;
    const [gIcon, gColor] = GROUP_ICON[g.name] || ['layers-outline', detColor(gId)];
    lines.push(
      `      group('${gId}', '${g.name.replace(/'/g, "\\'")}', '${gIcon}', '${gColor}', [\n`,
    );
    for (const name of g.items) {
      lines.push(emitItem(meta.id, gSlug, name, '        '));
    }
    lines.push(
      `        item('${gId}_other', 'Other', OTHER_ICON, OTHER_COLOR, { isOther: true }),\n      ]),\n`,
    );
  }
  lines.push('    ],\n  },\n');
}

const outPath = path.join(__dirname, '../src/interests/_generatedCategories.ts.txt');
fs.writeFileSync(outPath, lines.join(''), 'utf8');
console.log('Wrote', outPath, 'categories', INTEREST_CATEGORIES.length);

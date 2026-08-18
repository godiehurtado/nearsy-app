/**
 * Sync onboarding interest i18n keys from catalog.
 * Run: node packages/shared/scripts/gen-i18n-interests.cjs
 */
const fs = require('fs');
const path = require('path');

const catalogPath = path.join(
  __dirname,
  '../src/interests/onboardingInterestCatalog.ts',
);
const onboardingPath = path.join(__dirname, '../src/i18n/resources/onboarding.ts');
const esPath = path.join(__dirname, '../src/i18n/locales/es.ts');

const catalogSrc = fs.readFileSync(catalogPath, 'utf8');
const itemRe = /item\('([^']+)', '([^']+)'/g;
const groupRe = /group\('([^']+)', '([^']+)'/g;

const items = new Map();
const groups = new Map();
let m;
while ((m = itemRe.exec(catalogSrc))) {
  if (!m[1].endsWith('_other') || m[2] === 'Other') {
    items.set(m[1], m[2]);
  }
}
while ((m = groupRe.exec(catalogSrc))) {
  groups.set(m[1], m[2]);
}

const ES_MAP = {
  Other: 'Otro',
  Vegan: 'Vegano',
  Vegetarian: 'Vegetariano',
  Pescatarian: 'Pescetariano',
  'Plant-Based': 'Basado en plantas',
  Flexitarian: 'Flexitariano',
  Keto: 'Keto',
  Halal: 'Halal',
  Kosher: 'Kosher',
  'Gluten-Free': 'Sin gluten',
  'Dairy-Free': 'Sin lácteos',
  Italian: 'Italiana',
  Mexican: 'Mexicana',
  'Costa Rican': 'Costarricense',
  Colombian: 'Colombiana',
  Caribbean: 'Caribeña',
  Mediterranean: 'Mediterránea',
  Indian: 'India',
  Japanese: 'Japonesa',
  Chinese: 'China',
  Thai: 'Tailandesa',
  Seafood: 'Mariscos',
  American: 'Americana',
  'Middle Eastern': 'Medio Oriente',
  African: 'Africana',
  Brazilian: 'Brasileña',
  'Trying New Restaurants': 'Probar restaurantes nuevos',
  'Fine Dining': 'Alta cocina',
  'Street Food': 'Comida callejera',
  Grilling: 'Parrilla',
  'Farmers Markets': 'Mercados agrícolas',
  'Food Festivals': 'Festivales gastronómicos',
  Tea: 'Té',
  Smoothies: 'Batidos',
  Mocktails: 'Mocktails',
  Cocktails: 'Cócteles',
  'Craft Beer': 'Cerveza artesanal',
  'Anime Series': 'Series de anime',
  'Anime Movies': 'Películas de anime',
  Manga: 'Manga',
  'Manhwa / Webtoon': 'Manhwa / Webtoon',
  'Anime Video Games': 'Videojuegos de anime',
  Dancing: 'Baile',
  'Dietary Lifestyle': 'Estilo de vida dietético',
  'Favorite Cuisines': 'Cocinas favoritas',
  'Food Experiences': 'Experiencias gastronómicas',
  Beverages: 'Bebidas',
  Anime: 'Anime',
  'Sports, Outdoors & Adventure': 'Deportes, aire libre y aventura',
  'Food, Dining & Dietary Lifestyle': 'Comida, gastronomía y estilo de vida dietético',
};

function readExistingItems(filePath, marker) {
  const src = fs.readFileSync(filePath, 'utf8');
  const start = src.indexOf(marker);
  if (start < 0) return new Map();
  const slice = src.slice(start);
  const end = slice.indexOf('\n      },\n');
  const block = end > 0 ? slice.slice(0, end) : slice;
  const out = new Map();
  for (const match of block.matchAll(/(\w[\w_]*):\s*'((?:\\'|[^'])*)'/g)) {
    out.set(match[1], match[2].replace(/\\'/g, "'"));
  }
  return out;
}

const existingEn = readExistingItems(onboardingPath, 'items: {');
const existingEs = readExistingItems(esPath, 'items: {');

function emitItems(map, existing, es = false) {
  const lines = [];
  for (const [id, name] of [...map.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    const val = es
      ? ES_MAP[name] || existing.get(id) || existingEn.get(id) || name
      : existing.get(id) || name;
    lines.push(`        ${id}: '${val.replace(/'/g, "\\'")}',`);
  }
  return lines.join('\n');
}

function emitGroups(map, es = false) {
  const lines = [];
  for (const [id, name] of [...map.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    const val = es ? ES_MAP[name] || name : name;
    lines.push(`        ${id}: '${val.replace(/'/g, "\\'")}',`);
  }
  return lines.join('\n');
}

function patchFile(filePath, isEs) {
  let src = fs.readFileSync(filePath, 'utf8');
  const itemsBlock = emitItems(items, isEs ? existingEs : existingEn, isEs);
  src = src.replace(
    /items: \{[\s\S]*?\n      \},/,
    `items: {\n${itemsBlock}\n      },`,
  );
  if (!src.includes('groups: {')) {
    src = src.replace(
      /categories: \{[\s\S]*?\n      \},/,
      (block) =>
        `${block}\n      groups: {\n${emitGroups(groups, isEs)}\n      },`,
    );
  } else {
    src = src.replace(
      /groups: \{[\s\S]*?\n      \},/,
      `groups: {\n${emitGroups(groups, isEs)}\n      },`,
    );
  }
  fs.writeFileSync(filePath, src, 'utf8');
}

// Patch EN structural strings in onboarding.ts
let onboarding = fs.readFileSync(onboardingPath, 'utf8');
onboarding = onboarding.replace(
  'Choose at least 7. You can update them anytime from your profile.',
  'Choose at least 10. You can update them anytime from your profile.',
);
onboarding = onboarding.replace(
  "minRequired:\n        'Choose at least 7 interests to continue. You have selected {{count}}.',",
  "minRequiredTitle: 'More interests needed',\n      minRequired:\n        'Choose at least 10 interests to help us find better matches. You have selected {{count}} — choose {{remaining}} more.',",
);
onboarding = onboarding.replace(
  /categories: \{[\s\S]*?\n      \},/,
  `categories: {
        business: 'Business & Career',
        technology: 'Technology & Innovation',
        arts: 'Arts & Creativity',
        music: 'Music & Entertainment',
        food_dining: 'Food, Dining & Dietary Lifestyle',
        fitness: 'Fitness & Wellness',
        sports_outdoors: 'Sports, Outdoors & Adventure',
        travel: 'Travel & Culture',
        learning: 'Learning & Growth',
        social: 'Social Life & Activities',
        community: 'Community, Family & Lifestyle',
      },`,
);
if (!onboarding.includes('interestsCelebration:')) {
  onboarding = onboarding.replace(
    '    interests: {',
    `    interestsCelebration: {
      eyebrow: 'ALL DONE WITH INTERESTS',
      title: "You're getting closer to your people",
      body: '{{count}} interests in. That gives Nearsy plenty to start spotting people you would click with nearby.',
      supporting:
        'Your interests help Nearsy understand who you are more likely to connect with.',
      continue: 'Continue',
    },
    interests: {`,
  );
}
fs.writeFileSync(onboardingPath, onboarding, 'utf8');

// Patch ES structural strings
let es = fs.readFileSync(esPath, 'utf8');
es = es.replace(
  /Elige al menos 7[^']*'/,
  "Elige al menos 10. Puedes actualizarlos en cualquier momento desde tu perfil.'",
);
if (!es.includes('minRequiredTitle')) {
  es = es.replace(
    /minRequired:[\s\S]*?',/,
    `minRequiredTitle: 'Se necesitan más intereses',
        minRequired:
          'Elige al menos 10 intereses para ayudarnos a encontrar mejores coincidencias. Has seleccionado {{count}} — elige {{remaining}} más.',`,
  );
}
es = es.replace(
  /categories: \{[\s\S]*?\n        \},/,
  `categories: {
          business: 'Negocios y carrera',
          technology: 'Tecnología e innovación',
          arts: 'Arte y creatividad',
          music: 'Música y entretenimiento',
          food_dining: 'Comida, gastronomía y estilo de vida dietético',
          fitness: 'Fitness y bienestar',
          sports_outdoors: 'Deportes, aire libre y aventura',
          travel: 'Viajes y cultura',
          learning: 'Aprendizaje y crecimiento',
          social: 'Vida social y actividades',
          community: 'Comunidad, familia y estilo de vida',
        },`,
);
if (!es.includes('interestsCelebration:')) {
  es = es.replace(
    '      interests: {',
    `      interestsCelebration: {
        eyebrow: 'INTERESES COMPLETADOS',
        title: 'Te acercas a tu gente',
        body: '{{count}} intereses registrados. Eso le da a Nearsy mucho para empezar a detectar personas afines cerca de ti.',
        supporting:
          'Tus intereses ayudan a Nearsy a entender con quién es más probable que conectes.',
        continue: 'Continuar',
      },
      interests: {`,
  );
}
fs.writeFileSync(esPath, es, 'utf8');

patchFile(onboardingPath, false);
patchFile(esPath, true);
console.log('items', items.size, 'groups', groups.size);

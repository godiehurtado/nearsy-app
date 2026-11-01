/**
 * Curated Ionicons picker for custom (Other) interests.
 * Names are taken from the installed catalog family already used in CRJ —
 * no extra icon libraries and no unverified glyph names.
 */

const ICON_COLOR_PALETTE = [
  '#2563EB',
  '#0891B2',
  '#0D9488',
  '#059669',
  '#16A34A',
  '#CA8A04',
  '#EA580C',
  '#DC2626',
  '#7C3AED',
  '#C026D3',
  '#DB2777',
  '#4F46E5',
] as const;

export type CustomInterestIconCategoryId =
  | 'people'
  | 'activity'
  | 'travel'
  | 'food'
  | 'arts'
  | 'nature'
  | 'work'
  | 'objects';

export type CustomInterestIconOption = {
  icon: string;
  iconColor: string;
  category: CustomInterestIconCategoryId;
  searchEn: string;
  searchEs: string;
};

function colorFor(index: number): string {
  return ICON_COLOR_PALETTE[index % ICON_COLOR_PALETTE.length]!;
}

/**
 * Original 20 picker icons keep their previous colors so saved customs
 * still resolve the same swatch.
 */
const LEGACY_PICKER_COLORS: Record<string, string> = {
  'star-outline': '#CA8A04',
  'heart-outline': '#DB2777',
  'flame-outline': '#EA580C',
  'leaf-outline': '#16A34A',
  'musical-notes-outline': '#7C3AED',
  'camera-outline': '#2563EB',
  'bicycle-outline': '#0891B2',
  'airplane-outline': '#4F46E5',
  'book-outline': '#0D9488',
  'briefcase-outline': '#059669',
  'cafe-outline': '#C026D3',
  'game-controller-outline': '#DC2626',
  'globe-outline': '#2563EB',
  'home-outline': '#EA580C',
  'people-outline': '#0891B2',
  'rocket-outline': '#7C3AED',
  'football-outline': '#16A34A',
  'color-palette-outline': '#DB2777',
  'hardware-chip-outline': '#4F46E5',
  'restaurant-outline': '#EA580C',
};

function option(
  icon: string,
  category: CustomInterestIconCategoryId,
  searchEn: string,
  searchEs: string,
  index: number,
): CustomInterestIconOption {
  return {
    icon,
    iconColor: LEGACY_PICKER_COLORS[icon] ?? colorFor(index),
    category,
    searchEn,
    searchEs,
  };
}

/** Display order: original 20 first, then organized extras. */
export const CUSTOM_INTEREST_ICON_CATALOG: readonly CustomInterestIconOption[] = [
  option('star-outline', 'objects', 'star favorite', 'estrella favorito', 0),
  option('heart-outline', 'people', 'heart love', 'corazón amor', 1),
  option('flame-outline', 'nature', 'flame fire', 'llama fuego', 2),
  option('leaf-outline', 'nature', 'leaf plant nature', 'hoja planta naturaleza', 3),
  option('musical-notes-outline', 'arts', 'music notes', 'música notas', 4),
  option('camera-outline', 'arts', 'camera photo', 'cámara foto', 5),
  option('bicycle-outline', 'activity', 'bicycle bike cycling', 'bicicleta ciclismo', 6),
  option('airplane-outline', 'travel', 'airplane travel flight', 'avión viaje vuelo', 7),
  option('book-outline', 'arts', 'book reading', 'libro lectura', 8),
  option('briefcase-outline', 'work', 'briefcase work career', 'maletín trabajo carrera', 9),
  option('cafe-outline', 'food', 'cafe coffee', 'café', 10),
  option('game-controller-outline', 'objects', 'game controller gaming', 'juego videojuegos', 11),
  option('globe-outline', 'travel', 'globe world', 'globo mundo', 12),
  option('home-outline', 'objects', 'home house', 'casa hogar', 13),
  option('people-outline', 'people', 'people friends', 'personas amigos', 14),
  option('rocket-outline', 'work', 'rocket startup', 'cohete', 15),
  option('football-outline', 'activity', 'football soccer', 'fútbol', 16),
  option('color-palette-outline', 'arts', 'palette art paint', 'paleta arte pintura', 17),
  option('hardware-chip-outline', 'work', 'chip technology', 'chip tecnología', 18),
  option('restaurant-outline', 'food', 'restaurant dining', 'restaurante comida', 19),
  option('happy-outline', 'people', 'happy smile person', 'feliz sonrisa persona', 20),
  option('hand-left-outline', 'people', 'hand hello', 'mano saludo', 21),
  option('chatbubbles-outline', 'people', 'chat conversation', 'chat conversación', 22),
  option('body-outline', 'activity', 'body fitness', 'cuerpo fitness', 23),
  option('walk-outline', 'activity', 'walk walking', 'caminar', 24),
  option('barbell-outline', 'activity', 'barbell gym strength', 'pesas gimnasio', 25),
  option('fitness-outline', 'activity', 'fitness running', 'fitness correr', 26),
  option('basketball-outline', 'activity', 'basketball', 'baloncesto', 27),
  option('baseball-outline', 'activity', 'baseball cricket', 'béisbol críquet', 28),
  option('tennisball-outline', 'activity', 'tennis pickleball padel', 'tenis pádel pickleball', 29),
  option('american-football-outline', 'activity', 'american football rugby', 'fútbol americano rugby', 30),
  option('golf-outline', 'activity', 'golf', 'golf', 31),
  option('speedometer-outline', 'activity', 'speed motorsports racing', 'velocidad automovilismo', 32),
  option('car-outline', 'travel', 'car road trip', 'coche auto viaje', 33),
  option('bus-outline', 'travel', 'bus transit', 'autobús', 34),
  option('boat-outline', 'travel', 'boat cruise', 'barco crucero', 35),
  option('map-outline', 'travel', 'map exploration', 'mapa exploración', 36),
  option('compass-outline', 'travel', 'compass adventure', 'brújula aventura', 37),
  option('earth-outline', 'travel', 'earth world cultures', 'tierra culturas', 38),
  option('trail-sign-outline', 'travel', 'trail hiking', 'sendero hiking', 39),
  option('bed-outline', 'travel', 'bed hotel stay', 'cama hotel', 40),
  option('umbrella-outline', 'travel', 'umbrella beach', 'sombrilla playa', 41),
  option('wine-outline', 'food', 'wine drinks', 'vino bebidas', 42),
  option('beer-outline', 'food', 'beer', 'cerveza', 43),
  option('fast-food-outline', 'food', 'fast food', 'comida rápida', 44),
  option('nutrition-outline', 'food', 'nutrition food', 'nutrición alimentos', 45),
  option('fish-outline', 'food', 'fish seafood', 'pescado mariscos', 46),
  option('basket-outline', 'food', 'basket market', 'cesta mercado', 47),
  option('mic-outline', 'arts', 'mic music karaoke', 'micrófono karaoke', 48),
  option('headset-outline', 'arts', 'headset audio', 'auriculares', 49),
  option('film-outline', 'arts', 'film movies', 'cine películas', 50),
  option('videocam-outline', 'arts', 'video camera filmmaking', 'cámara de video cine', 51),
  option('images-outline', 'arts', 'images photos', 'imágenes fotos', 52),
  option('pencil-outline', 'arts', 'pencil drawing writing', 'lápiz dibujo escritura', 53),
  option('brush-outline', 'arts', 'brush painting', 'pincel pintura', 54),
  option('ticket-outline', 'arts', 'ticket theater', 'entrada teatro', 55),
  option('musical-note-outline', 'arts', 'musical note', 'nota musical', 56),
  option('sunny-outline', 'nature', 'sun sunny beach', 'sol playa', 57),
  option('moon-outline', 'nature', 'moon night', 'luna noche', 58),
  option('snow-outline', 'nature', 'snow winter ski', 'nieve invierno esquí', 59),
  option('water-outline', 'nature', 'water swim', 'agua natación', 60),
  option('flower-outline', 'nature', 'flower garden', 'flor jardín', 61),
  option('paw-outline', 'nature', 'paw pets animals', 'huella mascotas animales', 62),
  option('bonfire-outline', 'nature', 'bonfire camping', 'fogata camping', 63),
  option('school-outline', 'work', 'school education', 'escuela educación', 64),
  option('desktop-outline', 'work', 'desktop computer', 'computadora escritorio', 65),
  option('code-slash-outline', 'work', 'code software', 'código software', 66),
  option('bulb-outline', 'work', 'bulb idea', 'bombilla idea', 67),
  option('ribbon-outline', 'work', 'ribbon award', 'cinta premio', 68),
  option('megaphone-outline', 'work', 'megaphone marketing', 'megáfono marketing', 69),
  option('cash-outline', 'work', 'cash money investing', 'dinero inversión', 70),
  option('trending-up-outline', 'work', 'trending growth', 'tendencia crecimiento', 71),
  option('shield-checkmark-outline', 'work', 'shield security', 'escudo seguridad', 72),
  option('diamond-outline', 'objects', 'diamond luxury', 'diamante lujo', 73),
  option('gift-outline', 'objects', 'gift present', 'regalo', 74),
  option('balloon-outline', 'objects', 'balloon celebration', 'globo fiesta', 75),
  option('trophy-outline', 'objects', 'trophy award polo', 'trofeo premio polo', 76),
  option('flag-outline', 'objects', 'flag', 'bandera', 77),
  option('wallet-outline', 'objects', 'wallet budget', 'cartera presupuesto', 78),
  option('key-outline', 'objects', 'key', 'llave', 79),
  option('construct-outline', 'objects', 'construct tools', 'construcción herramientas', 80),
  option('flask-outline', 'objects', 'flask science', 'matraz ciencia', 81),
  option('sparkles-outline', 'objects', 'sparkles', 'destellos', 82),
  option('calendar-outline', 'objects', 'calendar events', 'calendario eventos', 83),
  option('library-outline', 'objects', 'library history museums', 'biblioteca museos historia', 84),
  option('storefront-outline', 'objects', 'storefront shop', 'tienda', 85),
  option('language-outline', 'objects', 'language cultures', 'idioma culturas', 86),
  option('locate-outline', 'activity', 'locate archery target', 'ubicación tiro con arco', 87),
] as const;

export const CUSTOM_INTEREST_ICON_CATEGORY_ORDER: readonly CustomInterestIconCategoryId[] =
  [
    'people',
    'activity',
    'travel',
    'food',
    'arts',
    'nature',
    'work',
    'objects',
  ];

export const ONBOARDING_CUSTOM_INTEREST_ICONS = CUSTOM_INTEREST_ICON_CATALOG.map(
  (entry) => entry.icon,
) as readonly string[];

export const ONBOARDING_CUSTOM_INTEREST_ICON_OPTIONS =
  CUSTOM_INTEREST_ICON_CATALOG.map(({ icon, iconColor }) => ({
    icon,
    iconColor,
  }));

export function customInterestIconCategoryLabel(
  category: CustomInterestIconCategoryId,
  locale: 'en' | 'es',
): string {
  const labels: Record<CustomInterestIconCategoryId, { en: string; es: string }> =
    {
      people: { en: 'People', es: 'Personas' },
      activity: { en: 'Activity', es: 'Actividad' },
      travel: { en: 'Travel', es: 'Viajes' },
      food: { en: 'Food', es: 'Comida' },
      arts: { en: 'Arts', es: 'Arte' },
      nature: { en: 'Nature', es: 'Naturaleza' },
      work: { en: 'Work', es: 'Trabajo' },
      objects: { en: 'Objects', es: 'Objetos' },
    };
  return labels[category][locale];
}

export function normalizeIconSearchQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function filterCustomInterestIcons(
  query: string,
  locale: 'en' | 'es',
): CustomInterestIconOption[] {
  const q = normalizeIconSearchQuery(query);
  if (!q) return [...CUSTOM_INTEREST_ICON_CATALOG];
  return CUSTOM_INTEREST_ICON_CATALOG.filter((entry) => {
    const hay = `${entry.icon} ${entry.searchEn} ${entry.searchEs}`.toLowerCase();
    return hay.includes(q) || (locale === 'es' ? entry.searchEs : entry.searchEn)
      .toLowerCase()
      .includes(q);
  });
}

export function resolveCustomInterestIconOption(
  icon: string,
): CustomInterestIconOption | undefined {
  return CUSTOM_INTEREST_ICON_CATALOG.find((entry) => entry.icon === icon);
}

export function isOnboardingCustomInterestIcon(icon: string): boolean {
  return ONBOARDING_CUSTOM_INTEREST_ICONS.includes(icon);
}

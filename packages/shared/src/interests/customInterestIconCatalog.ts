/**
 * Curated Ionicons picker for custom (Other) interests.
 * Names are the common 113-glyph selection (same identifiers as iOS #109),
 * independently listed here and checked against the Android Ionicons glyphmap.
 * No extra libraries. Customs stay custom.
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

/**
 * Picker order: historical 20 first, then the rest of the common 113.
 * Identifiers match iOS #109 unique names; grouping/search are Android-owned.
 */
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
  option('basketball-outline', 'activity', 'basketball', 'baloncesto', 20),
  option('baseball-outline', 'activity', 'baseball', 'béisbol', 21),
  option('tennisball-outline', 'activity', 'tennis pickleball padel', 'tenis pádel pickleball', 22),
  option('american-football-outline', 'activity', 'american football rugby', 'fútbol americano rugby', 23),
  option('fitness-outline', 'activity', 'fitness workout', 'fitness entrenamiento', 24),
  option('barbell-outline', 'activity', 'barbell gym weights', 'pesas gimnasio', 25),
  option('walk-outline', 'activity', 'walk walking', 'caminar', 26),
  option('medal-outline', 'activity', 'medal award', 'medalla premio', 27),
  option('trophy-outline', 'activity', 'trophy award', 'trofeo premio', 28),
  option('ribbon-outline', 'work', 'ribbon award', 'cinta premio', 29),
  option('flash-outline', 'activity', 'flash energy fencing', 'rayo energía esgrima', 30),
  option('map-outline', 'travel', 'map exploration', 'mapa exploración', 31),
  option('compass-outline', 'travel', 'compass navigation', 'brújula navegación', 32),
  option('earth-outline', 'travel', 'earth world cultures', 'tierra culturas', 33),
  option('flag-outline', 'objects', 'flag country', 'bandera país', 34),
  option('location-outline', 'travel', 'location pin place', 'ubicación lugar', 35),
  option('navigate-outline', 'travel', 'navigate direction', 'navegar dirección', 36),
  option('boat-outline', 'travel', 'boat cruise', 'barco crucero', 37),
  option('car-outline', 'travel', 'car driving', 'coche automóvil', 38),
  option('bus-outline', 'travel', 'bus transit', 'autobús', 39),
  option('train-outline', 'travel', 'train rail', 'tren', 40),
  option('bed-outline', 'travel', 'bed hotel stay', 'cama hotel', 41),
  option('trail-sign-outline', 'travel', 'trail hiking', 'sendero hiking', 42),
  option('brush-outline', 'arts', 'brush painting', 'pincel pintura', 43),
  option('images-outline', 'arts', 'images photos', 'imágenes fotos', 44),
  option('film-outline', 'arts', 'film movies', 'cine películas', 45),
  option('videocam-outline', 'arts', 'video camera', 'videocámara', 46),
  option('mic-outline', 'arts', 'mic music karaoke', 'micrófono karaoke', 47),
  option('headset-outline', 'arts', 'headset audio', 'auriculares', 48),
  option('radio-outline', 'arts', 'radio broadcast', 'radio', 49),
  option('tv-outline', 'arts', 'tv television', 'televisión', 50),
  option('musical-note-outline', 'arts', 'musical note', 'nota musical', 51),
  option('easel-outline', 'arts', 'easel painting', 'caballete pintura', 52),
  option('pizza-outline', 'food', 'pizza', 'pizza', 53),
  option('wine-outline', 'food', 'wine drinks', 'vino', 54),
  option('nutrition-outline', 'food', 'nutrition food', 'nutrición alimentos', 55),
  option('fast-food-outline', 'food', 'fast food', 'comida rápida', 56),
  option('ice-cream-outline', 'food', 'ice cream dessert', 'helado postre', 57),
  option('beer-outline', 'food', 'beer', 'cerveza', 58),
  option('sunny-outline', 'nature', 'sun sunny beach', 'sol playa', 59),
  option('moon-outline', 'nature', 'moon night', 'luna noche', 60),
  option('snow-outline', 'nature', 'snow winter ice', 'nieve invierno hielo', 61),
  option('rainy-outline', 'nature', 'rain weather', 'lluvia clima', 62),
  option('thunderstorm-outline', 'nature', 'storm thunder', 'tormenta trueno', 63),
  option('water-outline', 'nature', 'water swim', 'agua natación', 64),
  option('fish-outline', 'nature', 'fish seafood', 'pez pesca', 65),
  option('paw-outline', 'nature', 'paw pets animals', 'huella mascotas animales', 66),
  option('flower-outline', 'nature', 'flower garden', 'flor jardín', 67),
  option('bonfire-outline', 'nature', 'bonfire camping', 'fogata camping', 68),
  option('umbrella-outline', 'travel', 'umbrella beach', 'sombrilla playa', 69),
  option('person-outline', 'people', 'person profile', 'persona perfil', 70),
  option('people-circle-outline', 'people', 'people group', 'grupo personas', 71),
  option('happy-outline', 'people', 'happy smile', 'feliz sonrisa', 72),
  option('chatbubbles-outline', 'people', 'chat conversation', 'chat conversación', 73),
  option('hand-left-outline', 'people', 'hand hello', 'mano saludo', 74),
  option('heart-circle-outline', 'people', 'heart circle care', 'corazón cuidado', 75),
  option('school-outline', 'work', 'school education', 'escuela educación', 76),
  option('library-outline', 'work', 'library books', 'biblioteca libros', 77),
  option('newspaper-outline', 'work', 'newspaper news', 'periódico noticias', 78),
  option('language-outline', 'work', 'language translate', 'idioma idiomas', 79),
  option('calculator-outline', 'work', 'calculator math', 'calculadora', 80),
  option('flask-outline', 'work', 'flask science', 'matraz ciencia', 81),
  option('construct-outline', 'work', 'construct tools', 'construcción herramientas', 82),
  option('hammer-outline', 'work', 'hammer build', 'martillo construir', 83),
  option('laptop-outline', 'work', 'laptop computer', 'portátil computadora', 84),
  option('phone-portrait-outline', 'work', 'phone mobile', 'teléfono móvil', 85),
  option('wifi-outline', 'work', 'wifi internet', 'wifi internet', 86),
  option('code-slash-outline', 'work', 'code programming', 'código programación', 87),
  option('terminal-outline', 'work', 'terminal console', 'terminal consola', 88),
  option('bulb-outline', 'work', 'bulb idea', 'bombilla idea', 89),
  option('gift-outline', 'objects', 'gift present', 'regalo', 90),
  option('balloon-outline', 'objects', 'balloon celebration', 'globo fiesta', 91),
  option('diamond-outline', 'objects', 'diamond luxury', 'diamante lujo', 92),
  option('sparkles-outline', 'objects', 'sparkles magic', 'destellos magia', 93),
  option('key-outline', 'objects', 'key', 'llave', 94),
  option('lock-closed-outline', 'objects', 'lock security', 'candado seguridad', 95),
  option('shield-checkmark-outline', 'work', 'shield security', 'escudo seguridad', 96),
  option('time-outline', 'objects', 'time clock', 'tiempo reloj', 97),
  option('alarm-outline', 'objects', 'alarm clock', 'alarma', 98),
  option('calendar-outline', 'objects', 'calendar events', 'calendario fecha', 99),
  option('hourglass-outline', 'objects', 'hourglass wait', 'reloj de arena', 100),
  option('pulse-outline', 'objects', 'pulse health', 'pulso salud', 101),
  option('medkit-outline', 'objects', 'medkit health', 'botiquín salud', 102),
  option('cart-outline', 'objects', 'cart shopping', 'carrito compras', 103),
  option('bag-handle-outline', 'objects', 'bag shopping', 'bolsa compras', 104),
  option('cash-outline', 'work', 'cash money', 'efectivo dinero', 105),
  option('wallet-outline', 'objects', 'wallet budget', 'cartera dinero', 106),
  option('dice-outline', 'objects', 'dice games', 'dados juegos', 107),
  option('extension-puzzle-outline', 'objects', 'puzzle piece', 'puzzle pieza', 108),
  option('cube-outline', 'objects', 'cube 3d', 'cubo', 109),
  option('shirt-outline', 'objects', 'shirt fashion', 'camisa moda', 110),
  option('watch-outline', 'objects', 'watch time', 'reloj pulsera', 111),
  option('glasses-outline', 'objects', 'glasses style', 'gafas', 112),
] as const;

/**
 * Names offered in an unreleased Android picker draft that are not in the
 * common 113. Saved customs still render; new adds must use the 113.
 */
export const HISTORICAL_ANDROID_CUSTOM_ICONS = [
  'body-outline',
  'golf-outline',
  'speedometer-outline',
  'basket-outline',
  'pencil-outline',
  'ticket-outline',
  'desktop-outline',
  'megaphone-outline',
  'trending-up-outline',
  'storefront-outline',
  'locate-outline',
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

export function isHistoricalCustomInterestIcon(icon: string): boolean {
  return (HISTORICAL_ANDROID_CUSTOM_ICONS as readonly string[]).includes(icon);
}

/**
 * Custom-interest icon picker — Ionicons names already shipped via
 * `@expo/vector-icons`. Do not invent names. Customs stay custom.
 */

export type CustomInterestIconGroupId =
  | 'featured'
  | 'sports'
  | 'travel'
  | 'arts'
  | 'food'
  | 'nature'
  | 'people'
  | 'work'
  | 'tech'
  | 'objects';

export type CustomInterestIconEntry = {
  icon: string;
  iconColor: string;
  groupId: CustomInterestIconGroupId;
  searchEn: string;
  searchEs: string;
};

const FEATURED_COLORS: Record<string, string> = {
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

const PALETTE = [
  '#CA8A04',
  '#DB2777',
  '#EA580C',
  '#16A34A',
  '#7C3AED',
  '#2563EB',
  '#0891B2',
  '#4F46E5',
  '#0D9488',
  '#059669',
  '#C026D3',
  '#DC2626',
] as const;

function colorFor(icon: string): string {
  if (FEATURED_COLORS[icon]) return FEATURED_COLORS[icon]!;
  let hash = 0;
  for (let i = 0; i < icon.length; i++) {
    hash = (hash * 31 + icon.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length]!;
}

function entry(
  icon: string,
  groupId: CustomInterestIconGroupId,
  searchEn: string,
  searchEs: string,
): CustomInterestIconEntry {
  return { icon, iconColor: colorFor(icon), groupId, searchEn, searchEs };
}

/**
 * Featured group is the historical 20-name allowlist, in original order.
 * Additional groups expand the picker without renaming stored icon ids.
 */
export const CUSTOM_INTEREST_ICON_ENTRIES: readonly CustomInterestIconEntry[] = [
  entry('star-outline', 'featured', 'star favorite highlight', 'estrella favorito destacado'),
  entry('heart-outline', 'featured', 'heart love', 'corazón amor'),
  entry('flame-outline', 'featured', 'flame fire hot', 'llama fuego'),
  entry('leaf-outline', 'featured', 'leaf nature plant', 'hoja naturaleza planta'),
  entry('musical-notes-outline', 'featured', 'music notes song', 'música notas canción'),
  entry('camera-outline', 'featured', 'camera photo', 'cámara foto'),
  entry('bicycle-outline', 'featured', 'bicycle bike cycling', 'bicicleta ciclismo'),
  entry('airplane-outline', 'featured', 'airplane travel flight', 'avión viaje vuelo'),
  entry('book-outline', 'featured', 'book reading', 'libro lectura'),
  entry('briefcase-outline', 'featured', 'briefcase work business', 'maletín trabajo negocios'),
  entry('cafe-outline', 'featured', 'cafe coffee', 'café'),
  entry('game-controller-outline', 'featured', 'game controller gaming', 'mando videojuegos'),
  entry('globe-outline', 'featured', 'globe world', 'globo mundo'),
  entry('home-outline', 'featured', 'home house', 'casa hogar'),
  entry('people-outline', 'featured', 'people friends community', 'personas amigos comunidad'),
  entry('rocket-outline', 'featured', 'rocket launch', 'cohete'),
  entry('football-outline', 'featured', 'soccer football', 'fútbol'),
  entry('color-palette-outline', 'featured', 'palette art color', 'paleta arte color'),
  entry('hardware-chip-outline', 'featured', 'chip hardware tech', 'chip hardware tecnología'),
  entry('restaurant-outline', 'featured', 'restaurant dining food', 'restaurante comida'),

  entry('basketball-outline', 'sports', 'basketball sport', 'baloncesto deporte'),
  entry('baseball-outline', 'sports', 'baseball sport', 'béisbol deporte'),
  entry('tennisball-outline', 'sports', 'tennis ball sport', 'tenis deporte'),
  entry('american-football-outline', 'sports', 'american football rugby', 'fútbol americano rugby'),
  entry('fitness-outline', 'sports', 'fitness workout', 'fitness entrenamiento'),
  entry('barbell-outline', 'sports', 'barbell gym weights', 'barra gimnasio pesas'),
  entry('walk-outline', 'sports', 'walk walking', 'caminar'),
  entry('bicycle-outline', 'sports', 'bicycle cycling', 'bicicleta ciclismo'),
  entry('medal-outline', 'sports', 'medal award', 'medalla premio'),
  entry('trophy-outline', 'sports', 'trophy win', 'trofeo victoria'),
  entry('ribbon-outline', 'sports', 'ribbon award', 'cinta premio'),
  entry('flash-outline', 'sports', 'flash energy fencing', 'rayo energía esgrima'),

  entry('map-outline', 'travel', 'map explore', 'mapa explorar'),
  entry('compass-outline', 'travel', 'compass navigation', 'brújula navegación'),
  entry('earth-outline', 'travel', 'earth world cultures', 'tierra culturas del mundo'),
  entry('flag-outline', 'travel', 'flag country', 'bandera país'),
  entry('location-outline', 'travel', 'location pin place', 'ubicación lugar'),
  entry('navigate-outline', 'travel', 'navigate direction', 'navegar dirección'),
  entry('boat-outline', 'travel', 'boat cruise', 'barco crucero'),
  entry('car-outline', 'travel', 'car driving', 'coche automóvil'),
  entry('bus-outline', 'travel', 'bus transit', 'autobús'),
  entry('train-outline', 'travel', 'train rail', 'tren'),
  entry('bed-outline', 'travel', 'bed hotel stay', 'cama hotel'),
  entry('trail-sign-outline', 'travel', 'trail hiking sign', 'sendero señal'),

  entry('brush-outline', 'arts', 'brush paint', 'pincel pintura'),
  entry('images-outline', 'arts', 'images gallery photos', 'imágenes galería fotos'),
  entry('film-outline', 'arts', 'film movie cinema', 'cine película'),
  entry('videocam-outline', 'arts', 'video camera film', 'videocámara'),
  entry('mic-outline', 'arts', 'microphone singing', 'micrófono canto'),
  entry('headset-outline', 'arts', 'headset audio', 'auriculares audio'),
  entry('radio-outline', 'arts', 'radio broadcast', 'radio'),
  entry('tv-outline', 'arts', 'tv television', 'televisión'),
  entry('musical-note-outline', 'arts', 'music note', 'nota musical'),
  entry('easel-outline', 'arts', 'easel painting', 'caballete pintura'),

  entry('pizza-outline', 'food', 'pizza', 'pizza'),
  entry('wine-outline', 'food', 'wine drink', 'vino'),
  entry('nutrition-outline', 'food', 'nutrition healthy food', 'nutrición comida sana'),
  entry('fast-food-outline', 'food', 'fast food', 'comida rápida'),
  entry('ice-cream-outline', 'food', 'ice cream dessert', 'helado postre'),
  entry('beer-outline', 'food', 'beer drink', 'cerveza'),

  entry('sunny-outline', 'nature', 'sun sunny weather', 'sol clima'),
  entry('moon-outline', 'nature', 'moon night', 'luna noche'),
  entry('snow-outline', 'nature', 'snow winter ice', 'nieve invierno hielo'),
  entry('rainy-outline', 'nature', 'rain weather', 'lluvia clima'),
  entry('thunderstorm-outline', 'nature', 'storm thunder', 'tormenta trueno'),
  entry('water-outline', 'nature', 'water swim', 'agua nadar'),
  entry('fish-outline', 'nature', 'fish fishing', 'pez pesca'),
  entry('paw-outline', 'nature', 'paw pet animal', 'huella mascota animal'),
  entry('flower-outline', 'nature', 'flower garden', 'flor jardín'),
  entry('bonfire-outline', 'nature', 'bonfire camping', 'hoguera camping'),
  entry('umbrella-outline', 'nature', 'umbrella beach rain', 'paraguas playa'),

  entry('person-outline', 'people', 'person profile', 'persona perfil'),
  entry('people-circle-outline', 'people', 'people group', 'grupo personas'),
  entry('happy-outline', 'people', 'happy smile', 'feliz sonrisa'),
  entry('chatbubbles-outline', 'people', 'chat conversation', 'chat conversación'),
  entry('hand-left-outline', 'people', 'hand volunteer', 'mano voluntariado'),
  entry('heart-circle-outline', 'people', 'heart circle care', 'corazón cuidado'),

  entry('school-outline', 'work', 'school education', 'escuela educación'),
  entry('library-outline', 'work', 'library books', 'biblioteca libros'),
  entry('newspaper-outline', 'work', 'newspaper news', 'periódico noticias'),
  entry('language-outline', 'work', 'language translate', 'idioma idiomas'),
  entry('calculator-outline', 'work', 'calculator math', 'calculadora matemáticas'),
  entry('flask-outline', 'work', 'flask science', 'matraz ciencia'),
  entry('construct-outline', 'work', 'construct tools', 'construcción herramientas'),
  entry('hammer-outline', 'work', 'hammer build', 'martillo construir'),

  entry('laptop-outline', 'tech', 'laptop computer', 'portátil computadora'),
  entry('phone-portrait-outline', 'tech', 'phone mobile', 'teléfono móvil'),
  entry('wifi-outline', 'tech', 'wifi internet', 'wifi internet'),
  entry('code-slash-outline', 'tech', 'code programming', 'código programación'),
  entry('terminal-outline', 'tech', 'terminal console', 'terminal consola'),
  entry('bulb-outline', 'tech', 'bulb idea', 'bombilla idea'),

  entry('gift-outline', 'objects', 'gift present', 'regalo'),
  entry('balloon-outline', 'objects', 'balloon party', 'globo fiesta'),
  entry('diamond-outline', 'objects', 'diamond luxury', 'diamante lujo'),
  entry('sparkles-outline', 'objects', 'sparkles magic', 'destellos magia'),
  entry('key-outline', 'objects', 'key', 'llave'),
  entry('lock-closed-outline', 'objects', 'lock security', 'candado seguridad'),
  entry('shield-checkmark-outline', 'objects', 'shield security', 'escudo seguridad'),
  entry('time-outline', 'objects', 'time clock', 'tiempo reloj'),
  entry('alarm-outline', 'objects', 'alarm clock', 'alarma'),
  entry('calendar-outline', 'objects', 'calendar date', 'calendario fecha'),
  entry('hourglass-outline', 'objects', 'hourglass wait', 'reloj de arena'),
  entry('pulse-outline', 'objects', 'pulse health', 'pulso salud'),
  entry('medkit-outline', 'objects', 'medkit health', 'botiquín salud'),
  entry('cart-outline', 'objects', 'cart shopping', 'carrito compras'),
  entry('bag-handle-outline', 'objects', 'bag shopping', 'bolsa compras'),
  entry('cash-outline', 'objects', 'cash money', 'efectivo dinero'),
  entry('wallet-outline', 'objects', 'wallet money', 'cartera dinero'),
  entry('dice-outline', 'objects', 'dice games', 'dados juegos'),
  entry('extension-puzzle-outline', 'objects', 'puzzle piece', 'puzzle pieza'),
  entry('cube-outline', 'objects', 'cube 3d', 'cubo'),
  entry('shirt-outline', 'objects', 'shirt fashion', 'camisa moda'),
  entry('watch-outline', 'objects', 'watch time', 'reloj pulsera'),
  entry('glasses-outline', 'objects', 'glasses style', 'gafas'),
];

const seen = new Set<string>();
export const ONBOARDING_CUSTOM_INTEREST_ICONS = CUSTOM_INTEREST_ICON_ENTRIES
  .map((row) => row.icon)
  .filter((icon) => {
    if (seen.has(icon)) return false;
    seen.add(icon);
    return true;
  }) as readonly string[];

export const ONBOARDING_CUSTOM_INTEREST_ICON_OPTIONS =
  ONBOARDING_CUSTOM_INTEREST_ICONS.map((icon) => {
    const row = CUSTOM_INTEREST_ICON_ENTRIES.find((entry) => entry.icon === icon)!;
    return { icon, iconColor: row.iconColor };
  });

export const CUSTOM_INTEREST_ICON_GROUP_ORDER: readonly CustomInterestIconGroupId[] =
  [
    'featured',
    'sports',
    'travel',
    'arts',
    'food',
    'nature',
    'people',
    'work',
    'tech',
    'objects',
  ];

export function filterCustomInterestIcons(
  query: string,
): readonly CustomInterestIconEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return CUSTOM_INTEREST_ICON_ENTRIES;
  const unique = new Set<string>();
  const out: CustomInterestIconEntry[] = [];
  for (const row of CUSTOM_INTEREST_ICON_ENTRIES) {
    if (unique.has(row.icon)) continue;
    const haystack = `${row.icon} ${row.searchEn} ${row.searchEs}`.toLowerCase();
    if (haystack.includes(needle)) {
      unique.add(row.icon);
      out.push(row);
    }
  }
  return out;
}

export function customInterestIconA11yLabel(
  icon: string,
  locale: 'en' | 'es',
): string {
  const row = CUSTOM_INTEREST_ICON_ENTRIES.find((entry) => entry.icon === icon);
  if (!row) return icon;
  return locale === 'es' ? row.searchEs.split(' ')[0]! : row.searchEn.split(' ')[0]!;
}

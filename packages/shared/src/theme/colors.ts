// Nearsy design tokens — colors
// Source of truth: approved prototypes "Nearsy App - Clear" / "Nearsy App - Dark" (v1.1 Design Freeze)

export const clearPalette = {
  background: '#FFFFFF',
  backgroundAlt: '#EAF4FD',
  surface: '#FFFFFF',
  panel: '#FAFCFF',
  border: '#E2E7F0',
  borderStrong: '#D8DEEA',
  accentBorder: '#3E68B0',
  textPrimary: '#12203D',
  textSecondary: '#5C6B85',
  textMuted: '#8492AD',
  placeholder: '#9AA7C2',
  primary: '#4E77C7',
  primaryLight: '#7BA6E8',
  primaryGradient: ['#4E77C7', '#7BA6E8'] as readonly [string, string],
  primaryShadow: 'rgba(78,119,199,0.28)',
  chipBg: '#EDF3FF',
  chipText: '#4E77C7',
  divider: '#3E68B0',
  dividerText: '#9AA7C2',
  success: '#2E9E6C',
  successBg: '#EAF3EC',
  danger: '#D64545',
  dangerBg: '#FBEAEA',
  // Welcome / Login hero
  heroBg: '#EAF4FD',
  heroStar: '#8FB0E0',
  heroRing: 'rgba(78,119,199,0.30)',
  heroGlow: 'rgba(78,119,199,0.16)',
  logoStroke: '#3E68B0',
  logoAccent: '#5B8CFF',
  wordmark: '#16294B',
  tagline: '#5E7093',
  floorGlow: 'rgba(255,255,255,0.95)',
  groundRing: 'rgba(78,119,199,0.16)',
  cardBg: '#FFFFFF',
  socialBorder: '#3E68B0',
  socialPressed: '#FAFCFF',
  brandGlyph: '#12203D',
};

export const darkPalette: Palette = {
  background: '#0C1936',
  backgroundAlt: '#1B3565',
  surface: '#132349',
  panel: '#132349',
  border: '#243A6E',
  borderStrong: '#1E3763',
  accentBorder: '#28407A',
  textPrimary: '#EAF1FF',
  textSecondary: '#9DAFD2',
  textMuted: '#7285AC',
  placeholder: '#7285AC',
  primary: '#2E5CC0',
  primaryLight: '#5BAAFF',
  primaryGradient: ['#2E5CC0', '#5BAAFF'] as readonly [string, string],
  primaryShadow: 'rgba(46,92,192,0.42)',
  chipBg: '#1B3163',
  chipText: '#6699FF',
  divider: '#243A6E',
  dividerText: '#7285AC',
  success: '#2E9E6C',
  successBg: '#16311F',
  danger: '#E0605F',
  dangerBg: '#3A1A1A',
  heroBg: '#0A1330',
  heroStar: '#FFFFFF',
  heroRing: 'rgba(143,203,255,0.55)',
  heroGlow: 'rgba(91,170,255,0.28)',
  logoStroke: '#8FCBFF',
  logoAccent: '#DFF1FF',
  wordmark: '#FFFFFF',
  tagline: '#A9BBDD',
  floorGlow: 'rgba(91,170,255,0.22)',
  groundRing: 'rgba(143,203,255,0.16)',
  cardBg: '#0C1936',
  socialBorder: '#28407A',
  socialPressed: '#132349',
  brandGlyph: '#EAF1FF',
};

/**
 * Pearl Dawn — NOT a third Nearsy theme.
 * Scope: the Theme Selection screen, no-selection state only. It must never be
 * registered as a theme, offered in profile settings, or persisted as a preference.
 */
export const pearlDawn = {
  gradient: ['#FFFDF9', '#F7F4FB', '#EDF1F8'] as const,
  bloomWarm: 'rgba(255,214,150,0.40)',
  bloomCool: 'rgba(158,186,236,0.36)',
  veil: 'rgba(255,255,255,0.85)',
  text: '#2A3550',
  muted: '#535D72',
  glyph: '#7C879F',
  orb: '#FFFFFF',
  orbBorder: '#EDEAF4',
  ring: ['rgba(120,140,185,0.18)', 'rgba(120,140,185,0.28)', 'rgba(120,140,185,0.42)'] as const,
  track: 'rgba(255,255,255,0.82)',
  trackBorder: '#E8E4F1',
  shadow: 'rgba(94,108,150,0.18)',
};

export type Palette = typeof clearPalette;
export type ThemeName = 'clear' | 'dark';

export function getPalette(theme: ThemeName): Palette {
  return theme === 'dark' ? darkPalette : clearPalette;
}

/**
 * Auth/login visual tokens for the approved Dark Login design.
 * Scoped to authentication surfaces — not a global theme system.
 */
export const authColors = {
  bg: '#0C1936',
  bgDeep: '#0A1330',
  heroStart: '#1B3565',
  heroEnd: '#0A1330',
  panel: '#132349',
  inputBg: '#152A52',
  inputBorder: '#28407A',
  border: '#243A6E',
  textPrimary: '#EAF1FF',
  textSecondary: '#9DAFD2',
  textMuted: '#7285AC',
  textFaint: '#8296BD',
  tagline: '#A9BBDD',
  accent: '#6699FF',
  white: '#FFFFFF',
  disabledBg: '#1E3763',
  disabledFg: '#5E76A8',
  logoGlow: 'rgba(91,170,255,0.14)',
  modalBackdrop: 'rgba(0,0,0,0.55)',
  modalCard: '#132349',
} as const;

export const authGradients = {
  primary: ['#16294B', '#2BA192'] as const,
  hero: ['#1B3565', '#0A1330'] as const,
} as const;

export const authRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  sheet: 22,
  social: 11,
  logo: 48,
  pill: 100,
} as const;

export const authTypography = {
  brand: { fontSize: 30, fontWeight: '800' as const, letterSpacing: -0.3 },
  tagline: { fontSize: 13, fontWeight: '500' as const },
  welcome: { fontSize: 19, fontWeight: '800' as const },
  body: { fontSize: 13.5, fontWeight: '500' as const },
  forgot: { fontSize: 11.5, fontWeight: '600' as const },
  divider: { fontSize: 10.5, fontWeight: '500' as const },
  dividerStrong: {
    fontSize: 10.5,
    fontWeight: '700' as const,
    letterSpacing: 0.6,
  },
  button: { fontSize: 14, fontWeight: '700' as const },
  social: { fontSize: 11, fontWeight: '700' as const },
  terms: { fontSize: 10.5, fontWeight: '400' as const, lineHeight: 17 },
  modalTitle: { fontSize: 18, fontWeight: '700' as const },
  modalMessage: { fontSize: 14, fontWeight: '400' as const },
} as const;

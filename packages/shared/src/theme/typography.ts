export const fontFamily = {
  base: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  extrabold: 'Manrope_800ExtraBold',
};

// Fallback system font stack noted for teams without the Manrope font loaded yet.
export const fontFallback = 'System';

export const fontSize = {
  xs: 11,
  sm: 12.5,
  base: 14,
  md: 15,
  lg: 19,
  xl: 25,
  display: 30,
};

export const fontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
};

export const lineHeight = {
  tight: 1.2,
  base: 1.4,
  relaxed: 1.55,
};

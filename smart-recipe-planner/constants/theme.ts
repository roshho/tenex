export const colors = {
  primary: '#2D6A4F',
  primaryLight: '#52B788',
  primarySurface: '#D8F3DC',
  accent: '#F4A261',
  background: '#FAFAF8',
  surface: '#FFFFFF',
  surfaceAlt: '#F5F5F0',
  text: '#1B1B1B',
  textSecondary: '#6B6B6B',
  textMuted: '#9E9E9E',
  border: '#E8E8E3',
  error: '#E63946',
  white: '#FFFFFF',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const typography = {
  h1: { fontSize: 28, fontWeight: '700' as const, lineHeight: 36 },
  h2: { fontSize: 22, fontWeight: '700' as const, lineHeight: 30 },
  h3: { fontSize: 18, fontWeight: '600' as const, lineHeight: 26 },
  body: { fontSize: 15, fontWeight: '400' as const, lineHeight: 22 },
  bodySmall: { fontSize: 13, fontWeight: '400' as const, lineHeight: 19 },
  label: { fontSize: 12, fontWeight: '600' as const, lineHeight: 16 },
  caption: { fontSize: 11, fontWeight: '400' as const, lineHeight: 15 },
};

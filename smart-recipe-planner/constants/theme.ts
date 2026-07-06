export const colors = {
  primary: '#2D6A4F',
  primaryLight: '#52B788',
  primarySurface: '#D8F3DC',
  accent: '#F4A261',
  accentSurface: '#FCEADC',
  background: '#FAFAF8',
  surface: '#FFFFFF',
  surfaceAlt: '#F5F5F0',
  text: '#1B1B1B',
  textSecondary: '#6B6B6B',
  textMuted: '#9E9E9E',
  border: '#E8E8E3',
  error: '#E63946',
  white: '#FFFFFF',
  // Solid (not gradient) scrims for legibility of overlaid text/chips on photos —
  // no expo-linear-gradient dependency in this project, so overlays stay flat.
  scrimStrong: 'rgba(15,15,13,0.55)',
  scrimSoft: 'rgba(15,15,13,0.30)',
  glass: 'rgba(255,255,255,0.16)',
  glassBorder: 'rgba(255,255,255,0.35)',
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
  // Small uppercase tracked label — section headers ("DETECTED INGREDIENTS"),
  // the landing screen's eyebrow line, on-image chip text.
  eyebrow: { fontSize: 12, fontWeight: '700' as const, lineHeight: 16, letterSpacing: 1 },
};

// Reserved for surfaces that should visually lift off the background (cards, the
// hero image, floating buttons). Chips/pills intentionally stay flat (border only) —
// mixing both would read as busier, not more premium. elevation is the Android analog
// of the iOS shadow* props; both are needed on every shadow use.
export const shadows = {
  sm: {
    shadowColor: '#1B1B1B',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: '#1B1B1B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  lg: {
    shadowColor: '#1B1B1B',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 9,
  },
};

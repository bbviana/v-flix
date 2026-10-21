import { DarkTheme, type Theme } from 'expo-router';
import type { TextStyle } from 'react-native';

// Paleta escura inspirada na Apple: neutros dominam, o acento aparece pouco.
export const colors = {
  background: '#000000',
  surface: '#1d1d1f',
  surfaceAlt: '#2c2c2e',
  separator: 'rgba(255,255,255,0.12)',
  text: '#f5f5f7',
  textSecondary: '#a1a1a6',
  textTertiary: '#6e6e73',
  accent: '#2997ff',
  imdb: '#f5c518',
  oscar: '#d6b25e',
  success: '#30d158',
  danger: '#ff453a',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };

export const radius = { sm: 6, md: 10, lg: 14, pill: 999 };

/** Escala tipográfica: hierarquia por tamanho e peso, não por cor. */
export const type = {
  largeTitle: { fontSize: 32, fontWeight: '700', letterSpacing: -0.8, lineHeight: 38 },
  title: { fontSize: 24, fontWeight: '700', letterSpacing: -0.5, lineHeight: 30 },
  headline: { fontSize: 17, fontWeight: '600', letterSpacing: -0.2 },
  body: { fontSize: 16, fontWeight: '400', lineHeight: 24, letterSpacing: -0.1 },
  callout: { fontSize: 15, fontWeight: '400', lineHeight: 21 },
  subhead: { fontSize: 14, fontWeight: '400', lineHeight: 19 },
  footnote: { fontSize: 13, fontWeight: '400', lineHeight: 18 },
  caption: { fontSize: 11, fontWeight: '500', letterSpacing: 0.2 },
} satisfies Record<string, TextStyle>;

export const navigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accent,
    background: colors.background,
    card: colors.background,
    text: colors.text,
    border: colors.separator,
  },
};

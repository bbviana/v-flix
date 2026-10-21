import { DarkTheme, type Theme } from 'expo-router';

export const colors = {
  background: '#000000',
  surface: '#141414',
  surfaceAlt: '#232323',
  border: '#2f2f2f',
  text: '#ffffff',
  textMuted: '#a3a3a3',
  primary: '#e50914',
  imdb: '#f5c518',
  oscar: '#d4af37',
  success: '#46d369',
  danger: '#ff5a5f',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const radius = { sm: 4, md: 8, lg: 12 };

export const fontSize = { xs: 11, sm: 13, md: 15, lg: 18, xl: 22, xxl: 28 };

export const navigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.background,
    text: colors.text,
    border: colors.border,
  },
};

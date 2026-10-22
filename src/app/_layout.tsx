import { File } from 'expo-file-system';
import { Stack, ThemeProvider } from 'expo-router';
import { defaultDatabaseDirectory, SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';

import { DATABASE_NAME, migrateDbIfNeeded } from '@/db/migrations';
import { colors, navigationTheme } from '@/theme';

// Primeira instalação: o banco nasce do dump (make dump) e a sync só busca o que mudou.
// Só passa o asset quando o banco ainda não existe: com assetSource, o SQLiteProvider
// copia o asset (~15 MB) para o cache a cada abertura, mesmo sem usá-lo.
const DUMP = new File(`file://${defaultDatabaseDirectory}`, DATABASE_NAME).exists
  ? undefined
  : { assetId: require('../../assets/db/vflix.db') };

export default function RootLayout() {
  return (
    <ThemeProvider value={navigationTheme}>
      <SQLiteProvider databaseName={DATABASE_NAME} assetSource={DUMP} onInit={migrateDbIfNeeded}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.text,
            headerShadowVisible: false,
            headerTitleStyle: { fontWeight: '600' },
            headerBackButtonDisplayMode: 'minimal',
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="settings" options={{ title: 'Configurações' }} />
          <Stack.Screen name="sync" options={{ title: 'Sincronização' }} />
          <Stack.Screen name="filters" options={{ title: 'Filtros', presentation: 'modal' }} />
        </Stack>
      </SQLiteProvider>
    </ThemeProvider>
  );
}

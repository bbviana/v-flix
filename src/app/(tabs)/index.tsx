import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PosterCard } from '@/components/poster-card';
import { getPopular, type PosterItem } from '@/db/queries';
import { colors, radius, spacing, type } from '@/theme';

// Tela provisória: a Início com fileiras chega no passo 8.
export default function HomeScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [popular, setPopular] = useState<PosterItem[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      getPopular(db).then(setPopular);
    }, [db]),
  );

  if (popular === null) return <View style={styles.screen} />;

  if (popular.length === 0) {
    return (
      <View style={[styles.screen, styles.empty]}>
        <Text style={styles.emptyTitle}>Nenhum filme ainda</Text>
        <Text style={styles.emptyText}>Sincronize para trazer os catálogos dos seus serviços.</Text>
        <SyncButton />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.lg }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Início</Text>
        <Link href="/sync" asChild>
          <Pressable hitSlop={10} style={({ pressed }) => pressed && { opacity: 0.6 }}>
            <Ionicons name="sync" size={22} color={colors.text} />
          </Pressable>
        </Link>
      </View>
      <Text style={styles.rowTitle}>Populares</Text>
      <FlatList
        horizontal
        data={popular}
        keyExtractor={(m) => String(m.tmdb_id)}
        renderItem={({ item }) => <PosterCard movie={item} width={120} />}
        contentContainerStyle={styles.row}
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
      />
    </View>
  );
}

function SyncButton() {
  return (
    <Link href="/sync" asChild>
      <Pressable style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}>
        <Text style={styles.buttonText}>Sincronizar</Text>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.xl,
  },
  title: { ...type.largeTitle, color: colors.text },
  empty: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingHorizontal: spacing.xxl },
  emptyTitle: { ...type.title, color: colors.text },
  emptyText: { ...type.callout, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.md },
  rowTitle: { ...type.headline, color: colors.text, paddingHorizontal: spacing.xl, marginBottom: spacing.md },
  row: { paddingHorizontal: spacing.xl, gap: spacing.sm },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  buttonText: { ...type.callout, fontWeight: '600', color: '#fff' },
});

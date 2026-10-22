import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PosterCard } from '@/components/poster-card';
import { useFilters } from '@/explore/filters';
import { loadHomeRows, type HomeRow } from '@/home/rows';
import { colors, radius, spacing, type } from '@/theme';

const CARD_WIDTH = 116;

export default function HomeScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<HomeRow[] | null>(null);

  // Recarrega ao voltar (sync ou mudança de gêneros nas configurações).
  useFocusEffect(
    useCallback(() => {
      loadHomeRows(db).then(setRows);
    }, [db]),
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.lg }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Início</Text>
        <Link href="/settings" asChild>
          <Pressable hitSlop={10} style={({ pressed }) => pressed && { opacity: 0.6 }}>
            <Ionicons name="settings-outline" size={22} color={colors.text} />
          </Pressable>
        </Link>
      </View>

      {rows === null ? null : rows.length === 0 ? (
        <EmptyState />
      ) : (
        <ScrollView contentContainerStyle={styles.rows} showsVerticalScrollIndicator={false}>
          {rows.map((row) => (
            <Row key={row.key} row={row} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function Row({ row }: { row: HomeRow }) {
  const setFilters = useFilters((s) => s.set);

  const seeAll = () => {
    setFilters(row.filters);
    router.navigate('/explore');
  };

  return (
    <View style={styles.row}>
      <Pressable onPress={seeAll} style={styles.rowHeader} hitSlop={6}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {row.title}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
      </Pressable>
      <FlatList
        horizontal
        data={row.movies}
        keyExtractor={(m) => String(m.tmdb_id)}
        renderItem={({ item }) => <PosterCard movie={item} width={CARD_WIDTH} />}
        contentContainerStyle={styles.rowList}
        showsHorizontalScrollIndicator={false}
        initialNumToRender={4}
        windowSize={3}
      />
    </View>
  );
}

function EmptyState() {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>Nenhum filme ainda</Text>
      <Text style={styles.emptyText}>Sincronize para trazer os catálogos dos seus serviços.</Text>
      <Link href="/sync" asChild>
        <Pressable style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}>
          <Text style={styles.buttonText}>Sincronizar</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.lg,
  },
  title: { ...type.largeTitle, color: colors.text },
  rows: { gap: spacing.xxl, paddingBottom: spacing.xxl },
  row: { gap: spacing.md },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.xl,
    alignSelf: 'flex-start',
  },
  rowTitle: { ...type.headline, color: colors.text },
  rowList: { paddingHorizontal: spacing.xl, gap: spacing.sm },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingHorizontal: spacing.xxl },
  emptyTitle: { ...type.title, color: colors.text },
  emptyText: { ...type.callout, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.md },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  buttonText: { ...type.callout, fontWeight: '600', color: '#fff' },
});

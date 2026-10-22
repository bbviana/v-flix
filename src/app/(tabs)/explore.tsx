import Ionicons from '@expo/vector-icons/Ionicons';
import { FlashList } from '@shopify/flash-list';
import { Link, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PosterCard } from '@/components/poster-card';
import { activeFilterCount, DEFAULT_FILTERS, useFilters, useFilterValues, type SortBy } from '@/explore/filters';
import { exploreCount, exploreHiddenCount, exploreMovies, type ExploreItem } from '@/explore/query';
import { colors, radius, spacing, type } from '@/theme';

const PAGE = 60;
const COLUMNS = 3;
const GAP = spacing.sm;
const SORT_LABEL: Record<SortBy, string> = {
  popularity: 'popularidade',
  rating: 'nota IMDb',
  year: 'lançamento',
  added: 'adicionados recentemente',
};

export default function ExploreScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const filters = useFilterValues();
  const setFilters = useFilters((s) => s.set);

  // A busca é digitada localmente e aplicada com um pequeno atraso.
  const [text, setText] = useState(filters.query);
  // Se a busca mudar por fora (ex.: "ver tudo" de uma fileira da Início), o campo acompanha.
  const [appliedQuery, setAppliedQuery] = useState(filters.query);
  if (filters.query !== appliedQuery) {
    setAppliedQuery(filters.query);
    setText(filters.query);
  }
  useEffect(() => {
    const t = setTimeout(() => setFilters({ query: text }), 200);
    return () => clearTimeout(t);
  }, [text, setFilters]);

  const [items, setItems] = useState<ExploreItem[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [hidden, setHidden] = useState(0);
  const loadingMore = useRef(false);
  // Incrementado a cada nova consulta para descartar respostas atrasadas.
  const generation = useRef(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const loadedCount = useRef(0);
  useEffect(() => {
    loadedCount.current = items.length;
  }, [items.length]);
  const lastFilters = useRef(filters);

  // Recarrega ao voltar para a aba (ex.: depois de uma sincronização).
  useFocusEffect(useCallback(() => setRefreshKey((k) => k + 1), []));

  useEffect(() => {
    const gen = ++generation.current;
    // Filtros novos começam da primeira página. Ao voltar do Detalhe, recarrega tudo o que já
    // estava carregado: com só a primeira página, a lista encolheria e a rolagem perderia o lugar.
    const sameFilters = lastFilters.current === filters;
    lastFilters.current = filters;
    const limit = sameFilters ? Math.max(PAGE, loadedCount.current) : PAGE;
    Promise.all([exploreMovies(db, filters, limit, 0), exploreCount(db, filters)])
      .then(async ([rows, count]) => [rows, count, await exploreHiddenCount(db, filters, count)] as const)
      .then(([rows, count, hiddenCount]) => {
        if (gen !== generation.current) return;
        setItems(rows);
        setTotal(count);
        setHidden(hiddenCount);
      });
  }, [db, filters, refreshKey]);

  const loadMore = async () => {
    if (loadingMore.current || total === null || items.length >= total) return;
    loadingMore.current = true;
    const gen = generation.current;
    const rows = await exploreMovies(db, filters, PAGE, items.length);
    if (gen === generation.current) setItems((prev) => [...prev, ...rows]);
    loadingMore.current = false;
  };

  const activeCount = activeFilterCount(filters);
  const cardWidth = (width - spacing.xl * 2 - GAP * (COLUMNS - 1)) / COLUMNS;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.lg }]}>
      <View style={styles.top}>
        <Text style={styles.title}>Explorar</Text>

        <View style={styles.search}>
          <Ionicons name="search" size={17} color={colors.textTertiary} />
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Filmes"
            placeholderTextColor={colors.textTertiary}
            style={styles.searchInput}
            returnKeyType="search"
            autoCorrect={false}
          />
          {text.length > 0 && (
            <Pressable onPress={() => setText('')} hitSlop={10}>
              <Ionicons name="close-circle" size={17} color={colors.textTertiary} />
            </Pressable>
          )}
        </View>

        <View style={styles.bar}>
          <Text style={styles.count} numberOfLines={1}>
            {total === null ? ' ' : `${total.toLocaleString('pt-BR')} filmes · por ${SORT_LABEL[filters.sort]}`}
          </Text>
          <Link href="/filters" asChild>
            <Pressable hitSlop={8} style={({ pressed }) => [styles.filterButton, pressed && { opacity: 0.6 }]}>
              <Text style={styles.filterText}>Filtros</Text>
              {activeCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{activeCount}</Text>
                </View>
              )}
            </Pressable>
          </Link>
        </View>
        {hidden > 0 && (
          <Text style={styles.hiddenNote}>
            {hidden.toLocaleString('pt-BR')} {hidden === 1 ? 'filme oculto' : 'filmes ocultos'} pelos países escolhidos
            nas Configurações
          </Text>
        )}
      </View>

      <FlashList
        data={items}
        numColumns={COLUMNS}
        keyExtractor={(m) => String(m.tmdb_id)}
        renderItem={({ item }) => (
          <View style={styles.cell}>
            <PosterCard movie={item} width={cardWidth} />
          </View>
        )}
        contentContainerStyle={styles.grid}
        onEndReached={loadMore}
        onEndReachedThreshold={1.5}
        keyboardDismissMode="on-drag"
        ListEmptyComponent={
          total === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Nada encontrado</Text>
              <Text style={styles.emptyText}>Tente outra busca ou afrouxe os filtros.</Text>
              {activeCount > 0 && (
                <Pressable onPress={() => setFilters({ ...DEFAULT_FILTERS, query: filters.query, sort: filters.sort })}>
                  <Text style={styles.link}>Limpar filtros</Text>
                </Pressable>
              )}
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  top: { paddingHorizontal: spacing.xl, gap: spacing.md, paddingBottom: spacing.md },
  title: { ...type.largeTitle, color: colors.text },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 40,
  },
  searchInput: { ...type.callout, flex: 1, color: colors.text, paddingVertical: 0 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  count: { ...type.footnote, color: colors.textSecondary, flex: 1 },
  hiddenNote: { ...type.caption, fontWeight: '400', color: colors.textTertiary, marginTop: -spacing.xs },
  filterButton: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  filterText: { ...type.callout, color: colors.accent },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  grid: { paddingHorizontal: spacing.xl - GAP / 2, paddingBottom: spacing.xxl },
  cell: { paddingHorizontal: GAP / 2, paddingBottom: GAP },
  empty: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.xxxl },
  emptyTitle: { ...type.headline, color: colors.text },
  emptyText: { ...type.subhead, color: colors.textSecondary },
  link: { ...type.callout, color: colors.accent, marginTop: spacing.sm },
});

import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip, ChipGroup, Segmented } from '@/components/chip';
import { activeFilterCount, useFilters, useFilterValues, type OscarFilter, type SortBy, type WatchedFilter } from '@/explore/filters';
import { exploreCount, getFilterOptions, type FilterOptions } from '@/explore/query';
import { OSCAR_CATEGORIES } from '@/lib/oscar';
import { colors, radius, spacing, type } from '@/theme';

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'popularity', label: 'Popularidade' },
  { value: 'rating', label: 'Nota' },
  { value: 'year', label: 'Lançamento' },
];
const OSCAR_OPTIONS: { value: OscarFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'nominated', label: 'Indicados' },
  { value: 'won', label: 'Vencedores' },
];
const WATCHED_OPTIONS: { value: WatchedFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'unwatched', label: 'Não vistos' },
  { value: 'watched', label: 'Vistos' },
];
const RATING_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'Qualquer' },
  { value: 6, label: '6+' },
  { value: 7, label: '7+' },
  { value: 7.5, label: '7,5+' },
  { value: 8, label: '8+' },
];
const VOTES_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Todos' },
  { value: 1000, label: '1 mil+' },
  { value: 10000, label: '10 mil+' },
  { value: 100000, label: '100 mil+' },
];
const TOP_COUNTRIES = 12;

export default function FiltersScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const f = useFilterValues();
  const set = useFilters((s) => s.set);
  const toggle = useFilters((s) => s.toggle);
  const reset = useFilters((s) => s.reset);

  const [options, setOptions] = useState<FilterOptions | null>(null);
  const [allCountries, setAllCountries] = useState(false);
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    getFilterOptions(db).then(setOptions);
  }, [db]);

  // Contagem ao vivo para o botão de confirmar.
  useEffect(() => {
    let current = true;
    exploreCount(db, f).then((n) => current && setCount(n));
    return () => {
      current = false;
    };
  }, [db, f]);

  const countries = options
    ? allCountries
      ? options.countries
      : // Mantém visíveis os selecionados mesmo fora do top.
        options.countries.filter((c, i) => i < TOP_COUNTRIES || f.countries.includes(c.iso))
    : [];

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          headerRight: () =>
            activeFilterCount(f) > 0 ? (
              <Pressable onPress={reset} hitSlop={10}>
                <Text style={styles.headerAction}>Limpar</Text>
              </Pressable>
            ) : null,
        }}
      />

      <ScrollView contentContainerStyle={styles.content}>
        <Section title="Ordenar por">
          <Segmented options={SORT_OPTIONS} value={f.sort} onChange={(sort) => set({ sort })} />
        </Section>

        <Section title="Seus filmes">
          <Segmented options={WATCHED_OPTIONS} value={f.watched} onChange={(watched) => set({ watched })} />
          <ChipGroup>
            <Chip label="Só da Minha lista" selected={f.inList} onPress={() => set({ inList: !f.inList })} />
          </ChipGroup>
        </Section>

        {options && options.providers.length > 0 && (
          <Section title="Serviço">
            <ChipGroup>
              {options.providers.map((p) => (
                <Chip key={p.id} label={p.name} selected={f.providers.includes(p.id)} onPress={() => toggle('providers', p.id)} />
              ))}
            </ChipGroup>
          </Section>
        )}

        <Section title="Oscar">
          <Segmented options={OSCAR_OPTIONS} value={f.oscar} onChange={(oscar) => set({ oscar })} />
          {f.oscar !== 'all' && (
            <ChipGroup>
              {OSCAR_CATEGORIES.map((c) => (
                <Chip
                  key={c.id}
                  label={c.short}
                  selected={f.oscarCategories.includes(c.id)}
                  onPress={() => toggle('oscarCategories', c.id)}
                />
              ))}
            </ChipGroup>
          )}
        </Section>

        <Section title="Nota IMDb mínima">
          <ChipGroup>
            {RATING_OPTIONS.map((o) => (
              <Chip key={String(o.value)} label={o.label} selected={f.minRating === o.value} onPress={() => set({ minRating: o.value })} />
            ))}
          </ChipGroup>
        </Section>

        <Section title="Votos no IMDb" hint="Esconde filmes obscuros, com poucas avaliações.">
          <ChipGroup>
            {VOTES_OPTIONS.map((o) => (
              <Chip key={o.value} label={o.label} selected={f.minVotes === o.value} onPress={() => set({ minVotes: o.value })} />
            ))}
          </ChipGroup>
        </Section>

        {options && (
          <>
            <Section title="Década">
              <ChipGroup>
                {options.decades.map((d) => (
                  <Chip key={d} label={`${d}s`} selected={f.decades.includes(d)} onPress={() => toggle('decades', d)} />
                ))}
              </ChipGroup>
            </Section>

            <Section title="Gênero">
              <ChipGroup>
                {options.genres.map((g) => (
                  <Chip key={g.id} label={g.name} selected={f.genres.includes(g.id)} onPress={() => toggle('genres', g.id)} />
                ))}
              </ChipGroup>
            </Section>

            <Section title="País de produção">
              <ChipGroup>
                {countries.map((c) => (
                  <Chip key={c.iso} label={c.name} selected={f.countries.includes(c.iso)} onPress={() => toggle('countries', c.iso)} />
                ))}
              </ChipGroup>
              {options.countries.length > TOP_COUNTRIES && (
                <Pressable onPress={() => setAllCountries((v) => !v)} hitSlop={8}>
                  <Text style={styles.more}>
                    {allCountries ? 'Mostrar menos' : `Mostrar todos (${options.countries.length})`}
                  </Text>
                </Pressable>
              )}
            </Section>
          </>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.apply, pressed && { opacity: 0.8 }]}>
          <Text style={styles.applyText}>
            {count === null ? 'Ver filmes' : count === 0 ? 'Nenhum filme' : `Ver ${count.toLocaleString('pt-BR')} filmes`}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={{ gap: 2 }}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {hint && <Text style={styles.hint}>{hint}</Text>}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.xxl, paddingBottom: spacing.xxxl },
  headerAction: { ...type.callout, color: colors.accent },
  section: { gap: spacing.md },
  sectionTitle: { ...type.headline, color: colors.text },
  hint: { ...type.footnote, color: colors.textTertiary },
  more: { ...type.subhead, color: colors.accent },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
    backgroundColor: colors.background,
  },
  apply: { backgroundColor: colors.accent, borderRadius: radius.lg, paddingVertical: 14, alignItems: 'center' },
  applyText: { ...type.callout, fontWeight: '600', color: '#fff' },
});

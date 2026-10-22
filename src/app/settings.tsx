import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { getMeta } from '@/db/helpers';
import { getHomeGenres, getHomeHideWatched, setHomeGenres, setHomeHideWatched } from '@/db/settings';
import { colors, radius, spacing, type } from '@/theme';

type Genre = { id: number; name: string };

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const [genres, setGenres] = useState<Genre[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [hideWatched, setHideWatched] = useState(false);

  useFocusEffect(
    useCallback(() => {
      Promise.all([
        db.getAllAsync<Genre>('SELECT id, name FROM genre ORDER BY name'),
        getHomeGenres(db),
        getMeta(db),
        getHomeHideWatched(db),
      ]).then(([g, s, meta, hide]) => {
        setGenres(g);
        setSelected(s);
        setLastSync(meta.last_sync_at ?? null);
        setHideWatched(hide);
      });
    }, [db]),
  );

  // A ordem das fileiras segue a ordem em que os gêneros foram marcados.
  const toggle = (id: number) => {
    const next = selected.includes(id) ? selected.filter((g) => g !== id) : [...selected, id];
    setSelected(next);
    setHomeGenres(db, next);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <View style={styles.group}>
          <Link href="/sync" asChild>
            <Pressable style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
              <Text style={styles.rowTitle}>Sincronização</Text>
              <Text style={styles.rowDetail}>
                {lastSync ? new Date(lastSync).toLocaleDateString('pt-BR') : 'Nunca'}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </Pressable>
          </Link>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Início</Text>
        <View style={styles.group}>
          <View style={styles.row}>
            <Text style={styles.rowTitle}>Esconder filmes vistos</Text>
            <Switch
              value={hideWatched}
              onValueChange={(v) => {
                setHideWatched(v);
                setHomeHideWatched(db, v);
              }}
              trackColor={{ false: colors.surfaceAlt, true: colors.success }}
              thumbColor={colors.text}
            />
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Gêneros na Início</Text>
        {genres.length === 0 ? (
          <Text style={styles.footnote}>Os gêneros aparecem depois da primeira sincronização.</Text>
        ) : (
          <>
            <View style={styles.group}>
              {genres.map((g, i) => {
                const on = selected.includes(g.id);
                return (
                  <Pressable
                    key={g.id}
                    onPress={() => toggle(g.id)}
                    style={({ pressed }) => [
                      styles.row,
                      i < genres.length - 1 && styles.divider,
                      pressed && styles.rowPressed,
                    ]}
                  >
                    <Text style={styles.rowTitle}>{g.name}</Text>
                    {on && <Ionicons name="checkmark" size={20} color={colors.accent} />}
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.footnote}>Cada gênero marcado vira uma fileira, na ordem em que foi marcado.</Text>
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.xxl },
  section: { gap: spacing.sm },
  sectionTitle: {
    ...type.footnote,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: spacing.lg,
  },
  group: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    minHeight: 46,
  },
  rowPressed: { backgroundColor: colors.surfaceAlt },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
  rowTitle: { ...type.callout, color: colors.text, flex: 1 },
  rowDetail: { ...type.callout, color: colors.textSecondary },
  footnote: { ...type.footnote, color: colors.textTertiary, paddingHorizontal: spacing.lg },
});

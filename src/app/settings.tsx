import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { getMeta } from '@/db/helpers';
import {
  getHomeGenres,
  getHomeHideWatched,
  getServices,
  setHomeGenres,
  setHomeHideWatched,
  setServices,
} from '@/db/settings';
import { SERVICES } from '@/lib/services';
import { overallProgress, useSync } from '@/sync/store';
import { colors, radius, spacing, type } from '@/theme';

type Genre = { id: number; name: string };

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const [genres, setGenres] = useState<Genre[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [hideWatched, setHideWatched] = useState(false);
  const [services, setServicesState] = useState<string[]>([]);
  const syncing = useSync((s) => s.running);
  const syncProgress = useSync((s) => Math.round(overallProgress(s.steps) * 100));
  const syncFinishedAt = useSync((s) => s.finishedAt);

  const load = useCallback(() => {
    Promise.all([
      db.getAllAsync<Genre>('SELECT id, name FROM genre ORDER BY name'),
      getHomeGenres(db),
      getMeta(db),
      getHomeHideWatched(db),
      getServices(db),
    ]).then(([g, s, meta, hide, sv]) => {
      setGenres(g);
      setSelected(s);
      setLastSync(meta.last_sync_at ?? null);
      setHideWatched(hide);
      setServicesState(sv);
    });
  }, [db]);
  useFocusEffect(load);
  // A data da última sync muda quando uma sync termina com a tela aberta.
  useEffect(() => {
    if (syncFinishedAt) load();
  }, [load, syncFinishedAt]);

  // A ordem das fileiras segue a ordem em que os gêneros foram marcados.
  const toggle = (id: number) => {
    const next = selected.includes(id) ? selected.filter((g) => g !== id) : [...selected, id];
    setSelected(next);
    setHomeGenres(db, next);
  };

  // Pelo menos um serviço fica marcado: sem nenhum, a sincronização não tem o que buscar.
  // Durante a sync, a lista de serviços já foi lida; mudar agora deixaria o catálogo inconsistente.
  const toggleService = (label: string) => {
    const on = services.includes(label);
    if (syncing || (on && services.length === 1)) return;
    const next = on ? services.filter((s) => s !== label) : [...services, label];
    setServicesState(next);
    setServices(db, next);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <View style={styles.group}>
          <Link href="/sync" asChild>
            <Pressable style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
              <Text style={styles.rowTitle}>Sincronização</Text>
              {syncing ? (
                <Text style={[styles.rowDetail, { color: colors.accent }]}>Sincronizando… {syncProgress}%</Text>
              ) : (
                <Text style={styles.rowDetail}>
                  {lastSync ? new Date(lastSync).toLocaleDateString('pt-BR') : 'Nunca'}
                </Text>
              )}
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </Pressable>
          </Link>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Serviços</Text>
        <View style={styles.group}>
          {SERVICES.map((sv, i) => (
            <Pressable
              key={sv.label}
              onPress={() => toggleService(sv.label)}
              disabled={syncing}
              style={({ pressed }) => [
                styles.row,
                i < SERVICES.length - 1 && styles.divider,
                pressed && styles.rowPressed,
                syncing && styles.rowDisabled,
              ]}
            >
              <Text style={styles.rowTitle}>{sv.label}</Text>
              {sv.free && <Text style={styles.rowDetail}>Grátis</Text>}
              <View style={styles.check}>
                {services.includes(sv.label) && <Ionicons name="checkmark" size={20} color={colors.accent} />}
              </View>
            </Pressable>
          ))}
        </View>
        <Text style={styles.footnote}>
          {syncing
            ? 'Os serviços podem ser alterados quando a sincronização terminar.'
            : 'Desmarcar tira os filmes do serviço na hora. Os marcados entram na próxima sincronização.'}
        </Text>
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
  rowDisabled: { opacity: 0.4 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
  rowTitle: { ...type.callout, color: colors.text, flex: 1 },
  rowDetail: { ...type.callout, color: colors.textSecondary },
  check: { width: 20, alignItems: 'flex-end' },
  footnote: { ...type.footnote, color: colors.textTertiary, paddingHorizontal: spacing.lg },
});

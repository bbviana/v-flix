import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useSQLiteContext } from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { posterUrl } from '@/api/tmdb';
import { getMeta } from '@/db/helpers';
import { getCatalogSummary, type CatalogSummary } from '@/db/queries';
import { useSync } from '@/sync/store';
import type { StepState } from '@/sync/types';
import { colors, radius, spacing, type } from '@/theme';

type Summary = CatalogSummary & { lastSyncAt?: string };

async function fetchSummary(db: SQLiteDatabase): Promise<Summary> {
  const [catalog, meta] = await Promise.all([getCatalogSummary(db), getMeta(db)]);
  return { ...catalog, lastSyncAt: meta.last_sync_at };
}

export default function SyncScreen() {
  const db = useSQLiteContext();
  const steps = useSync((s) => s.steps);
  const running = useSync((s) => s.running);
  const finishedAt = useSync((s) => s.finishedAt);
  const { start, cancel } = useSync.getState();
  const [summary, setSummary] = useState<Summary | null>(null);

  // A sync continua se a tela for fechada; ao terminar, os números são recarregados.
  useEffect(() => {
    fetchSummary(db).then(setSummary);
  }, [db, finishedAt]);

  const lastSync = summary?.lastSyncAt ? new Date(summary.lastSyncAt).toLocaleString('pt-BR') : null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.intro}>
        <Text style={styles.introText}>
          {lastSync ? `Última sincronização em ${lastSync}.` : 'Nenhuma sincronização ainda.'}
        </Text>
        <Pressable
          onPress={running ? cancel : () => start(db)}
          style={({ pressed }) => [styles.button, running && styles.buttonCancel, pressed && styles.pressed]}
        >
          <Text style={[styles.buttonText, running && { color: colors.text }]}>
            {running ? 'Cancelar' : 'Sincronizar agora'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.group}>
        {steps.map((step, i) => (
          <StepRow key={step.id} step={step} last={i === steps.length - 1} />
        ))}
      </View>

      {summary && summary.total > 0 && (
        <View style={styles.catalog}>
          <View>
            <Text style={styles.bigNumber}>{summary.total.toLocaleString('pt-BR')}</Text>
            <Text style={styles.bigLabel}>filmes no catálogo</Text>
          </View>

          <View style={styles.stats}>
            <Stat value={summary.withRating.toLocaleString('pt-BR')} label="com nota IMDb" />
            <Stat value={String(summary.oscarNominees)} label="indicados ao Oscar" />
            <Stat value={String(summary.oscarWinners)} label="vencedores" />
          </View>

          <View style={styles.group}>
            {summary.providers.map((p, i) => (
              <View key={p.id} style={[styles.row, i < summary.providers.length - 1 && styles.rowDivider]}>
                <Image source={posterUrl(p.logo_path, 'w92')} style={styles.logo} />
                <Text style={styles.rowTitle}>{p.name}</Text>
                <Text style={styles.rowValue}>{p.count.toLocaleString('pt-BR')}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function StepRow({ step, last }: { step: StepState; last: boolean }) {
  return (
    <View style={[styles.step, !last && styles.rowDivider]}>
      <View style={styles.stepHeader}>
        <StatusIcon status={step.status} />
        <Text style={styles.stepTitle}>{step.title}</Text>
      </View>
      {step.message && (
        <Text style={[styles.stepMessage, step.status === 'error' && { color: colors.danger }]}>{step.message}</Text>
      )}
      {step.status === 'running' && step.progress !== undefined && (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.round(step.progress * 100)}%` }]} />
        </View>
      )}
    </View>
  );
}

function StatusIcon({ status }: { status: StepState['status'] }) {
  switch (status) {
    case 'running':
      return <ActivityIndicator size="small" color={colors.accent} />;
    case 'done':
      return <Ionicons name="checkmark-circle" size={20} color={colors.success} />;
    case 'skipped':
      return <Ionicons name="play-skip-forward-circle" size={20} color={colors.textTertiary} />;
    case 'error':
      return <Ionicons name="alert-circle" size={20} color={colors.danger} />;
    default:
      return <Ionicons name="ellipse-outline" size={20} color={colors.textTertiary} />;
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.xxl },
  intro: { gap: spacing.lg, alignItems: 'flex-start' },
  introText: { ...type.callout, color: colors.textSecondary },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  buttonCancel: { backgroundColor: colors.surfaceAlt },
  pressed: { opacity: 0.7 },
  buttonText: { ...type.callout, fontWeight: '600', color: '#fff' },
  group: { backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: spacing.lg },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
  step: { paddingVertical: spacing.md, gap: spacing.xs },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepTitle: { ...type.callout, color: colors.text },
  stepMessage: { ...type.footnote, color: colors.textSecondary, marginLeft: 32 },
  progressTrack: {
    height: 3,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 2,
    marginLeft: 32,
    marginTop: spacing.xs,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: colors.accent },
  catalog: { gap: spacing.xl },
  bigNumber: { ...type.largeTitle, fontSize: 44, lineHeight: 50, color: colors.text },
  bigLabel: { ...type.callout, color: colors.textSecondary },
  stats: { flexDirection: 'row', gap: spacing.xl },
  stat: { flex: 1, gap: 2 },
  statValue: { ...type.headline, color: colors.text },
  statLabel: { ...type.footnote, color: colors.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  logo: { width: 28, height: 28, borderRadius: radius.sm },
  rowTitle: { ...type.callout, color: colors.text, flex: 1 },
  rowValue: { ...type.callout, color: colors.textSecondary },
});

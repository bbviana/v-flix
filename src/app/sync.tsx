import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useSQLiteContext } from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { posterUrl } from '@/api/tmdb';
import { getMeta } from '@/db/helpers';
import { getCatalogSummary, type CatalogSummary } from '@/db/queries';
import { initialStepStates, runSync } from '@/sync/run-sync';
import type { StepState } from '@/sync/types';
import { colors, fontSize, radius, spacing } from '@/theme';

type Summary = CatalogSummary & { lastSyncAt?: string };

async function fetchSummary(db: SQLiteDatabase): Promise<Summary> {
  const [catalog, meta] = await Promise.all([getCatalogSummary(db), getMeta(db)]);
  return { ...catalog, lastSyncAt: meta.last_sync_at };
}

export default function SyncScreen() {
  const db = useSQLiteContext();
  const [steps, setSteps] = useState<StepState[]>(initialStepStates);
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetchSummary(db).then(setSummary);
  }, [db]);

  // Cancela a sincronização se a tela for fechada no meio.
  useEffect(() => () => abortRef.current?.abort(), []);

  const start = async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    try {
      await runSync(db, setSteps, controller.signal);
    } finally {
      setRunning(false);
      abortRef.current = null;
      setSummary(await fetchSummary(db));
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.muted}>
        Última sincronização:{' '}
        {summary?.lastSyncAt ? new Date(summary.lastSyncAt).toLocaleString('pt-BR') : 'nunca'}
      </Text>

      <Pressable
        onPress={running ? () => abortRef.current?.abort() : start}
        style={({ pressed }) => [styles.button, running && styles.buttonCancel, pressed && styles.pressed]}
      >
        <Text style={styles.buttonText}>{running ? 'Cancelar' : 'Sincronizar'}</Text>
      </Pressable>

      <View style={styles.card}>
        {steps.map((step) => (
          <StepRow key={step.id} step={step} />
        ))}
      </View>

      {summary && summary.total > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Catálogo</Text>
          <Text style={styles.total}>
            {summary.total.toLocaleString('pt-BR')} filmes únicos ·{' '}
            {summary.withRating.toLocaleString('pt-BR')} com nota IMDb · {summary.oscarNominees} indicados ao
            Oscar ({summary.oscarWinners} vencedores)
          </Text>
          {summary.providers.map((p) => (
            <View key={p.id} style={styles.providerRow}>
              <Image source={posterUrl(p.logo_path, 'w92')} style={styles.logo} />
              <Text style={styles.providerName}>{p.name}</Text>
              <Text style={styles.providerCount}>{p.count.toLocaleString('pt-BR')}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function StepRow({ step }: { step: StepState }) {
  return (
    <View style={styles.step}>
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
      return <ActivityIndicator size="small" color={colors.primary} />;
    case 'done':
      return <Ionicons name="checkmark-circle" size={20} color={colors.success} />;
    case 'skipped':
      return <Ionicons name="play-skip-forward-circle" size={20} color={colors.textMuted} />;
    case 'error':
      return <Ionicons name="alert-circle" size={20} color={colors.danger} />;
    default:
      return <Ionicons name="ellipse-outline" size={20} color={colors.textMuted} />;
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg },
  muted: { color: colors.textMuted, fontSize: fontSize.sm },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  buttonCancel: { backgroundColor: colors.surfaceAlt },
  pressed: { opacity: 0.7 },
  buttonText: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.lg },
  cardTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
  total: { color: colors.textMuted, fontSize: fontSize.md, marginTop: -spacing.sm },
  step: { gap: spacing.xs },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
  stepMessage: { color: colors.textMuted, fontSize: fontSize.sm, marginLeft: 28 },
  progressTrack: {
    height: 4,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 2,
    marginLeft: 28,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: colors.primary },
  providerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  logo: { width: 32, height: 32, borderRadius: radius.sm },
  providerName: { color: colors.text, fontSize: fontSize.md, flex: 1 },
  providerCount: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
});

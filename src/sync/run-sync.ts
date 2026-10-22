import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import type { SQLiteDatabase } from 'expo-sqlite';

import { expoRatingsSource } from './imdb-source.expo';
import { createSyncSteps, writeSyncSummary } from './steps';
import type { StepState, SyncStep } from './types';

export const SYNC_STEPS: SyncStep[] = createSyncSteps(expoRatingsSource);

const KEEP_AWAKE_TAG = 'vflix-sync';

export const initialStepStates = (): StepState[] =>
  SYNC_STEPS.map((s) => ({ id: s.id, title: s.title, status: 'pending' }));

/**
 * Executa as etapas em sequência. Para na primeira que falhar; como cada etapa é
 * idempotente/retomável, basta rodar de novo.
 */
export async function runSync(
  db: SQLiteDatabase,
  onChange: (states: StepState[]) => void,
  signal: AbortSignal,
): Promise<boolean> {
  const states = initialStepStates();
  const emit = () => onChange(states.map((s) => ({ ...s })));
  emit();

  await activateKeepAwakeAsync(KEEP_AWAKE_TAG);
  try {
    for (const [i, step] of SYNC_STEPS.entries()) {
      states[i] = { ...states[i], status: 'running', message: undefined, progress: undefined };
      emit();
      try {
        const result = await step.run({
          db,
          signal,
          report: ({ message, progress }) => {
            states[i] = { ...states[i], message: message ?? states[i].message, progress };
            emit();
          },
        });
        states[i] =
          typeof result === 'object'
            ? { ...states[i], status: 'skipped', message: result.message, progress: undefined }
            : { ...states[i], status: 'done', message: result || 'Concluído', progress: 1 };
        emit();
      } catch (err) {
        const message = signal.aborted ? 'Cancelado' : err instanceof Error ? err.message : String(err);
        states[i] = { ...states[i], status: 'error', message };
        emit();
        return false;
      }
    }
    await writeSyncSummary(db);
    return true;
  } finally {
    deactivateKeepAwake(KEEP_AWAKE_TAG);
  }
}

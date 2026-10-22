import type { SQLiteDatabase } from 'expo-sqlite';
import { create } from 'zustand';

import { initialStepStates, runSync } from './run-sync';
import type { StepState } from './types';

type SyncState = {
  steps: StepState[];
  running: boolean;
  /** Muda a cada sync concluída (ou interrompida), para as telas recarregarem os números. */
  finishedAt: number | null;
  start: (db: SQLiteDatabase) => void;
  cancel: () => void;
};

let controller: AbortController | null = null;

/**
 * A sincronização vive fora das telas: continua enquanto se navega pelo app
 * e a tela de Sincronização só mostra o estado atual. Cancelar é explícito.
 */
export const useSync = create<SyncState>((set, get) => ({
  steps: initialStepStates(),
  running: false,
  finishedAt: null,
  start: (db) => {
    if (get().running) return;
    controller = new AbortController();
    set({ running: true });
    runSync(db, (steps) => set({ steps }), controller.signal).finally(() => {
      controller = null;
      set({ running: false, finishedAt: Date.now() });
    });
  },
  cancel: () => controller?.abort(),
}));

/** Progresso geral de 0 a 1: etapas concluídas mais a fração da etapa atual. */
export function overallProgress(steps: StepState[]) {
  const done = steps.filter((s) => s.status === 'done' || s.status === 'skipped').length;
  const current = steps.find((s) => s.status === 'running')?.progress ?? 0;
  return Math.min(1, (done + current) / steps.length);
}

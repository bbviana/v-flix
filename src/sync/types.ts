import type { SQLiteDatabase } from 'expo-sqlite';

export type StepStatus = 'pending' | 'running' | 'done' | 'skipped' | 'error';

export type StepState = {
  id: string;
  title: string;
  status: StepStatus;
  message?: string;
  /** 0..1, ou undefined quando indeterminado */
  progress?: number;
};

export type StepContext = {
  db: SQLiteDatabase;
  signal: AbortSignal;
  report: (update: { message?: string; progress?: number }) => void;
};

export type SyncStep = {
  id: string;
  title: string;
  /**
   * Retorna uma mensagem final para exibir quando a etapa termina, ou
   * `{ skipped: true, message }` quando não havia nada a fazer.
   */
  run: (ctx: StepContext) => Promise<string | void | { skipped: true; message: string }>;
};

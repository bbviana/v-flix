import type { SQLiteDatabase } from 'expo-sqlite';
import { create } from 'zustand';

export type UserState = { watched: boolean; inList: boolean };

type UserListsStore = {
  /** Muda a cada alteração, para telas abertas (Início) recarregarem. */
  version: number;
  /**
   * O que mudou nesta sessão, por filme. Os pôsteres preferem isto ao valor da consulta,
   * que pode ser anterior à mudança (ex.: grade do Explorar ainda não recarregada).
   */
  changed: Record<number, Partial<UserState>>;
};

export const useUserLists = create<UserListsStore>(() => ({ version: 0, changed: {} }));

function recordChange(tmdbId: number, change: Partial<UserState>) {
  useUserLists.setState((s) => ({
    version: s.version + 1,
    changed: { ...s.changed, [tmdbId]: { ...s.changed[tmdbId], ...change } },
  }));
}

/** Estado do filme para o pôster: a mudança feita nesta sessão, se houver, senão o da consulta. */
export function useUserFlags(tmdbId: number, fromQuery: UserState): UserState {
  const changed = useUserLists((s) => s.changed[tmdbId]);
  return { ...fromQuery, ...changed };
}

export async function getUserState(db: SQLiteDatabase, tmdbId: number): Promise<UserState> {
  const row = await db.getFirstAsync<{ watched: number; in_list: number }>(
    `SELECT EXISTS (SELECT 1 FROM watched WHERE tmdb_id = ?1) AS watched,
            EXISTS (SELECT 1 FROM watchlist WHERE tmdb_id = ?1) AS in_list`,
    tmdbId,
  );
  return { watched: !!row?.watched, inList: !!row?.in_list };
}

/** Marcar como visto também tira da Minha lista: o filme já cumpriu seu papel lá. */
export async function setWatched(db: SQLiteDatabase, tmdbId: number, watched: boolean) {
  recordChange(tmdbId, watched ? { watched, inList: false } : { watched });
  await db.withExclusiveTransactionAsync(async (txn) => {
    if (watched) {
      await txn.runAsync('INSERT OR IGNORE INTO watched (tmdb_id, watched_at) VALUES (?, ?)', tmdbId, new Date().toISOString());
      await txn.runAsync('DELETE FROM watchlist WHERE tmdb_id = ?', tmdbId);
    } else {
      await txn.runAsync('DELETE FROM watched WHERE tmdb_id = ?', tmdbId);
    }
  });
}

export async function setInList(db: SQLiteDatabase, tmdbId: number, inList: boolean) {
  recordChange(tmdbId, { inList });
  if (inList) {
    await db.runAsync('INSERT OR IGNORE INTO watchlist (tmdb_id, added_at) VALUES (?, ?)', tmdbId, new Date().toISOString());
  } else {
    await db.runAsync('DELETE FROM watchlist WHERE tmdb_id = ?', tmdbId);
  }
}

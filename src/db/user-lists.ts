import type { SQLiteDatabase } from 'expo-sqlite';
import { create } from 'zustand';

/** Muda a cada alteração na Minha lista, para telas abertas (Início) recarregarem. */
export const useListVersion = create<{ version: number }>(() => ({ version: 0 }));
const bumpListVersion = () => useListVersion.setState((s) => ({ version: s.version + 1 }));

export type UserState = { watched: boolean; inList: boolean };

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
  await db.withExclusiveTransactionAsync(async (txn) => {
    if (watched) {
      await txn.runAsync('INSERT OR IGNORE INTO watched (tmdb_id, watched_at) VALUES (?, ?)', tmdbId, new Date().toISOString());
      await txn.runAsync('DELETE FROM watchlist WHERE tmdb_id = ?', tmdbId);
    } else {
      await txn.runAsync('DELETE FROM watched WHERE tmdb_id = ?', tmdbId);
    }
  });
  bumpListVersion();
}

export async function setInList(db: SQLiteDatabase, tmdbId: number, inList: boolean) {
  if (inList) {
    await db.runAsync('INSERT OR IGNORE INTO watchlist (tmdb_id, added_at) VALUES (?, ?)', tmdbId, new Date().toISOString());
  } else {
    await db.runAsync('DELETE FROM watchlist WHERE tmdb_id = ?', tmdbId);
  }
  bumpListVersion();
}

import type { SQLiteDatabase } from 'expo-sqlite';

/** Animação, Drama, Ficção científica, Ação, Mistério (IDs da TMDB). */
export const DEFAULT_HOME_GENRES = [16, 18, 878, 28, 9648];

async function getSetting<T>(db: SQLiteDatabase, key: string, fallback: T): Promise<T> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_setting WHERE key = ?', key);
  return row ? (JSON.parse(row.value) as T) : fallback;
}

async function setSetting(db: SQLiteDatabase, key: string, value: unknown) {
  await db.runAsync('INSERT OR REPLACE INTO app_setting (key, value) VALUES (?, ?)', key, JSON.stringify(value));
}

/** Gêneros com fileira na Início, na ordem em que aparecem. */
export const getHomeGenres = (db: SQLiteDatabase) => getSetting(db, 'home_genres', DEFAULT_HOME_GENRES);
export const setHomeGenres = (db: SQLiteDatabase, ids: number[]) => setSetting(db, 'home_genres', ids);

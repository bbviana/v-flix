import type { SQLiteDatabase } from 'expo-sqlite';

import { DEFAULT_SERVICES } from '@/lib/services';

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

/** Esconde das fileiras da Início (exceto Minha lista) os filmes já vistos. */
export const getHomeHideWatched = (db: SQLiteDatabase) => getSetting(db, 'home_hide_watched', false);
export const setHomeHideWatched = (db: SQLiteDatabase, value: boolean) => setSetting(db, 'home_hide_watched', value);

/** Serviços acompanhados (labels de SERVICES). */
export const getServices = (db: SQLiteDatabase) => getSetting(db, 'services', DEFAULT_SERVICES);

/**
 * Grava a escolha e tira na hora os serviços desmarcados: seus filmes deixam de contar
 * como disponíveis sem esperar a sincronização. Os marcados entram na próxima sync.
 */
export async function setServices(db: SQLiteDatabase, labels: string[]) {
  await db.withExclusiveTransactionAsync(async (txn) => {
    await setSetting(txn, 'services', labels);
    const keep = labels.map(() => '?').join(',');
    const removed = `SELECT id FROM provider WHERE name NOT IN (${keep})`;
    await txn.runAsync(`DELETE FROM movie_provider WHERE provider_id IN (${removed})`, labels);
    await txn.runAsync(`DELETE FROM provider WHERE name NOT IN (${keep})`, labels);
  });
}

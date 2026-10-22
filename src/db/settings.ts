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

/** Países ocultos (ISO): some o filme cujos países de produção estão todos na lista. */
export const getHiddenCountries = (db: SQLiteDatabase) => getSetting<string[]>(db, 'hidden_countries', []);
export const setHiddenCountries = (db: SQLiteDatabase, isos: string[]) => setSetting(db, 'hidden_countries', isos);

/** Oculta também os filmes sem país de produção cadastrado. */
export const getHideNoCountry = (db: SQLiteDatabase) => getSetting(db, 'hide_no_country', false);
export const setHideNoCountry = (db: SQLiteDatabase, value: boolean) => setSetting(db, 'hide_no_country', value);

/**
 * Condição SQL "o filme não está oculto pelos países", lendo as configurações direto
 * de app_setting: vale em qualquer consulta sem precisar carregá-las antes.
 * Aparece quem tem algum país fora da lista (coproduções como 1917, em que a Índia
 * só participa, continuam), ou quem não tem país, se "Sem país" não estiver marcado.
 */
export const visibleByCountry = (alias: string) => `(
  EXISTS (
    SELECT 1 FROM movie_country vc WHERE vc.tmdb_id = ${alias}.tmdb_id
      AND vc.iso NOT IN (SELECT value FROM json_each(COALESCE((SELECT value FROM app_setting WHERE key = 'hidden_countries'), '[]')))
  )
  OR (
    NOT EXISTS (SELECT 1 FROM movie_country vc WHERE vc.tmdb_id = ${alias}.tmdb_id)
    AND COALESCE((SELECT value FROM app_setting WHERE key = 'hide_no_country'), 'false') <> 'true'
  )
)`;

import type { SQLiteDatabase } from 'expo-sqlite';

import { searchKey } from '@/lib/search';

type Migration = string | ((db: SQLiteDatabase) => Promise<void>);

// Cada entrada leva o banco da versão i para i + 1. Nunca edite uma migração
// já aplicada: acrescente uma nova no fim da lista.
const MIGRATIONS: Migration[] = [
  `
  CREATE TABLE provider (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    logo_path TEXT
  );

  CREATE TABLE movie (
    tmdb_id INTEGER PRIMARY KEY,
    imdb_id TEXT,
    title TEXT NOT NULL,
    original_title TEXT,
    overview TEXT,
    release_date TEXT,
    year INTEGER,
    runtime INTEGER,
    original_language TEXT,
    poster_path TEXT,
    backdrop_path TEXT,
    popularity REAL,
    certification_br TEXT,
    director TEXT,
    top_cast TEXT,
    details_fetched_at TEXT
  );
  CREATE INDEX idx_movie_imdb ON movie(imdb_id);
  CREATE INDEX idx_movie_details_pending ON movie(details_fetched_at) WHERE details_fetched_at IS NULL;

  CREATE TABLE genre (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
  CREATE TABLE country (iso TEXT PRIMARY KEY, name TEXT NOT NULL);

  CREATE TABLE movie_genre (tmdb_id INTEGER, genre_id INTEGER, PRIMARY KEY (tmdb_id, genre_id));
  CREATE INDEX idx_movie_genre_genre ON movie_genre(genre_id);
  CREATE TABLE movie_country (tmdb_id INTEGER, iso TEXT, PRIMARY KEY (tmdb_id, iso));
  CREATE INDEX idx_movie_country_iso ON movie_country(iso);
  CREATE TABLE movie_provider (tmdb_id INTEGER, provider_id INTEGER, PRIMARY KEY (tmdb_id, provider_id));
  CREATE INDEX idx_movie_provider_provider ON movie_provider(provider_id);

  CREATE TABLE imdb_rating (
    imdb_id TEXT PRIMARY KEY,
    rating REAL NOT NULL,
    votes INTEGER NOT NULL
  );

  CREATE TABLE oscar_best_picture (
    imdb_id TEXT PRIMARY KEY,
    year INTEGER,
    won INTEGER NOT NULL
  );

  CREATE TABLE sync_meta (key TEXT PRIMARY KEY, value TEXT);
  `,

  // v2: busca sem acento/caixa por título pt-BR e original.
  async (db) => {
    await db.execAsync('ALTER TABLE movie ADD COLUMN search_text TEXT');
    const rows = await db.getAllAsync<{ tmdb_id: number; title: string; original_title: string | null }>(
      'SELECT tmdb_id, title, original_title FROM movie',
    );
    for (const r of rows) {
      await db.runAsync('UPDATE movie SET search_text = ? WHERE tmdb_id = ?', searchKey(r.title, r.original_title), r.tmdb_id);
    }
  },

  // v3: preferências do usuário (a sincronização nunca mexe aqui).
  `CREATE TABLE app_setting (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,

  // v4: listas do usuário (a sincronização nunca mexe aqui).
  `
  CREATE TABLE watched (tmdb_id INTEGER PRIMARY KEY, watched_at TEXT NOT NULL);
  CREATE TABLE watchlist (tmdb_id INTEGER PRIMARY KEY, added_at TEXT NOT NULL);
  `,

  // v5: várias categorias do Oscar. Melhor Filme migra; as demais vêm na próxima sync.
  `
  CREATE TABLE oscar_award (
    imdb_id TEXT NOT NULL,
    category TEXT NOT NULL,
    year INTEGER,
    won INTEGER NOT NULL,
    PRIMARY KEY (imdb_id, category)
  );
  CREATE INDEX idx_oscar_award_category ON oscar_award(category, won);
  INSERT INTO oscar_award (imdb_id, category, year, won)
    SELECT imdb_id, 'picture', year, won FROM oscar_best_picture;
  DROP TABLE oscar_best_picture;
  DELETE FROM sync_meta WHERE key = 'oscar_synced_at';
  `,
  // v6: orçamento e bilheteria (US$, como a TMDB informa). Os filmes já sincronizados
  // voltam para a fila de detalhes para preencher as colunas na próxima sync.
  `
  ALTER TABLE movie ADD COLUMN budget INTEGER;
  ALTER TABLE movie ADD COLUMN revenue INTEGER;
  UPDATE movie SET details_fetched_at = NULL;
  `,
  // v7: recomendações da TMDB ("Se gostou, veja também"). O recomendado pode não estar
  // no catálogo (nem na tabela movie); a tela filtra. Também exige rebuscar os detalhes.
  `
  CREATE TABLE movie_recommendation (
    tmdb_id INTEGER NOT NULL,
    recommended_id INTEGER NOT NULL,
    rank INTEGER NOT NULL,
    PRIMARY KEY (tmdb_id, recommended_id)
  );
  UPDATE movie SET details_fetched_at = NULL;
  `,
  // v8: movie_recommendation sem rowid (só a chave primária): ~5 MB a menos no banco e no dump.
  `
  CREATE TABLE movie_recommendation_new (
    tmdb_id INTEGER NOT NULL,
    recommended_id INTEGER NOT NULL,
    rank INTEGER NOT NULL,
    PRIMARY KEY (tmdb_id, recommended_id)
  ) WITHOUT ROWID;
  INSERT INTO movie_recommendation_new SELECT tmdb_id, recommended_id, rank FROM movie_recommendation;
  DROP TABLE movie_recommendation;
  ALTER TABLE movie_recommendation_new RENAME TO movie_recommendation;
  `,
];

export const DATABASE_NAME = 'vflix.db';

export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  await db.execAsync(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = OFF;`);
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;

  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version];
    const next = version + 1;
    await db.withExclusiveTransactionAsync(async (txn) => {
      if (typeof sql === 'string') await txn.execAsync(sql);
      else await sql(txn);
      await txn.execAsync(`PRAGMA user_version = ${next}`);
    });
    version = next;
  }
}

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

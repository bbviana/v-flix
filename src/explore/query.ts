import type { SQLiteBindValue, SQLiteDatabase } from 'expo-sqlite';

import type { PosterItem } from '@/db/queries';
import { normalize } from '@/lib/search';

import type { Filters } from './filters';

const placeholders = (n: number) => Array.from({ length: n }, () => '?').join(',');

/** Transforma os filtros em WHERE + parâmetros. Cada filtro é um AND; listas são OR internamente. */
export function buildWhere(f: Filters) {
  const where: string[] = ['EXISTS (SELECT 1 FROM movie_provider mp WHERE mp.tmdb_id = m.tmdb_id)'];
  const params: SQLiteBindValue[] = [];

  const words = normalize(f.query).split(/\s+/).filter(Boolean);
  for (const w of words) {
    where.push(`m.search_text LIKE ? ESCAPE '\\'`);
    params.push(`%${w.replace(/[\\%_]/g, '\\$&')}%`);
  }
  if (f.providers.length) {
    where.push(
      `EXISTS (SELECT 1 FROM movie_provider mp WHERE mp.tmdb_id = m.tmdb_id AND mp.provider_id IN (${placeholders(f.providers.length)}))`,
    );
    params.push(...f.providers);
  }
  if (f.genres.length) {
    where.push(
      `EXISTS (SELECT 1 FROM movie_genre mg WHERE mg.tmdb_id = m.tmdb_id AND mg.genre_id IN (${placeholders(f.genres.length)}))`,
    );
    params.push(...f.genres);
  }
  if (f.countries.length) {
    // "Contém": basta um dos países de produção estar na seleção.
    where.push(
      `EXISTS (SELECT 1 FROM movie_country mc WHERE mc.tmdb_id = m.tmdb_id AND mc.iso IN (${placeholders(f.countries.length)}))`,
    );
    params.push(...f.countries);
  }
  if (f.decades.length) {
    where.push(`(${f.decades.map(() => 'm.year BETWEEN ? AND ?').join(' OR ')})`);
    for (const d of f.decades) params.push(d, d + 9);
  }
  if (f.minRating !== null) {
    where.push('r.rating >= ?');
    params.push(f.minRating);
  }
  if (f.minVotes > 0) {
    where.push('r.votes >= ?');
    params.push(f.minVotes);
  }
  if (f.oscar === 'nominated') where.push('o.imdb_id IS NOT NULL');
  if (f.oscar === 'won') where.push('o.won = 1');

  return { where: where.join(' AND '), params };
}

const ORDER_BY: Record<Filters['sort'], string> = {
  rating: 'r.rating IS NULL, r.rating DESC, r.votes DESC',
  popularity: 'm.popularity DESC',
  year: 'm.year IS NULL, m.release_date DESC',
};

const FROM = `
  FROM movie m
  LEFT JOIN imdb_rating r ON r.imdb_id = m.imdb_id
  LEFT JOIN oscar_best_picture o ON o.imdb_id = m.imdb_id`;

export type ExploreItem = PosterItem & { rating: number | null };

export async function exploreMovies(db: SQLiteDatabase, f: Filters, limit: number, offset: number) {
  const { where, params } = buildWhere(f);
  return db.getAllAsync<ExploreItem>(
    `SELECT m.tmdb_id, m.title, m.poster_path, r.rating ${FROM}
     WHERE ${where}
     ORDER BY ${ORDER_BY[f.sort]}, m.tmdb_id
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
}

export async function exploreCount(db: SQLiteDatabase, f: Filters) {
  const { where, params } = buildWhere(f);
  const row = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n ${FROM} WHERE ${where}`, params);
  return row?.n ?? 0;
}

export type FilterOptions = {
  providers: { id: number; name: string }[];
  genres: { id: number; name: string }[];
  countries: { iso: string; name: string; count: number }[];
  decades: number[];
};

/** Opções dos filtros, só com valores que existem no catálogo. */
export async function getFilterOptions(db: SQLiteDatabase): Promise<FilterOptions> {
  const inCatalog = 'EXISTS (SELECT 1 FROM movie_provider mp WHERE mp.tmdb_id = x.tmdb_id)';
  const [providers, genres, countries, decades] = await Promise.all([
    db.getAllAsync<{ id: number; name: string }>('SELECT id, name FROM provider ORDER BY name'),
    db.getAllAsync<{ id: number; name: string }>(
      `SELECT g.id, g.name FROM genre g
       WHERE EXISTS (SELECT 1 FROM movie_genre x WHERE x.genre_id = g.id AND ${inCatalog})
       ORDER BY g.name`,
    ),
    db.getAllAsync<{ iso: string; name: string; count: number }>(
      `SELECT x.iso, COALESCE(c.name, x.iso) AS name, COUNT(*) AS count
       FROM movie_country x LEFT JOIN country c ON c.iso = x.iso
       WHERE ${inCatalog}
       GROUP BY x.iso ORDER BY count DESC`,
    ),
    db.getAllAsync<{ decade: number }>(
      `SELECT DISTINCT (x.year / 10) * 10 AS decade FROM movie x
       WHERE x.year IS NOT NULL AND ${inCatalog} ORDER BY decade DESC`,
    ),
  ]);
  return { providers, genres, countries, decades: decades.map((d) => d.decade) };
}

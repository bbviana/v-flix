import type { SQLiteBindValue, SQLiteDatabase } from 'expo-sqlite';

import type { PosterItem } from '@/db/queries';
import { visibleByCountry } from '@/db/settings';
import { moodById } from '@/lib/moods';
import { normalize } from '@/lib/search';

import type { Filters } from './filters';

const placeholders = (n: number) => Array.from({ length: n }, () => '?').join(',');

const AVAILABLE = 'EXISTS (SELECT 1 FROM movie_provider mp WHERE mp.tmdb_id = m.tmdb_id)';
const WATCHED = 'EXISTS (SELECT 1 FROM watched w WHERE w.tmdb_id = m.tmdb_id)';
const IN_LIST = 'EXISTS (SELECT 1 FROM watchlist wl WHERE wl.tmdb_id = m.tmdb_id)';

/**
 * Transforma os filtros em WHERE + parâmetros. Cada filtro é um AND; listas são OR internamente.
 * `includeHidden` ignora os países ocultos nas Configurações (para contar quantos foram ocultados).
 */
export function buildWhere(f: Filters, { includeHidden = false } = {}) {
  const where: string[] = [];
  const params: SQLiteBindValue[] = [];

  if (f.inList) {
    // A Minha lista mostra também filmes que saíram do catálogo (marcados como indisponíveis)
    // e não esconde países: o que foi posto lá é escolha explícita.
    where.push(IN_LIST);
  } else {
    where.push(AVAILABLE);
    if (!includeHidden) where.push(visibleByCountry('m'));
  }

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
  // Tags: todas as marcadas (E entre tags); cada tag vale por qualquer uma das suas palavras-chave.
  for (const id of f.moods) {
    const keywords = moodById.get(id)?.keywords;
    if (!keywords) continue;
    where.push(
      `EXISTS (SELECT 1 FROM movie_keyword mk JOIN keyword k ON k.id = mk.keyword_id
               WHERE mk.tmdb_id = m.tmdb_id AND k.name IN (${placeholders(keywords.length)}))`,
    );
    params.push(...keywords);
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
  if (f.oscar !== 'all') {
    const conds = ['oa.imdb_id = m.imdb_id'];
    if (f.oscar === 'won') conds.push('oa.won = 1');
    if (f.oscarCategories.length) {
      conds.push(`oa.category IN (${placeholders(f.oscarCategories.length)})`);
      params.push(...f.oscarCategories);
    }
    where.push(`EXISTS (SELECT 1 FROM oscar_award oa WHERE ${conds.join(' AND ')})`);
  }
  if (f.watched === 'watched') where.push(WATCHED);
  if (f.watched === 'unwatched') where.push(`NOT ${WATCHED}`);

  return { where: where.join(' AND '), params };
}

const ORDER_BY: Record<Filters['sort'], string> = {
  rating: 'r.rating IS NULL, r.rating DESC, r.votes DESC',
  popularity: 'm.popularity DESC',
  year: 'm.year IS NULL, m.release_date DESC',
  added: '(SELECT wl.added_at FROM watchlist wl WHERE wl.tmdb_id = m.tmdb_id) DESC',
};

const FROM = `
  FROM movie m
  LEFT JOIN imdb_rating r ON r.imdb_id = m.imdb_id`;

/** Melhor situação no Oscar em qualquer categoria: 1 venceu, 0 indicado, NULL nenhuma. */
const OSCAR_STATUS = '(SELECT MAX(oa.won) FROM oscar_award oa WHERE oa.imdb_id = m.imdb_id)';

export type ExploreItem = PosterItem;

export async function exploreMovies(db: SQLiteDatabase, f: Filters, limit: number, offset: number) {
  const { where, params } = buildWhere(f);
  return db.getAllAsync<ExploreItem>(
    `SELECT m.tmdb_id, m.title, m.poster_path, r.rating, ${OSCAR_STATUS} AS oscar_won,
            ${WATCHED} AS watched, ${IN_LIST} AS in_list, ${AVAILABLE} AS available ${FROM}
     WHERE ${where}
     ORDER BY ${ORDER_BY[f.sort]}, m.tmdb_id
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
}

/** "Se gostou, veja também": recomendações da TMDB que estão em algum serviço, na ordem da TMDB. */
export async function getRecommendations(db: SQLiteDatabase, tmdbId: number, limit = 20) {
  return db.getAllAsync<PosterItem>(
    `SELECT m.tmdb_id, m.title, m.poster_path, r.rating, ${OSCAR_STATUS} AS oscar_won, ${WATCHED} AS watched,
            ${IN_LIST} AS in_list
     FROM movie_recommendation rec
     JOIN movie m ON m.tmdb_id = rec.recommended_id
     LEFT JOIN imdb_rating r ON r.imdb_id = m.imdb_id
     WHERE rec.tmdb_id = ? AND ${AVAILABLE} AND ${visibleByCountry('m')}
     ORDER BY rec.rank
     LIMIT ?`,
    [tmdbId, limit],
  );
}

export async function exploreCount(db: SQLiteDatabase, f: Filters, opts?: { includeHidden?: boolean }) {
  const { where, params } = buildWhere(f, opts);
  const row = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n ${FROM} WHERE ${where}`, params);
  return row?.n ?? 0;
}

/** Quantos filmes destes filtros os países ocultos estão escondendo. */
export async function exploreHiddenCount(db: SQLiteDatabase, f: Filters, visible: number) {
  if (f.inList) return 0;
  return (await exploreCount(db, f, { includeHidden: true })) - visible;
}

export type FilterOptions = {
  providers: { id: number; name: string }[];
  genres: { id: number; name: string }[];
  countries: { iso: string; name: string; count: number }[];
  decades: number[];
};

/** Opções dos filtros, só com valores que existem no catálogo. */
export async function getFilterOptions(db: SQLiteDatabase): Promise<FilterOptions> {
  const inCatalog = `EXISTS (SELECT 1 FROM movie_provider mp WHERE mp.tmdb_id = x.tmdb_id) AND ${visibleByCountry('x')}`;
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

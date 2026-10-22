import type { SQLiteDatabase } from 'expo-sqlite';

import { MOODS } from '@/lib/moods';
import { OSCAR_CATEGORIES } from '@/lib/oscar';

export type ProviderCount = { id: number; name: string; logo_path: string | null; count: number };

export type CatalogSummary = {
  providers: ProviderCount[];
  total: number;
  withRating: number;
  oscarNominees: number;
  oscarWinners: number;
};

export async function getCatalogSummary(db: SQLiteDatabase): Promise<CatalogSummary> {
  const [providers, totals] = await Promise.all([
    db.getAllAsync<ProviderCount>(`
      SELECT p.id, p.name, p.logo_path, COUNT(mp.tmdb_id) AS count
      FROM provider p
      LEFT JOIN movie_provider mp ON mp.provider_id = p.id
      GROUP BY p.id
      ORDER BY count DESC`),
    db.getFirstAsync<{ total: number; with_rating: number; nominees: number; winners: number }>(`
      SELECT COUNT(*) AS total,
             COUNT(r.imdb_id) AS with_rating,
             COUNT(o.best) AS nominees,
             COALESCE(SUM(o.best), 0) AS winners
      FROM movie m
      LEFT JOIN imdb_rating r ON r.imdb_id = m.imdb_id
      LEFT JOIN (SELECT imdb_id, MAX(won) AS best FROM oscar_award GROUP BY imdb_id) o ON o.imdb_id = m.imdb_id
      WHERE EXISTS (SELECT 1 FROM movie_provider mp WHERE mp.tmdb_id = m.tmdb_id)`),
  ]);
  return {
    providers,
    total: totals?.total ?? 0,
    withRating: totals?.with_rating ?? 0,
    oscarNominees: totals?.nominees ?? 0,
    oscarWinners: totals?.winners ?? 0,
  };
}

export type MovieDetail = {
  tmdb_id: number;
  imdb_id: string | null;
  title: string;
  original_title: string | null;
  overview: string | null;
  year: number | null;
  runtime: number | null;
  poster_path: string | null;
  backdrop_path: string | null;
  certification_br: string | null;
  director: string | null;
  cast: string[];
  budget: number | null;
  revenue: number | null;
  rating: number | null;
  votes: number | null;
  oscars: { category: string; year: number | null; won: number }[];
  genres: string[];
  /** Tags de clima e temas (ids de MOODS), na ordem de MOODS. */
  moods: string[];
  countries: { iso: string; name: string }[];
  providers: { id: number; name: string; logo_path: string | null }[];
};

export async function getMovieDetail(db: SQLiteDatabase, tmdbId: number): Promise<MovieDetail | null> {
  const movie = await db.getFirstAsync<Omit<MovieDetail, 'cast' | 'genres' | 'moods' | 'countries' | 'providers' | 'oscars'> & { top_cast: string | null }>(
    `SELECT m.tmdb_id, m.imdb_id, m.title, m.original_title, m.overview, m.year, m.runtime,
            m.poster_path, m.backdrop_path, m.certification_br, m.director, m.top_cast,
            m.budget, m.revenue,
            r.rating, r.votes
     FROM movie m
     LEFT JOIN imdb_rating r ON r.imdb_id = m.imdb_id
     WHERE m.tmdb_id = ?`,
    tmdbId,
  );
  if (!movie) return null;

  const [genres, countries, providers, oscars, keywords] = await Promise.all([
    db.getAllAsync<{ name: string }>(
      'SELECT g.name FROM movie_genre mg JOIN genre g ON g.id = mg.genre_id WHERE mg.tmdb_id = ? ORDER BY g.name',
      tmdbId,
    ),
    db.getAllAsync<{ iso: string; name: string }>(
      `SELECT mc.iso, COALESCE(c.name, mc.iso) AS name FROM movie_country mc
       LEFT JOIN country c ON c.iso = mc.iso WHERE mc.tmdb_id = ? ORDER BY name`,
      tmdbId,
    ),
    db.getAllAsync<MovieDetail['providers'][number]>(
      `SELECT p.id, p.name, p.logo_path FROM movie_provider mp
       JOIN provider p ON p.id = mp.provider_id WHERE mp.tmdb_id = ? ORDER BY p.name`,
      tmdbId,
    ),
    movie.imdb_id
      ? db.getAllAsync<MovieDetail['oscars'][number]>(
          'SELECT category, year, won FROM oscar_award WHERE imdb_id = ?',
          movie.imdb_id,
        )
      : Promise.resolve([]),
    db.getAllAsync<{ name: string }>(
      'SELECT k.name FROM movie_keyword mk JOIN keyword k ON k.id = mk.keyword_id WHERE mk.tmdb_id = ?',
      tmdbId,
    ),
  ]);
  const keywordNames = new Set(keywords.map((k) => k.name));

  const { top_cast, ...rest } = movie;
  return {
    ...rest,
    cast: top_cast ? (JSON.parse(top_cast) as string[]) : [],
    genres: genres.map((g) => g.name),
    moods: MOODS.filter((m) => m.keywords.some((k) => keywordNames.has(k))).map((m) => m.id),
    countries,
    providers,
    // Ordem fixa das categorias (Melhor Filme primeiro).
    oscars: OSCAR_CATEGORIES.flatMap((c) => oscars.filter((o) => o.category === c.id)),
  };
}

export type PosterItem = {
  tmdb_id: number;
  title: string;
  poster_path: string | null;
  rating?: number | null;
  /** 1 = venceu, 0 = indicado, null = nenhum (Oscar de Melhor Filme) */
  oscar_won?: number | null;
  watched?: number;
  in_list?: number;
  /** 0 = saiu de todos os catálogos (só acontece na Minha lista) */
  available?: number;
};

export type CountryCount = { iso: string; name: string; count: number };

/** Países do catálogo, mais frequentes primeiro, e quantos filmes não têm país (Configurações). */
export async function getCatalogCountries(db: SQLiteDatabase) {
  const inCatalog = 'EXISTS (SELECT 1 FROM movie_provider mp WHERE mp.tmdb_id = m.tmdb_id)';
  const [countries, noCountry] = await Promise.all([
    db.getAllAsync<CountryCount>(
      `SELECT mc.iso, COALESCE(c.name, mc.iso) AS name, COUNT(*) AS count
       FROM movie_country mc
       JOIN movie m ON m.tmdb_id = mc.tmdb_id
       LEFT JOIN country c ON c.iso = mc.iso
       WHERE ${inCatalog}
       GROUP BY mc.iso ORDER BY count DESC, name`,
    ),
    db.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM movie m
       WHERE ${inCatalog} AND NOT EXISTS (SELECT 1 FROM movie_country mc WHERE mc.tmdb_id = m.tmdb_id)`,
    ),
  ]);
  return { countries, noCountry: noCountry?.n ?? 0 };
}

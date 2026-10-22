import type { SQLiteDatabase } from 'expo-sqlite';

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
             COUNT(o.imdb_id) AS nominees,
             COALESCE(SUM(o.won), 0) AS winners
      FROM movie m
      LEFT JOIN imdb_rating r ON r.imdb_id = m.imdb_id
      LEFT JOIN oscar_best_picture o ON o.imdb_id = m.imdb_id
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
  rating: number | null;
  votes: number | null;
  oscar_year: number | null;
  oscar_won: number | null;
  genres: string[];
  countries: string[];
  providers: { id: number; name: string; logo_path: string | null }[];
};

export async function getMovieDetail(db: SQLiteDatabase, tmdbId: number): Promise<MovieDetail | null> {
  const movie = await db.getFirstAsync<Omit<MovieDetail, 'cast' | 'genres' | 'countries' | 'providers'> & { top_cast: string | null }>(
    `SELECT m.tmdb_id, m.imdb_id, m.title, m.original_title, m.overview, m.year, m.runtime,
            m.poster_path, m.backdrop_path, m.certification_br, m.director, m.top_cast,
            r.rating, r.votes, o.year AS oscar_year, o.won AS oscar_won
     FROM movie m
     LEFT JOIN imdb_rating r ON r.imdb_id = m.imdb_id
     LEFT JOIN oscar_best_picture o ON o.imdb_id = m.imdb_id
     WHERE m.tmdb_id = ?`,
    tmdbId,
  );
  if (!movie) return null;

  const [genres, countries, providers] = await Promise.all([
    db.getAllAsync<{ name: string }>(
      'SELECT g.name FROM movie_genre mg JOIN genre g ON g.id = mg.genre_id WHERE mg.tmdb_id = ? ORDER BY g.name',
      tmdbId,
    ),
    db.getAllAsync<{ name: string }>(
      `SELECT COALESCE(c.name, mc.iso) AS name FROM movie_country mc
       LEFT JOIN country c ON c.iso = mc.iso WHERE mc.tmdb_id = ? ORDER BY name`,
      tmdbId,
    ),
    db.getAllAsync<MovieDetail['providers'][number]>(
      `SELECT p.id, p.name, p.logo_path FROM movie_provider mp
       JOIN provider p ON p.id = mp.provider_id WHERE mp.tmdb_id = ? ORDER BY p.name`,
      tmdbId,
    ),
  ]);

  const { top_cast, ...rest } = movie;
  return {
    ...rest,
    cast: top_cast ? (JSON.parse(top_cast) as string[]) : [],
    genres: genres.map((g) => g.name),
    countries: countries.map((c) => c.name),
    providers,
  };
}

export type PosterItem = {
  tmdb_id: number;
  title: string;
  poster_path: string | null;
  rating?: number | null;
  /** 1 = venceu, 0 = indicado, null = nenhum (Oscar de Melhor Filme) */
  oscar_won?: number | null;
};

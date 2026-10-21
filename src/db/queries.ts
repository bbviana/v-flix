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

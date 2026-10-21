import type { SQLiteDatabase } from 'expo-sqlite';

export type ProviderCount = { id: number; name: string; logo_path: string | null; count: number };

export async function getCatalogSummary(db: SQLiteDatabase) {
  const [providers, total] = await Promise.all([
    db.getAllAsync<ProviderCount>(`
      SELECT p.id, p.name, p.logo_path, COUNT(mp.tmdb_id) AS count
      FROM provider p
      LEFT JOIN movie_provider mp ON mp.provider_id = p.id
      GROUP BY p.id
      ORDER BY count DESC`),
    db.getFirstAsync<{ n: number }>('SELECT COUNT(DISTINCT tmdb_id) AS n FROM movie_provider'),
  ]);
  return { providers, total: total?.n ?? 0 };
}

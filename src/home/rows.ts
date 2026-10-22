import type { SQLiteDatabase } from 'expo-sqlite';

import type { PosterItem } from '@/db/queries';
import { getHomeGenres } from '@/db/settings';
import { DEFAULT_FILTERS, type Filters } from '@/explore/filters';
import { exploreMovies } from '@/explore/query';

const ROW_SIZE = 20;
// Ordenar por nota só faz sentido com votos suficientes; senão dominam filmes obscuros.
const WELL_RATED = { sort: 'rating', minVotes: 10_000 } as const;

export type HomeRow = { key: string; title: string; filters: Filters; movies: PosterItem[] };

/**
 * Cada fileira é um conjunto de filtros do Explorar: a mesma consulta alimenta a
 * fileira e o "Ver tudo", então os dois sempre batem.
 */
export async function loadHomeRows(db: SQLiteDatabase): Promise<HomeRow[]> {
  const [providers, genreIds, genres] = await Promise.all([
    db.getAllAsync<{ id: number; name: string }>(
      `SELECT p.id, p.name FROM provider p
       ORDER BY (SELECT COUNT(*) FROM movie_provider mp WHERE mp.provider_id = p.id) DESC`,
    ),
    getHomeGenres(db),
    db.getAllAsync<{ id: number; name: string }>('SELECT id, name FROM genre'),
  ]);
  const genreName = new Map(genres.map((g) => [g.id, g.name]));

  const defs: Omit<HomeRow, 'movies'>[] = [
    { key: 'oscar-won', title: 'Vencedores do Oscar de Melhor Filme', filters: { ...DEFAULT_FILTERS, oscar: 'won', minVotes: 0, sort: 'year' } },
    { key: 'oscar-nominated', title: 'Indicados ao Oscar', filters: { ...DEFAULT_FILTERS, oscar: 'nominated', minVotes: 0, sort: 'rating' } },
    { key: 'top', title: 'Nota IMDb 8+', filters: { ...DEFAULT_FILTERS, ...WELL_RATED, minRating: 8 } },
    ...providers.map((p) => ({
      key: `provider-${p.id}`,
      title: p.name,
      filters: { ...DEFAULT_FILTERS, ...WELL_RATED, providers: [p.id] },
    })),
    ...genreIds
      .filter((id) => genreName.has(id))
      .map((id) => ({
        key: `genre-${id}`,
        title: genreName.get(id)!,
        filters: { ...DEFAULT_FILTERS, ...WELL_RATED, genres: [id] },
      })),
  ];

  const rows = await Promise.all(
    defs.map(async (def) => ({ ...def, movies: await exploreMovies(db, def.filters, ROW_SIZE, 0) })),
  );
  return rows.filter((r) => r.movies.length > 0);
}

import type { SQLiteDatabase } from 'expo-sqlite';

import type { PosterItem } from '@/db/queries';
import { getHomeGenres, getHomeHideWatched } from '@/db/settings';
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
  const [genreIds, hideWatched, genres] = await Promise.all([
    getHomeGenres(db),
    getHomeHideWatched(db),
    db.getAllAsync<{ id: number; name: string }>('SELECT id, name FROM genre'),
  ]);
  const genreName = new Map(genres.map((g) => [g.id, g.name]));

  // Opcionalmente esconde os já vistos; o "ver tudo" herda o mesmo filtro.
  const base: Filters = { ...DEFAULT_FILTERS, watched: hideWatched ? 'unwatched' : 'all' };

  const defs: Omit<HomeRow, 'movies'>[] = [
    { key: 'watchlist', title: 'Minha lista', filters: { ...DEFAULT_FILTERS, inList: true, minVotes: 0, sort: 'added' } },
    { key: 'oscar-won', title: 'Vencedores do Oscar de Melhor Filme', filters: { ...base, oscar: 'won', oscarCategories: ['picture'], minVotes: 0, sort: 'year' } },
    { key: 'oscar-nominated', title: 'Indicados ao Oscar de Melhor Filme', filters: { ...base, oscar: 'nominated', oscarCategories: ['picture'], minVotes: 0, sort: 'rating' } },
    { key: 'oscar-international', title: 'Oscar de Filme Internacional', filters: { ...base, oscar: 'won', oscarCategories: ['international'], minVotes: 0, sort: 'year' } },
    { key: 'top', title: 'Nota IMDb 8+', filters: { ...base, ...WELL_RATED, minRating: 8 } },
    ...genreIds
      .filter((id) => genreName.has(id))
      .map((id) => ({
        key: `genre-${id}`,
        title: genreName.get(id)!,
        filters: { ...base, ...WELL_RATED, genres: [id] },
      })),
  ];

  const rows = await Promise.all(
    defs.map(async (def) => ({ ...def, movies: await exploreMovies(db, def.filters, ROW_SIZE, 0) })),
  );
  return rows.filter((r) => r.movies.length > 0);
}

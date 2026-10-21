import { HttpError, mapWithConcurrency } from '@/api/http';
import { tmdbGet, type TmdbMovieDetails } from '@/api/tmdb';
import { bulkInsert, setMeta } from '@/db/helpers';

import type { SyncStep } from './types';

const CONCURRENCY = 8;
const BATCH_SIZE = 100;
const TOP_CAST = 5;

type Fetched = { id: number; details: TmdbMovieDetails | null }; // null = 404 na TMDB

function directorOf(d: TmdbMovieDetails) {
  const names = d.credits?.crew.filter((c) => c.job === 'Director').map((c) => c.name) ?? [];
  return names.length ? [...new Set(names)].join(', ') : null;
}

function topCastOf(d: TmdbMovieDetails) {
  const cast = [...(d.credits?.cast ?? [])].sort((a, b) => a.order - b.order).slice(0, TOP_CAST);
  return cast.length ? JSON.stringify(cast.map((c) => c.name)) : null;
}

function certificationBrOf(d: TmdbMovieDetails) {
  const br = d.release_dates?.results.find((r) => r.iso_3166_1 === 'BR');
  return br?.release_dates.map((r) => r.certification.trim()).find(Boolean) ?? null;
}

async function fetchDetails(id: number, signal: AbortSignal): Promise<Fetched> {
  try {
    const details = await tmdbGet<TmdbMovieDetails>(
      `/movie/${id}`,
      { language: 'pt-BR', append_to_response: 'external_ids,credits,release_dates' },
      signal,
    );
    return { id, details };
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) return { id, details: null };
    throw err;
  }
}

export const detailsStep: SyncStep = {
  id: 'details',
  title: 'Detalhes dos filmes',
  async run({ db, signal, report }) {
    // Só filmes que estão em algum catálogo; quem saiu não precisa de detalhes agora.
    const pending = (
      await db.getAllAsync<{ tmdb_id: number }>(`
        SELECT m.tmdb_id FROM movie m
        WHERE m.details_fetched_at IS NULL
          AND EXISTS (SELECT 1 FROM movie_provider mp WHERE mp.tmdb_id = m.tmdb_id)
        ORDER BY m.popularity DESC`)
    ).map((r) => r.tmdb_id);

    const total = pending.length;
    let done = 0;
    let notFound = 0;
    report({ message: total ? `0 / ${total}` : 'Nada novo', progress: 0 });

    for (let i = 0; i < total; i += BATCH_SIZE) {
      const ids = pending.slice(i, i + BATCH_SIZE);
      const batch = await mapWithConcurrency(ids, CONCURRENCY, (id) => fetchDetails(id, signal));
      const now = new Date().toISOString();

      // Cada lote é gravado numa transação: se a sync cair, o que já foi gravado fica.
      await db.withExclusiveTransactionAsync(async (txn) => {
        const placeholders = ids.map(() => '?').join(',');
        await txn.runAsync(`DELETE FROM movie_genre WHERE tmdb_id IN (${placeholders})`, ids);
        await txn.runAsync(`DELETE FROM movie_country WHERE tmdb_id IN (${placeholders})`, ids);

        const genres: [number, number][] = [];
        const countries: [number, string][] = [];

        for (const { id, details: d } of batch) {
          if (!d) {
            notFound++;
            await txn.runAsync('UPDATE movie SET details_fetched_at = ? WHERE tmdb_id = ?', now, id);
            continue;
          }
          await txn.runAsync(
            `UPDATE movie SET
               imdb_id = ?, title = ?, original_title = ?, overview = ?, release_date = ?, year = ?,
               runtime = ?, original_language = ?, poster_path = ?, backdrop_path = ?, popularity = ?,
               certification_br = ?, director = ?, top_cast = ?, details_fetched_at = ?
             WHERE tmdb_id = ?`,
            [
              d.imdb_id || d.external_ids?.imdb_id || null,
              d.title || d.original_title,
              d.original_title,
              d.overview || null,
              d.release_date || null,
              d.release_date ? Number(d.release_date.slice(0, 4)) : null,
              d.runtime || null,
              d.original_language,
              d.poster_path,
              d.backdrop_path,
              d.popularity,
              certificationBrOf(d),
              directorOf(d),
              topCastOf(d),
              now,
              id,
            ],
          );
          for (const g of d.genres) genres.push([id, g.id]);
          for (const c of d.production_countries) countries.push([id, c.iso_3166_1]);
        }

        await bulkInsert(txn, 'movie_genre', ['tmdb_id', 'genre_id'], genres, { verb: 'INSERT OR IGNORE' });
        await bulkInsert(txn, 'movie_country', ['tmdb_id', 'iso'], countries, { verb: 'INSERT OR IGNORE' });
      });

      done += ids.length;
      report({ message: `${done} / ${total}`, progress: done / total });
    }

    const stats = await db.getFirstAsync<{ total: number; sem_imdb: number }>(`
      SELECT COUNT(*) AS total, SUM(m.imdb_id IS NULL) AS sem_imdb
      FROM movie m
      WHERE EXISTS (SELECT 1 FROM movie_provider mp WHERE mp.tmdb_id = m.tmdb_id)`);
    await setMeta(db, {
      details_synced_at: new Date().toISOString(),
      details_fetched_last_run: total,
      catalog_without_imdb_id: stats?.sem_imdb ?? 0,
    });

    const parts = [`${total} buscados`];
    if (notFound) parts.push(`${notFound} não encontrados`);
    parts.push(`${stats?.sem_imdb ?? 0} de ${stats?.total ?? 0} sem imdb_id`);
    return parts.join(' · ');
  },
};

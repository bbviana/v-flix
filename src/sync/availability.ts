import { mapWithConcurrency } from '@/api/http';
import { tmdbGet, type TmdbDiscoverMovie, type TmdbPage } from '@/api/tmdb';
import { bulkInsert, setMeta } from '@/db/helpers';
import { searchKey } from '@/lib/search';

import type { StepContext, SyncStep } from './types';

const MAX_PAGES = 500; // limite do /discover (500 páginas × 20 = 10.000 resultados)
const MAX_RESULTS = MAX_PAGES * 20;
const CONCURRENCY = 8;
const DAY_MS = 86_400_000;

type DateRange = { gte: number; lte: number }; // dias desde a época

const toIsoDate = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);
const toDay = (iso: string) => Math.floor(Date.parse(iso) / DAY_MS);

function discoverParams(providerId: number, page: number, range?: DateRange) {
  return {
    watch_region: 'BR',
    with_watch_monetization_types: 'flatrate',
    with_watch_providers: providerId,
    include_adult: false,
    language: 'pt-BR',
    // Ordem por data é estável durante a paginação (popularidade muda entre as chamadas).
    sort_by: 'primary_release_date.desc',
    page,
    'primary_release_date.gte': range ? toIsoDate(range.gte) : undefined,
    'primary_release_date.lte': range ? toIsoDate(range.lte) : undefined,
  };
}

/**
 * Coleta todos os filmes de um provedor. Se o resultado passar do limite do
 * discover, divide a faixa de datas ao meio recursivamente até cada fatia caber.
 * Observação: ao fatiar, filmes sem data de lançamento ficam de fora (são raros).
 */
async function collectProvider(
  ctx: StepContext,
  providerId: number,
  onPages: (fetched: number, total: number) => void,
): Promise<TmdbDiscoverMovie[]> {
  const movies: TmdbDiscoverMovie[] = [];
  let fetched = 0;
  let total = 0;

  async function collect(range?: DateRange) {
    const first = await tmdbGet<TmdbPage<TmdbDiscoverMovie>>(
      '/discover/movie',
      discoverParams(providerId, 1, range),
      ctx.signal,
    );

    if (first.total_results > MAX_RESULTS) {
      const r = range ?? { gte: toDay('1870-01-01'), lte: toDay(new Date().toISOString()) + 3 * 365 };
      if (r.lte > r.gte) {
        const mid = Math.floor((r.gte + r.lte) / 2);
        await collect({ gte: r.gte, lte: mid });
        await collect({ gte: mid + 1, lte: r.lte });
        return;
      }
      // Um único dia com mais de 10 mil filmes: improvável; pega o que der.
    }

    const pages = Math.min(first.total_pages, MAX_PAGES);
    total += pages;
    fetched += 1;
    movies.push(...first.results);
    onPages(fetched, total);

    const rest = Array.from({ length: Math.max(0, pages - 1) }, (_, i) => i + 2);
    await mapWithConcurrency(rest, CONCURRENCY, async (page) => {
      const res = await tmdbGet<TmdbPage<TmdbDiscoverMovie>>(
        '/discover/movie',
        discoverParams(providerId, page, range),
        ctx.signal,
      );
      movies.push(...res.results);
      fetched += 1;
      onPages(fetched, total);
    });
  }

  await collect();
  return movies;
}

export const availabilityStep: SyncStep = {
  id: 'availability',
  title: 'Disponibilidade por serviço',
  async run(ctx) {
    const { db, report } = ctx;
    const providers = await db.getAllAsync<{ id: number; name: string }>(
      'SELECT id, name FROM provider ORDER BY id',
    );
    if (providers.length === 0) throw new Error('Nenhum provedor no banco; rode a etapa anterior.');

    const movies = new Map<number, TmdbDiscoverMovie>();
    const pairs: [number, number][] = [];
    const counts: Record<string, number> = {};

    for (const [i, provider] of providers.entries()) {
      const list = await collectProvider(ctx, provider.id, (fetched, total) => {
        report({
          message: `${provider.name}: página ${fetched}/${total}`,
          progress: (i + fetched / Math.max(total, 1)) / providers.length,
        });
      });

      const ids = new Set<number>();
      for (const m of list) {
        ids.add(m.id);
        movies.set(m.id, m);
      }
      // Proteção: um provedor vazio provavelmente é falha da API, não catálogo zerado.
      if (ids.size === 0) throw new Error(`${provider.name} retornou 0 filmes; abortando para não apagar o catálogo.`);

      for (const id of ids) pairs.push([id, provider.id]);
      counts[provider.name] = ids.size;
    }

    report({ message: 'Gravando no banco…', progress: 1 });

    await db.withExclusiveTransactionAsync(async (txn) => {
      await bulkInsert(
        txn,
        'movie',
        ['tmdb_id', 'title', 'original_title', 'search_text', 'overview', 'release_date', 'year', 'original_language', 'poster_path', 'backdrop_path', 'popularity'],
        [...movies.values()].map((m) => [
          m.id,
          m.title || m.original_title,
          m.original_title,
          searchKey(m.title || m.original_title, m.original_title),
          m.overview || null,
          m.release_date || null,
          m.release_date ? Number(m.release_date.slice(0, 4)) : null,
          m.original_language,
          m.poster_path,
          m.backdrop_path,
          m.popularity,
        ]),
        // Filmes já conhecidos só atualizam a popularidade (o resto vem dos detalhes).
        { suffix: 'ON CONFLICT(tmdb_id) DO UPDATE SET popularity = excluded.popularity' },
      );

      // Substitui a disponibilidade inteira: quem saiu do catálogo some das telas.
      await txn.runAsync('DELETE FROM movie_provider');
      await bulkInsert(txn, 'movie_provider', ['tmdb_id', 'provider_id'], pairs);

      await setMeta(txn, {
        availability_synced_at: new Date().toISOString(),
        availability_total: movies.size,
        ...Object.fromEntries(Object.entries(counts).map(([name, n]) => [`availability_count:${name}`, n])),
      });
    });

    const perProvider = Object.entries(counts).map(([name, n]) => `${name}: ${n}`).join(' · ');
    return `${movies.size} filmes únicos · ${perProvider}`;
  },
};

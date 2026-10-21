import { fetchWithRetry } from '@/api/http';
import { bulkInsert, getMeta, setMeta } from '@/db/helpers';

import type { SyncStep } from './types';

const SPARQL_URL = 'https://query.wikidata.org/sparql';
// O Wikidata exige um User-Agent que identifique o cliente.
const USER_AGENT = 'v-flix/1.0 (personal non-commercial app)';
const REFRESH_DAYS = 30;

/**
 * Q102427 = Oscar de Melhor Filme (Academy Award for Best Picture).
 * P166 = prêmio recebido, P1411 = indicado a, P345 = IMDb ID, P585 = data.
 * O prêmio também é atribuído aos produtores, por isso o filtro em "tt"
 * (filmes) descarta os IDs "nm" (pessoas).
 */
const QUERY = `
SELECT ?imdb ?ano ?venceu WHERE {
  { ?f p:P166 ?st . ?st ps:P166 wd:Q102427 . BIND(true AS ?venceu) }
  UNION
  { ?f p:P1411 ?st . ?st ps:P1411 wd:Q102427 . BIND(false AS ?venceu) }
  ?f wdt:P345 ?imdb .
  FILTER(STRSTARTS(?imdb, "tt"))
  OPTIONAL { ?st pq:P585 ?d . BIND(YEAR(?d) AS ?ano) }
}`;

type Binding = { imdb: { value: string }; venceu: { value: string }; ano?: { value: string } };

/** Preenche o ano faltante com o lançamento + 1 (a cerimônia é no ano seguinte). */
const FILL_MISSING_YEARS = `
  UPDATE oscar_best_picture
  SET year = (SELECT m.year + 1 FROM movie m WHERE m.imdb_id = oscar_best_picture.imdb_id AND m.year IS NOT NULL)
  WHERE year IS NULL`;

export const oscarStep: SyncStep = {
  id: 'oscar',
  title: 'Oscar de Melhor Filme',
  async run({ db, signal, report }) {
    const meta = await getMeta(db);
    const last = meta.oscar_synced_at ? Date.parse(meta.oscar_synced_at) : 0;
    const ageDays = (Date.now() - last) / 86_400_000;
    if (ageDays < REFRESH_DAYS) {
      // Filmes podem ter ganho ano via detalhes desde a última consulta.
      await db.runAsync(FILL_MISSING_YEARS);
      return {
        skipped: true,
        message: `Atualizado há ${Math.floor(ageDays)} dia(s); próxima consulta em ${Math.ceil(REFRESH_DAYS - ageDays)}`,
      };
    }

    report({ message: 'Consultando o Wikidata…' });
    const res = await fetchWithRetry(
      `${SPARQL_URL}?query=${encodeURIComponent(QUERY)}`,
      { headers: { Accept: 'application/sparql-results+json', 'User-Agent': USER_AGENT } },
      { signal, retries: 3, baseDelayMs: 2000 },
    );
    const bindings = ((await res.json()) as { results: { bindings: Binding[] } }).results.bindings;

    // Um vencedor aparece como indicado e como vencedor: won = MAX(won).
    // Se houver mais de um ano (datas inconsistentes nas primeiras cerimônias), fica o menor.
    const byImdb = new Map<string, { won: boolean; year: number | null }>();
    for (const b of bindings) {
      const imdbId = b.imdb.value;
      const won = b.venceu.value === 'true';
      const year = b.ano ? Number(b.ano.value) : null;
      const cur = byImdb.get(imdbId) ?? { won: false, year: null };
      cur.won ||= won;
      if (year !== null && (cur.year === null || year < cur.year)) cur.year = year;
      byImdb.set(imdbId, cur);
    }

    const winners = [...byImdb.values()].filter((v) => v.won).length;
    // Proteção contra resposta parcial: hoje são ~600 indicados e ~100 vencedores.
    if (byImdb.size < 400 || winners < 80) {
      throw new Error(`Resposta do Wikidata incompleta (${byImdb.size} filmes, ${winners} vencedores)`);
    }

    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.runAsync('DELETE FROM oscar_best_picture');
      await bulkInsert(
        txn,
        'oscar_best_picture',
        ['imdb_id', 'year', 'won'],
        [...byImdb].map(([imdbId, v]) => [imdbId, v.year, v.won ? 1 : 0]),
      );
      await txn.runAsync(FILL_MISSING_YEARS);
      await setMeta(txn, {
        oscar_synced_at: new Date().toISOString(),
        oscar_nominees: byImdb.size,
        oscar_winners: winners,
      });
    });

    const inCatalog = await db.getFirstAsync<{ nominees: number; winners: number }>(`
      SELECT COUNT(*) AS nominees, COALESCE(SUM(o.won), 0) AS winners
      FROM oscar_best_picture o
      JOIN movie m ON m.imdb_id = o.imdb_id
      WHERE EXISTS (SELECT 1 FROM movie_provider mp WHERE mp.tmdb_id = m.tmdb_id)`);
    return `${byImdb.size} indicados (${winners} vencedores) · no catálogo: ${inCatalog?.nominees ?? 0} (${inCatalog?.winners ?? 0} vencedores)`;
  },
};

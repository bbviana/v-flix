import { fetchWithRetry } from '@/api/http';
import { bulkInsert, getMeta, setMeta } from '@/db/helpers';
import { OSCAR_CATEGORIES, type OscarCategory } from '@/lib/oscar';

import type { SyncStep } from './types';

const SPARQL_URL = 'https://query.wikidata.org/sparql';
// O Wikidata exige um User-Agent que identifique o cliente.
const USER_AGENT = 'v-flix/1.0 (personal non-commercial app)';
const REFRESH_DAYS = 30;

/**
 * P166 = prêmio recebido, P1411 = indicado a, P345 = IMDb ID, P585 = data,
 * P1686 = "pela obra". Quatro consultas simples (≈1 s cada), unidas no app:
 * vitórias e indicações, declaradas no próprio filme ou na pessoa (produtor,
 * roteirista) com o filme em P1686 — sem este caminho o roteiro perde vários
 * anos recentes. Só o filme é lido; nomes de pessoas não interessam.
 * Uma consulta única com UNIONs e YEAR() levava ~2 min e estourava o limite de 60 s.
 */
const ITEMS = OSCAR_CATEGORIES.map((c) => `wd:${c.wikidata}`).join(' ');
const QUERIES = (['P166', 'P1411'] as const).flatMap((prop) =>
  (['film', 'person'] as const).map((via) => ({
    won: prop === 'P166',
    sparql: `
      SELECT ?premio ?imdb ?d WHERE {
        VALUES ?premio { ${ITEMS} }
        ${via === 'film' ? '?f' : '?p'} p:${prop} ?st . ?st ps:${prop} ?premio .
        ${via === 'person' ? '?st pq:P1686 ?f .' : ''}
        ?f wdt:P345 ?imdb .
        FILTER(STRSTARTS(?imdb, "tt"))
        OPTIONAL { ?st pq:P585 ?d }
      }`,
  })),
);

type Binding = { premio: { value: string }; imdb: { value: string }; d?: { value: string } };

/**
 * Proteção contra resposta parcial: mínimos bem abaixo dos números reais
 * (out/2026: Filme 605/98, Internacional 342/71, Original 425/85, Adaptado 472/97).
 */
const MINIMUMS: Record<OscarCategory, { films: number; winners: number }> = {
  picture: { films: 400, winners: 80 },
  international: { films: 200, winners: 50 },
  original_screenplay: { films: 250, winners: 60 },
  adapted_screenplay: { films: 250, winners: 60 },
};

/** Preenche o ano faltante com o lançamento + 1 (a cerimônia é no ano seguinte). */
const FILL_MISSING_YEARS = `
  UPDATE oscar_award
  SET year = (SELECT m.year + 1 FROM movie m WHERE m.imdb_id = oscar_award.imdb_id AND m.year IS NOT NULL)
  WHERE year IS NULL`;

export const oscarStep: SyncStep = {
  id: 'oscar',
  title: 'Oscar',
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

    const results: { won: boolean; bindings: Binding[] }[] = [];
    for (const [i, q] of QUERIES.entries()) {
      report({ message: `Consultando o Wikidata (${i + 1}/${QUERIES.length})…`, progress: i / QUERIES.length });
      const res = await fetchWithRetry(
        `${SPARQL_URL}?query=${encodeURIComponent(q.sparql)}`,
        { headers: { Accept: 'application/sparql-results+json', 'User-Agent': USER_AGENT } },
        { signal, retries: 3, baseDelayMs: 2000 },
      );
      const json = (await res.json()) as { results: { bindings: Binding[] } };
      results.push({ won: q.won, bindings: json.results.bindings });
    }

    const categoryByItem = new Map(
      OSCAR_CATEGORIES.map((c) => [`http://www.wikidata.org/entity/${c.wikidata}`, c.id]),
    );

    // Consolida por (filme, categoria): um vencedor aparece como indicado e como
    // vencedor (won = MAX); com mais de um ano (datas inconsistentes), fica o menor.
    const awards = new Map<string, { imdbId: string; category: OscarCategory; won: boolean; year: number | null }>();
    for (const { won, bindings } of results) {
      for (const b of bindings) {
        const category = categoryByItem.get(b.premio.value);
        if (!category) continue;
        const imdbId = b.imdb.value;
        const key = `${imdbId}|${category}`;
        const cur = awards.get(key) ?? { imdbId, category, won: false, year: null };
        cur.won ||= won;
        const year = b.d ? Number(b.d.value.slice(0, 4)) : NaN; // "2020-02-09T00:00:00Z"
        if (Number.isFinite(year) && (cur.year === null || year < cur.year)) cur.year = year;
        awards.set(key, cur);
      }
    }

    const stats = new Map<OscarCategory, { films: number; winners: number }>();
    for (const a of awards.values()) {
      const s = stats.get(a.category) ?? { films: 0, winners: 0 };
      s.films++;
      if (a.won) s.winners++;
      stats.set(a.category, s);
    }
    for (const c of OSCAR_CATEGORIES) {
      const s = stats.get(c.id) ?? { films: 0, winners: 0 };
      if (s.films < MINIMUMS[c.id].films || s.winners < MINIMUMS[c.id].winners) {
        throw new Error(`Resposta do Wikidata incompleta para ${c.label} (${s.films} filmes, ${s.winners} vencedores)`);
      }
    }

    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.runAsync('DELETE FROM oscar_award');
      await bulkInsert(
        txn,
        'oscar_award',
        ['imdb_id', 'category', 'year', 'won'],
        [...awards.values()].map((a) => [a.imdbId, a.category, a.year, a.won ? 1 : 0]),
      );
      await txn.runAsync(FILL_MISSING_YEARS);
      await setMeta(txn, {
        oscar_synced_at: new Date().toISOString(),
        ...Object.fromEntries(
          [...stats].flatMap(([cat, s]) => [
            [`oscar_${cat}_films`, s.films],
            [`oscar_${cat}_winners`, s.winners],
          ]),
        ),
      });
    });

    const inCatalog = await db.getFirstAsync<{ films: number; winners: number }>(`
      SELECT COUNT(DISTINCT o.imdb_id) AS films,
             COUNT(DISTINCT CASE WHEN o.won = 1 THEN o.imdb_id END) AS winners
      FROM oscar_award o
      JOIN movie m ON m.imdb_id = o.imdb_id
      WHERE EXISTS (SELECT 1 FROM movie_provider mp WHERE mp.tmdb_id = m.tmdb_id)`);
    return `${awards.size} indicações em ${OSCAR_CATEGORIES.length} categorias · no catálogo: ${inCatalog?.films ?? 0} filmes (${inCatalog?.winners ?? 0} vencedores)`;
  },
};

import { Inflate } from 'pako';

import { bulkInsert, setMeta } from '@/db/helpers';

import type { SyncStep } from './types';

export const IMDB_RATINGS_URL = 'https://datasets.imdbws.com/title.ratings.tsv.gz';

/**
 * Fonte do arquivo .gz, injetada para a etapa não depender do Expo:
 * no app usa expo-file-system; no Node (scripts/dump) usa fetch.
 * Deve chamar `onChunk` com os bytes comprimidos, em ordem.
 */
export type RatingsSource = (opts: {
  signal: AbortSignal;
  onDownloadProgress: (fraction: number) => void;
  onChunk: (bytes: Uint8Array, readFraction: number) => void | Promise<void>;
}) => Promise<void>;

export type Rating = { imdbId: string; rating: number; votes: number };

const TAB = 9;
const NEWLINE = 10;
const DOT = 46;
const ZERO = 48;

/**
 * Parser incremental de `tconst\taverageRating\tnumVotes\n` trabalhando direto
 * nos bytes (o arquivo é ASCII). Não cria strings por linha: o tconst vira um
 * número (tt0111161 → 111161) e só os filmes desejados geram objetos.
 */
export function createRatingsParser(wanted: Map<number, string>, onMatch: (r: Rating) => void) {
  let field = 0; // 0 = tconst, 1 = rating, 2 = votes
  let id = 0;
  let ratingInt = 0;
  let ratingFrac = 0;
  let ratingDiv = 1;
  let afterDot = false;
  let votes = 0;
  let header = true;
  let lines = 0;

  const endLine = () => {
    if (!header) {
      const imdbId = wanted.get(id);
      if (imdbId) onMatch({ imdbId, rating: ratingInt + ratingFrac / ratingDiv, votes });
      lines++;
    }
    header = false;
    field = id = ratingInt = ratingFrac = votes = 0;
    ratingDiv = 1;
    afterDot = false;
  };

  return {
    push(bytes: Uint8Array) {
      for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i];
        if (b === NEWLINE) endLine();
        else if (b === TAB) field++;
        else if (header) continue;
        else if (field === 0) {
          if (b >= ZERO && b <= ZERO + 9) id = id * 10 + (b - ZERO); // ignora o prefixo "tt"
        } else if (field === 1) {
          if (b === DOT) afterDot = true;
          else if (afterDot) {
            ratingFrac = ratingFrac * 10 + (b - ZERO);
            ratingDiv *= 10;
          } else ratingInt = ratingInt * 10 + (b - ZERO);
        } else if (field === 2) votes = votes * 10 + (b - ZERO);
      }
    },
    /** Fecha a última linha caso o arquivo não termine com \n. */
    end() {
      if (field > 0) endLine();
      return lines;
    },
  };
}

/** imdb_id "tt0111161" → 111161 */
const imdbNumber = (imdbId: string) => Number(imdbId.slice(2));

export function createImdbRatingsStep(source: RatingsSource): SyncStep {
  return {
    id: 'imdb',
    title: 'Notas do IMDb',
    async run({ db, signal, report }) {
      const rows = await db.getAllAsync<{ imdb_id: string }>(
        `SELECT DISTINCT imdb_id FROM movie WHERE imdb_id LIKE 'tt%'`,
      );
      const wanted = new Map(rows.map((r) => [imdbNumber(r.imdb_id), r.imdb_id]));

      const matches: Rating[] = [];
      const parser = createRatingsParser(wanted, (r) => matches.push(r));
      const inflate = new Inflate();
      inflate.onData = (chunk) => parser.push(chunk);

      report({ message: 'Baixando title.ratings.tsv.gz…', progress: 0 });
      let lastReport = 0;
      await source({
        signal,
        onDownloadProgress: (f) => {
          if (Date.now() - lastReport < 250) return;
          lastReport = Date.now();
          report({ message: `Baixando… ${Math.round(f * 100)}%`, progress: f * 0.5 });
        },
        onChunk: (bytes, readFraction) => {
          signal.throwIfAborted();
          inflate.push(bytes, false);
          if (inflate.err) throw new Error(`Falha ao descompactar: ${inflate.msg}`);
          if (Date.now() - lastReport >= 250) {
            lastReport = Date.now();
            report({ message: `Processando… ${matches.length} notas encontradas`, progress: 0.5 + readFraction * 0.5 });
          }
        },
      });
      inflate.push(new Uint8Array(0), true);
      if (inflate.err) throw new Error(`Falha ao descompactar: ${inflate.msg}`);
      const lines = parser.end();

      // Proteção: um arquivo truncado não deve apagar as notas existentes.
      if (lines < 100_000) throw new Error(`Arquivo do IMDb incompleto (${lines} linhas)`);

      report({ message: 'Gravando no banco…', progress: 1 });
      await db.withExclusiveTransactionAsync(async (txn) => {
        await txn.runAsync('DELETE FROM imdb_rating');
        await bulkInsert(
          txn,
          'imdb_rating',
          ['imdb_id', 'rating', 'votes'],
          matches.map((m) => [m.imdbId, m.rating, m.votes]),
          { verb: 'INSERT OR REPLACE' },
        );
        await setMeta(txn, {
          imdb_synced_at: new Date().toISOString(),
          imdb_dataset_lines: lines,
          imdb_ratings_matched: matches.length,
        });
      });

      const missing = await db.getFirstAsync<{ n: number; total: number }>(`
        SELECT SUM(r.imdb_id IS NULL) AS n, COUNT(*) AS total
        FROM movie m LEFT JOIN imdb_rating r ON r.imdb_id = m.imdb_id
        WHERE EXISTS (SELECT 1 FROM movie_provider mp WHERE mp.tmdb_id = m.tmdb_id)`);
      return `${matches.length} notas · ${missing?.n ?? 0} de ${missing?.total ?? 0} filmes do catálogo sem nota`;
    },
  };
}

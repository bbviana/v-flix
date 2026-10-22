/// <reference types="node" />
/**
 * Gera o banco embutido no app (assets/db/vflix.db), usado na primeira instalação.
 * Roda a mesma sincronização do app, no computador. Uso: `make dump` (incremental,
 * parte do dump atual) ou `make dump-fresh` (do zero, ~10 min).
 */
import { copyFileSync, existsSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { migrateDbIfNeeded } from '@/db/migrations';
import { IMDB_RATINGS_URL, type RatingsSource } from '@/sync/imdb-ratings';
import { createSyncSteps, writeSyncSummary } from '@/sync/steps';

import { openNodeDatabase } from './node-sqlite';

const OUTPUT = join(__dirname, '..', 'assets', 'db', 'vflix.db');
// Ao lado do destino: o rename final é atômico (o /tmp pode estar em outro disco).
const WORK = `${OUTPUT}.tmp`;

const nodeRatingsSource: RatingsSource = async ({ signal, onDownloadProgress, onChunk }) => {
  const res = await fetch(IMDB_RATINGS_URL, { signal });
  if (!res.ok || !res.body) throw new Error(`IMDb respondeu ${res.status}`);
  const total = Number(res.headers.get('content-length')) || 0;
  let read = 0;
  for await (const chunk of res.body) {
    read += chunk.length;
    const fraction = total ? read / total : 0;
    onDownloadProgress(fraction);
    await onChunk(chunk, fraction);
  }
};

async function main() {
  const fresh = process.argv.includes('--fresh');
  for (const suffix of ['', '-wal', '-shm']) rmSync(WORK + suffix, { force: true });
  if (!fresh && existsSync(OUTPUT)) copyFileSync(OUTPUT, WORK);
  console.log(fresh || !existsSync(OUTPUT) ? 'Dump do zero' : 'Dump incremental (a partir do atual)');

  const { db, raw } = openNodeDatabase(WORK);
  await migrateDbIfNeeded(db);

  const signal = new AbortController().signal;
  for (const step of createSyncSteps(nodeRatingsSource)) {
    const started = Date.now();
    let lastLog = 0;
    console.log(`▸ ${step.title}`);
    const result = await step.run({
      db,
      signal,
      report: ({ message }) => {
        if (message && Date.now() - lastLog > 3000) {
          lastLog = Date.now();
          console.log(`    ${message}`);
        }
      },
    });
    const text = typeof result === 'object' ? `pulada: ${result.message}` : result || 'ok';
    console.log(`  ${text} (${((Date.now() - started) / 1000).toFixed(0)} s)`);
  }
  const summary = await writeSyncSummary(db);

  // O dump não leva nada do usuário: listas e configurações nascem vazias no celular.
  raw.exec('DELETE FROM watched; DELETE FROM watchlist; DELETE FROM app_setting;');
  // Arquivo único e compacto: sem WAL (o app reativa ao abrir) e sem páginas livres.
  raw.exec('PRAGMA journal_mode = DELETE; VACUUM;');
  raw.close();
  renameSync(WORK, OUTPUT);

  const mb = (statSync(OUTPUT).size / 1024 / 1024).toFixed(1);
  console.log(`\n${OUTPUT}: ${mb} MB · ${summary.total} filmes, ${summary.withRating} com nota`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

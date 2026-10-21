import { tmdbGet, type TmdbCountry, type TmdbGenre, type TmdbProvider } from '@/api/tmdb';
import { bulkInsert } from '@/db/helpers';

import type { SyncStep } from './types';

/**
 * Nomes aceitos para cada serviço, em ordem de preferência. A comparação é exata
 * para não pegar variantes como "Netflix Standard with Ads" ou "HBO Max Amazon Channel".
 */
const WANTED: { key: string; names: string[] }[] = [
  { key: 'netflix', names: ['Netflix'] },
  { key: 'prime', names: ['Amazon Prime Video'] },
  { key: 'disney', names: ['Disney Plus', 'Disney+'] },
  { key: 'hbo', names: ['HBO Max', 'Max'] },
];

export const providersStep: SyncStep = {
  id: 'providers',
  title: 'Provedores, gêneros e países',
  async run({ db, signal, report }) {
    report({ message: 'Buscando provedores…' });
    const [{ results: providers }, { genres }, countries] = await Promise.all([
      tmdbGet<{ results: TmdbProvider[] }>('/watch/providers/movie', { watch_region: 'BR', language: 'pt-BR' }, signal),
      tmdbGet<{ genres: TmdbGenre[] }>('/genre/movie/list', { language: 'pt-BR' }, signal),
      tmdbGet<TmdbCountry[]>('/configuration/countries', { language: 'pt-BR' }, signal),
    ]);

    const byName = new Map(providers.map((p) => [p.provider_name.toLowerCase(), p]));
    const selected: TmdbProvider[] = [];
    const missing: string[] = [];
    for (const { key, names } of WANTED) {
      const match = names.map((n) => byName.get(n.toLowerCase())).find(Boolean);
      if (match) selected.push(match);
      else missing.push(key);
    }
    if (missing.length) {
      throw new Error(`Provedores não encontrados na TMDB: ${missing.join(', ')}`);
    }

    await db.withExclusiveTransactionAsync(async (txn) => {
      // A tabela provider guarda só os 4 serviços acompanhados; trocar inteira
      // garante que um ID antigo (ex.: após rebrand) não fique para trás.
      await txn.runAsync('DELETE FROM provider');
      await bulkInsert(
        txn,
        'provider',
        ['id', 'name', 'logo_path'],
        selected.map((p) => [p.provider_id, p.provider_name, p.logo_path]),
      );
      await bulkInsert(txn, 'genre', ['id', 'name'], genres.map((g) => [g.id, g.name]), {
        verb: 'INSERT OR REPLACE',
      });
      await bulkInsert(
        txn,
        'country',
        ['iso', 'name'],
        countries.map((c) => [c.iso_3166_1, c.native_name || c.english_name]),
        { verb: 'INSERT OR REPLACE' },
      );
    });

    return `${selected.map((p) => `${p.provider_name} (${p.provider_id})`).join(', ')} · ${genres.length} gêneros`;
  },
};

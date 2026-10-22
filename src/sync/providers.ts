import { tmdbGet, type TmdbCountry, type TmdbGenre, type TmdbProvider } from '@/api/tmdb';
import { bulkInsert } from '@/db/helpers';
import { getServices } from '@/db/settings';
import { SERVICES } from '@/lib/services';

import type { SyncStep } from './types';

// Países históricos que a TMDB não traduz.
const COUNTRY_NAMES_PT: Record<string, string> = {
  SU: 'União Soviética',
  XC: 'Tchecoslováquia',
  XG: 'Alemanha Oriental',
  YU: 'Iugoslávia',
  CS: 'Sérvia e Montenegro',
  AN: 'Antilhas Holandesas',
};

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

    const chosen = new Set(await getServices(db));
    const wanted = SERVICES.filter((s) => chosen.has(s.label));
    if (wanted.length === 0) throw new Error('Nenhum serviço escolhido nas Configurações.');

    const byName = new Map(providers.map((p) => [p.provider_name.toLowerCase(), p]));
    // Grava o nome como o serviço se apresenta (label), não o nome da TMDB.
    const selected: (TmdbProvider & { label: string })[] = [];
    const missing: string[] = [];
    for (const { label, names } of wanted) {
      const match = names.map((n) => byName.get(n.toLowerCase())).find(Boolean);
      if (match) selected.push({ ...match, label });
      else missing.push(label);
    }
    // Melhor abortar do que seguir sem um serviço escolhido: a etapa seguinte
    // substitui o catálogo inteiro e os filmes dele sumiriam.
    if (missing.length) {
      throw new Error(`Provedores não encontrados na TMDB: ${missing.join(', ')}`);
    }

    await db.withExclusiveTransactionAsync(async (txn) => {
      // A tabela provider guarda só os serviços escolhidos; trocar inteira
      // garante que um ID antigo (ex.: após rebrand) não fique para trás.
      await txn.runAsync('DELETE FROM provider');
      await bulkInsert(
        txn,
        'provider',
        ['id', 'name', 'logo_path'],
        selected.map((p) => [p.provider_id, p.label, p.logo_path]),
      );
      await bulkInsert(txn, 'genre', ['id', 'name'], genres.map((g) => [g.id, g.name]), {
        verb: 'INSERT OR REPLACE',
      });
      await bulkInsert(
        txn,
        'country',
        ['iso', 'name'],
        countries.map((c) => [c.iso_3166_1, COUNTRY_NAMES_PT[c.iso_3166_1] ?? (c.native_name || c.english_name)]),
        { verb: 'INSERT OR REPLACE' },
      );
    });

    return `${selected.map((p) => `${p.label} (${p.provider_id})`).join(', ')} · ${genres.length} gêneros`;
  },
};

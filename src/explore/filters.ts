import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

export type OscarFilter = 'all' | 'nominated' | 'won';
export type SortBy = 'rating' | 'popularity' | 'year';

export type Filters = {
  query: string;
  providers: number[];
  genres: number[];
  countries: string[];
  minRating: number | null;
  minVotes: number;
  decades: number[]; // 1990 = 1990–1999
  oscar: OscarFilter;
  sort: SortBy;
};

export const DEFAULT_FILTERS: Filters = {
  query: '',
  providers: [],
  genres: [],
  countries: [],
  minRating: null,
  minVotes: 1000, // esconde filmes obscuros com poucas notas
  decades: [],
  oscar: 'all',
  sort: 'popularity',
};

type FiltersStore = Filters & {
  set: (patch: Partial<Filters>) => void;
  toggle: <K extends 'providers' | 'genres' | 'countries' | 'decades'>(key: K, value: Filters[K][number]) => void;
  /** Limpa os filtros do painel, preservando busca e ordenação. */
  reset: () => void;
};

export const useFilters = create<FiltersStore>((set) => ({
  ...DEFAULT_FILTERS,
  set: (patch) => set(patch),
  toggle: (key, value) =>
    set((state) => {
      const list = state[key] as (typeof value)[];
      return { [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] };
    }),
  reset: () =>
    set((state) => ({ ...DEFAULT_FILTERS, query: state.query, sort: state.sort })),
}));

/** Quantos filtros do painel diferem do padrão (para o indicador no botão). */
export function activeFilterCount(f: Filters) {
  return (
    (f.providers.length ? 1 : 0) +
    (f.genres.length ? 1 : 0) +
    (f.countries.length ? 1 : 0) +
    (f.decades.length ? 1 : 0) +
    (f.minRating !== null ? 1 : 0) +
    (f.minVotes !== DEFAULT_FILTERS.minVotes ? 1 : 0) +
    (f.oscar !== 'all' ? 1 : 0)
  );
}

/** Valores atuais dos filtros, com referência estável enquanto nada muda. */
export function useFilterValues(): Filters {
  return useFilters(
    useShallow((s) => ({
      query: s.query,
      providers: s.providers,
      genres: s.genres,
      countries: s.countries,
      minRating: s.minRating,
      minVotes: s.minVotes,
      decades: s.decades,
      oscar: s.oscar,
      sort: s.sort,
    })),
  );
}

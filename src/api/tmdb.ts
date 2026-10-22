import { fetchWithRetry } from './http';

const BASE_URL = 'https://api.themoviedb.org/3';
export const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

export const posterUrl = (path: string | null | undefined, size = 'w342') =>
  path ? `${TMDB_IMAGE_BASE}/${size}${path}` : undefined;

function token() {
  const t = process.env.EXPO_PUBLIC_TMDB_TOKEN;
  if (!t) throw new Error('EXPO_PUBLIC_TMDB_TOKEN não definido no .env');
  return t;
}

type Params = Record<string, string | number | boolean | undefined>;

export async function tmdbGet<T>(path: string, params: Params = {}, signal?: AbortSignal): Promise<T> {
  const query = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  const url = `${BASE_URL}${path}${query ? `?${query}` : ''}`;
  const res = await fetchWithRetry(
    url,
    { headers: { Authorization: `Bearer ${token()}`, Accept: 'application/json' } },
    { signal },
  );
  return (await res.json()) as T;
}

// --- Tipos das respostas usadas ---

export type TmdbProvider = {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
  display_priority: number;
};

export type TmdbGenre = { id: number; name: string };

export type TmdbCountry = { iso_3166_1: string; english_name: string; native_name: string };

export type TmdbDiscoverMovie = {
  id: number;
  title: string;
  original_title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  popularity: number;
  original_language: string;
  overview: string;
};

export type TmdbPage<T> = {
  page: number;
  total_pages: number;
  total_results: number;
  results: T[];
};

export type TmdbMovieDetails = {
  id: number;
  imdb_id: string | null;
  title: string;
  original_title: string;
  overview: string;
  release_date: string;
  runtime: number | null;
  original_language: string;
  poster_path: string | null;
  backdrop_path: string | null;
  popularity: number;
  budget: number;
  revenue: number;
  genres: TmdbGenre[];
  production_countries: { iso_3166_1: string; name: string }[];
  external_ids?: { imdb_id: string | null };
  credits?: {
    cast: { name: string; order: number }[];
    crew: { name: string; job: string }[];
  };
  release_dates?: {
    results: {
      iso_3166_1: string;
      release_dates: { certification: string; type: number }[];
    }[];
  };
};

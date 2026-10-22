export type OscarCategory = 'picture' | 'international' | 'original_screenplay' | 'adapted_screenplay';

/** Categorias acompanhadas, na ordem de exibição. `wikidata` = item do prêmio no Wikidata. */
export const OSCAR_CATEGORIES: { id: OscarCategory; label: string; short: string; wikidata: string }[] = [
  { id: 'picture', label: 'Melhor Filme', short: 'Filme', wikidata: 'Q102427' },
  { id: 'international', label: 'Melhor Filme Internacional', short: 'Filme Internacional', wikidata: 'Q105304' },
  { id: 'original_screenplay', label: 'Melhor Roteiro Original', short: 'Roteiro Original', wikidata: 'Q41417' },
  { id: 'adapted_screenplay', label: 'Melhor Roteiro Adaptado', short: 'Roteiro Adaptado', wikidata: 'Q107258' },
];

export const oscarLabel = (id: string) => OSCAR_CATEGORIES.find((c) => c.id === id)?.label ?? id;

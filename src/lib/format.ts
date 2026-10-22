/** 132 → "2h 12min" */
export function formatRuntime(minutes: number | null | undefined) {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? (m ? `${h}h ${m}min` : `${h}h`) : `${m}min`;
}

/** 1204073 → "1,2 mi", 36493 → "36 mil", 812 → "812" */
export function formatVotes(votes: number) {
  const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  if (votes >= 1_000_000) return `${fmt(votes / 1_000_000)} mi`;
  if (votes >= 1_000) return `${Math.round(votes / 1_000)} mil`;
  return String(votes);
}

/** 11_000_000 → "US$ 11 mi", 2_500_000 → "US$ 2,5 mi", 1_234_000_000 → "US$ 1,2 bi" */
export function formatMoney(usd: number) {
  const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: n < 10 ? 1 : 0 });
  if (usd >= 1_000_000_000) return `US$ ${fmt(usd / 1_000_000_000)} bi`;
  if (usd >= 1_000_000) return `US$ ${fmt(usd / 1_000_000)} mi`;
  return `US$ ${Math.round(usd / 1_000)} mil`;
}

/** 8.5 → "8,5", 9 → "9,0" */
export const formatRating = (rating: number) =>
  rating.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// Códigos históricos usados pela TMDB que não têm emoji de bandeira.
const NO_FLAG = new Set(['SU', 'XC', 'XG', 'YU', 'CS', 'AN', 'ZR', 'BU', 'TP', 'DD']);

/** "KR" → "🇰🇷"; null para códigos sem bandeira (ex.: União Soviética). */
export function flagEmoji(iso: string) {
  const code = iso.toUpperCase();
  if (!/^[A-Z]{2}$/.test(code) || NO_FLAG.has(code)) return null;
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

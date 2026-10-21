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

/** 8.5 → "8,5", 9 → "9,0" */
export const formatRating = (rating: number) =>
  rating.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

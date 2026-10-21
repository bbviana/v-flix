const ACCENTS: Record<string, string> = {
  á: 'a', à: 'a', â: 'a', ã: 'a', ä: 'a', å: 'a',
  é: 'e', è: 'e', ê: 'e', ë: 'e',
  í: 'i', ì: 'i', î: 'i', ï: 'i',
  ó: 'o', ò: 'o', ô: 'o', õ: 'o', ö: 'o',
  ú: 'u', ù: 'u', û: 'u', ü: 'u',
  ç: 'c', ñ: 'n', ý: 'y', ÿ: 'y',
};

/** "Coração Valente" → "coracao valente": minúsculas, sem acentos. */
export function normalize(text: string) {
  // NFD cobre qualquer acento; o mapa garante o básico se o motor não normalizar.
  return text
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\u0000-\u007f]/g, (ch) => ACCENTS[ch] ?? ch);
}

/** Texto indexado para busca: título pt-BR + original, normalizados. */
export function searchKey(title: string, originalTitle?: string | null) {
  const parts = [title];
  if (originalTitle && originalTitle !== title) parts.push(originalTitle);
  return normalize(parts.join(' | '));
}

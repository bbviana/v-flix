/**
 * Tags de clima e temas, curadas a partir das palavras-chave da TMDB (só em inglês,
 * termos livres e com ruído). Cada tag agrupa várias palavras-chave; ficaram as que
 * aparecem com frequência no catálogo (medido em out/2026). Como o mapa é aplicado
 * nas consultas, dá para ajustar as tags sem rebuscar nada.
 */
export type MoodGroup = 'clima' | 'tema';
export type Mood = { id: string; label: string; group: MoodGroup; keywords: string[] };

export const MOODS: Mood[] = [
  // Clima
  {
    id: 'divertido',
    label: 'Divertido',
    group: 'clima',
    keywords: ['amused', 'hilarious', 'playful', 'absurd', 'witty', 'lighthearted', 'joyful', 'joyous', 'exuberant', 'slapstick comedy', 'whimsical'],
  },
  {
    id: 'emocionante',
    label: 'Emocionante',
    group: 'clima',
    keywords: ['suspenseful', 'intense', 'excited', 'exhilarated', 'frantic', 'tense', 'audacious', 'bold'],
  },
  {
    id: 'inspirador',
    label: 'Inspirador',
    group: 'clima',
    keywords: ['inspirational', 'hopeful', 'admiring', 'awestruck', 'appreciative', 'enthusiastic', 'celebratory', 'powerful'],
  },
  {
    id: 'comovente',
    label: 'Comovente',
    group: 'clima',
    keywords: ['sentimental', 'compassionate', 'sympathetic', 'empathetic', 'tragic', 'melancholy', 'loss of loved one', 'grief'],
  },
  {
    id: 'aconchegante',
    label: 'Aconchegante',
    group: 'clima',
    keywords: ['comforting', 'nostalgic', 'familiar', 'cheerful', 'enchant', 'wonder', 'loving', 'adoring'],
  },
  {
    id: 'romantico',
    label: 'Romântico',
    group: 'clima',
    keywords: ['romantic', 'romcom', 'falling in love', 'forbidden love', 'love triangle', 'teenage romance'],
  },
  {
    id: 'reflexivo',
    label: 'Reflexivo',
    group: 'clima',
    keywords: ['philosophical', 'thoughtful', 'reflective', 'introspective', 'complex', 'ambiguous', 'cautionary', 'provocative'],
  },
  {
    id: 'sombrio',
    label: 'Sombrio',
    group: 'clima',
    keywords: ['dark comedy', 'neo-noir', 'macabre', 'dreary', 'depressing', 'disturbed', 'shocking', 'dark fantasy'],
  },
  {
    id: 'assustador',
    label: 'Assustador',
    group: 'clima',
    keywords: ['frightened', 'horrified', 'supernatural horror', 'psychological horror', 'survival horror', 'slasher', 'body horror', 'gore'],
  },

  // Temas
  { id: 'fatos-reais', label: 'Baseado em fatos reais', group: 'tema', keywords: ['based on true story', 'biography', 'true crime'] },
  {
    id: 'livro',
    label: 'Baseado em livro',
    group: 'tema',
    keywords: ['based on novel or book', 'based on young adult novel', "based on children's book", 'based on short story'],
  },
  { id: 'hq', label: 'Baseado em HQ e mangá', group: 'tema', keywords: ['based on comic', 'based on graphic novel', 'based on manga'] },
  { id: 'super-herois', label: 'Super-heróis', group: 'tema', keywords: ['superhero', 'super power', 'marvel cinematic universe (mcu)'] },
  { id: 'viagem-no-tempo', label: 'Viagem no tempo', group: 'tema', keywords: ['time travel', 'time loop', 'time warp'] },
  { id: 'distopia', label: 'Distopia e pós-apocalipse', group: 'tema', keywords: ['dystopia', 'post-apocalyptic future', 'apocalypse'] },
  { id: 'espaco', label: 'Espaço', group: 'tema', keywords: ['space', 'spacecraft', 'space travel', 'space opera', 'outer space', 'astronaut'] },
  { id: 'alienigenas', label: 'Alienígenas', group: 'tema', keywords: ['alien', 'alien invasion', 'extraterrestrial'] },
  { id: 'ia-robos', label: 'IA e robôs', group: 'tema', keywords: ['artificial intelligence (a.i.)', 'robot', 'android', 'cyborg'] },
  { id: 'golpes', label: 'Golpes e assaltos', group: 'tema', keywords: ['heist', 'robbery', 'bank robbery', 'con artist', 'thief'] },
  {
    id: 'espionagem',
    label: 'Espionagem',
    group: 'tema',
    keywords: ['spy', 'espionage', 'secret agent', 'central intelligence agency (cia)', 'undercover'],
  },
  { id: 'investigacao', label: 'Mistério e investigação', group: 'tema', keywords: ['murder mystery', 'whodunit', 'detective', 'investigation'] },
  { id: 'serial-killers', label: 'Serial killers', group: 'tema', keywords: ['serial killer', 'psychopath'] },
  { id: 'mafia', label: 'Máfia e gângsteres', group: 'tema', keywords: ['gangster', 'mafia', 'organized crime'] },
  { id: 'vinganca', label: 'Vingança', group: 'tema', keywords: ['revenge'] },
  { id: 'sobrevivencia', label: 'Sobrevivência', group: 'tema', keywords: ['survival', 'disaster', 'stranded'] },
  { id: 'guerra', label: 'Guerra', group: 'tema', keywords: ['world war ii', 'world war i', 'vietnam war', 'war', 'soldier', 'battle'] },
  { id: 'artes-marciais', label: 'Artes marciais', group: 'tema', keywords: ['martial arts', 'kung fu', 'hand to hand combat'] },
  { id: 'esportes', label: 'Esportes', group: 'tema', keywords: ['sports', 'basketball', 'boxing', 'football (soccer)', 'baseball'] },
  { id: 'amadurecimento', label: 'Amadurecimento', group: 'tema', keywords: ['coming of age', 'high school', 'teen movie'] },
  {
    id: 'sobrenatural',
    label: 'Fantasmas e sobrenatural',
    group: 'tema',
    keywords: ['ghost', 'supernatural', 'haunted house', 'possession', 'demon'],
  },
  { id: 'monstros', label: 'Monstros e criaturas', group: 'tema', keywords: ['monster', 'creature', 'vampire', 'werewolf', 'zombie', 'kaiju'] },
  { id: 'magia', label: 'Magia e bruxaria', group: 'tema', keywords: ['magic', 'witch', 'wizard'] },
  { id: 'contos-de-fadas', label: 'Contos de fadas', group: 'tema', keywords: ['fairy tale', 'princess', 'prince'] },
  { id: 'animais', label: 'Animais', group: 'tema', keywords: ['dog', 'cat', 'animals', 'pets', 'talking animal'] },
  { id: 'road-movie', label: 'Pé na estrada', group: 'tema', keywords: ['road trip', 'road movie'] },
  { id: 'natal', label: 'Natal', group: 'tema', keywords: ['christmas', 'santa claus'] },
  { id: 'musical', label: 'Musical', group: 'tema', keywords: ['musical'] },
  { id: 'lgbt', label: 'LGBTQIA+', group: 'tema', keywords: ['lgbt', 'gay theme', 'lesbian'] },
  { id: 'dirigido-por-mulheres', label: 'Dirigido por mulheres', group: 'tema', keywords: ['woman director'] },
];

export const moodById = new Map(MOODS.map((m) => [m.id, m]));

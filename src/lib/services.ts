/**
 * Serviços que o app sabe acompanhar. A lista da TMDB para o Brasil mistura assinaturas,
 * lojas de aluguel ("Apple TV Store", "Amazon Video") e variantes ("… Amazon Channel",
 * "… with Ads"); por isso a escolha é curada. `names` são os nomes aceitos na TMDB, em
 * ordem de preferência, comparados de forma exata; `label` é o nome comercial e a chave
 * guardada nas configurações (IDs da TMDB mudam em rebrands, como HBO Max).
 */
export type Service = { label: string; names: string[]; free?: boolean };

export const SERVICES: Service[] = [
  { label: 'Netflix', names: ['Netflix'] },
  { label: 'Prime Video', names: ['Amazon Prime Video'] },
  { label: 'Disney+', names: ['Disney Plus', 'Disney+'] },
  { label: 'HBO Max', names: ['HBO Max', 'Max'] },
  { label: 'Apple TV', names: ['Apple TV', 'Apple TV Plus', 'Apple TV+'] },
  { label: 'Paramount+', names: ['Paramount Plus', 'Paramount+'] },
  { label: 'Globoplay', names: ['Globoplay'] },
  { label: 'MUBI', names: ['MUBI'] },
  { label: 'Claro video', names: ['Claro video'] },
  { label: 'Looke', names: ['Looke'] },
  { label: 'Belas Artes à La Carte', names: ['Belas Artes à La Carte'] },
  { label: 'Reserva Imovision', names: ['Reserva Imovision'] },
  { label: 'Oldflix', names: ['Oldflix'] },
  { label: 'Pluto TV', names: ['Pluto TV'], free: true },
  { label: 'Mercado Play', names: ['Mercado Play'], free: true },
];

export const DEFAULT_SERVICES = ['Netflix', 'Prime Video', 'Disney+', 'HBO Max'];

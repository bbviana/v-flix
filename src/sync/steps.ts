import type { SQLiteDatabase } from 'expo-sqlite';

import { setMeta } from '@/db/helpers';
import { getCatalogSummary } from '@/db/queries';

import { availabilityStep } from './availability';
import { detailsStep } from './details';
import { createImdbRatingsStep, type RatingsSource } from './imdb-ratings';
import { oscarStep } from './oscar';
import { providersStep } from './providers';
import type { SyncStep } from './types';

/**
 * Etapas da sincronização, sem dependências do Expo: o app passa a fonte do IMDb
 * baseada em expo-file-system e o script do dump (scripts/dump.mts), uma baseada em fetch.
 */
export const createSyncSteps = (ratingsSource: RatingsSource): SyncStep[] => [
  providersStep,
  availabilityStep,
  detailsStep,
  createImdbRatingsStep(ratingsSource),
  oscarStep,
];

/** Data e contagens da sync concluída, mostradas na tela de Sincronização. */
export async function writeSyncSummary(db: SQLiteDatabase) {
  const summary = await getCatalogSummary(db);
  await setMeta(db, {
    last_sync_at: new Date().toISOString(),
    summary_total: summary.total,
    summary_with_rating: summary.withRating,
    summary_oscar_nominees: summary.oscarNominees,
    summary_oscar_winners: summary.oscarWinners,
  });
  return summary;
}

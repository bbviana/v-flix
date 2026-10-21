import { File, FileMode, Paths } from 'expo-file-system';

import { IMDB_RATINGS_URL, type RatingsSource } from './imdb-ratings';

const CHUNK_BYTES = 256 * 1024;

/** Baixa o .gz para o cache e o lê em pedaços, sem carregar o arquivo inteiro. */
export const expoRatingsSource: RatingsSource = async ({ signal, onDownloadProgress, onChunk }) => {
  const file = await File.downloadFileAsync(IMDB_RATINGS_URL, new File(Paths.cache, 'title.ratings.tsv.gz'), {
    idempotent: true,
    signal,
    onProgress: ({ bytesWritten, totalBytes }) => {
      if (totalBytes > 0) onDownloadProgress(bytesWritten / totalBytes);
    },
  });

  const handle = file.open(FileMode.ReadOnly);
  try {
    const size = handle.size ?? 1;
    for (;;) {
      const bytes = await handle.readBytes(CHUNK_BYTES);
      if (bytes.length === 0) break;
      await onChunk(bytes, (handle.offset ?? size) / size);
    }
  } finally {
    handle.close();
    file.delete();
  }
};

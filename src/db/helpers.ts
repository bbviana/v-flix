import type { SQLiteBindValue, SQLiteDatabase } from 'expo-sqlite';

// Bem abaixo do limite de parâmetros do SQLite (32766).
const MAX_PARAMS = 8000;

/**
 * Insere muitas linhas usando INSERT com vários VALUES por comando, para reduzir
 * as idas e voltas pela ponte nativa. `suffix` permite `ON CONFLICT ...`.
 */
export async function bulkInsert(
  db: SQLiteDatabase,
  table: string,
  columns: string[],
  rows: SQLiteBindValue[][],
  { verb = 'INSERT', suffix = '' }: { verb?: string; suffix?: string } = {},
) {
  if (rows.length === 0) return;
  const rowPlaceholder = `(${columns.map(() => '?').join(',')})`;
  const chunkSize = Math.max(1, Math.floor(MAX_PARAMS / columns.length));

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const sql =
      `${verb} INTO ${table} (${columns.join(',')}) VALUES ` +
      chunk.map(() => rowPlaceholder).join(',') +
      (suffix ? ` ${suffix}` : '');
    await db.runAsync(sql, chunk.flat());
  }
}

export async function setMeta(db: SQLiteDatabase, entries: Record<string, string | number>) {
  await bulkInsert(
    db,
    'sync_meta',
    ['key', 'value'],
    Object.entries(entries).map(([k, v]) => [k, String(v)]),
    { verb: 'INSERT OR REPLACE' },
  );
}

export async function getMeta(db: SQLiteDatabase): Promise<Record<string, string>> {
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM sync_meta');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/// <reference types="node" />
import type { SQLiteDatabase } from 'expo-sqlite';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

type Params = SQLInputValue[] | [SQLInputValue[]];

/** Aceita as duas formas do expo-sqlite: `run(sql, a, b)` e `run(sql, [a, b])`. */
const flat = (params: Params) => (params.length === 1 && Array.isArray(params[0]) ? params[0] : params) as SQLInputValue[];

/**
 * Adaptador mínimo do node:sqlite para a parte da API do expo-sqlite usada em src/sync e src/db,
 * para o dump rodar no computador com o mesmo código do app.
 */
export function openNodeDatabase(path: string) {
  const raw = new DatabaseSync(path);
  const db = {
    raw,
    async execAsync(sql: string) {
      raw.exec(sql);
    },
    async runAsync(sql: string, ...params: Params) {
      const r = raw.prepare(sql).run(...flat(params));
      return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
    },
    async getAllAsync(sql: string, ...params: Params) {
      return raw.prepare(sql).all(...flat(params));
    },
    async getFirstAsync(sql: string, ...params: Params) {
      return raw.prepare(sql).get(...flat(params)) ?? null;
    },
    async withExclusiveTransactionAsync(fn: (txn: SQLiteDatabase) => Promise<void>) {
      raw.exec('BEGIN EXCLUSIVE');
      try {
        await fn(db as unknown as SQLiteDatabase);
        raw.exec('COMMIT');
      } catch (err) {
        raw.exec('ROLLBACK');
        throw err;
      }
    },
  };
  return { db: db as unknown as SQLiteDatabase, raw };
}

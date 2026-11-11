import postgres from "postgres";
import { AsyncLocalStorage } from "node:async_hooks";
import { databaseTlsOptions } from "./tls.mjs";

const transactions = new AsyncLocalStorage<postgres.TransactionSql>();

declare global {
  var __IMOVELINK_SQL__: ReturnType<typeof postgres> | undefined;
}

export function isPostgresConfigured() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function getPostgres() {
  const transaction = transactions.getStore();
  if (transaction) return transaction;
  if (!globalThis.__IMOVELINK_SQL__) {
    const connection = process.env.DATABASE_URL?.trim();
    if (!connection || !/^postgres(?:ql)?:\/\//.test(connection)) {
      throw new Error(
        "Configure uma conexão PostgreSQL válida em DATABASE_URL.",
      );
    }
    globalThis.__IMOVELINK_SQL__ = postgres(connection, {
      ssl: databaseTlsOptions(),
      max: 3,
      prepare: false,
      connect_timeout: 10,
      idle_timeout: 20,
      transform: { ...postgres.camel, json: false },
      onnotice: () => {},
    });
  }
  return globalThis.__IMOVELINK_SQL__;
}

export async function withDatabaseTransaction<T>(
  operation: () => Promise<T>,
): Promise<T> {
  if (!isPostgresConfigured() || transactions.getStore()) return operation();
  return getPostgres().begin((sql) =>
    transactions.run(sql, operation),
  ) as Promise<T>;
}

const jsonFields = new Set([
  "branding",
  "amenities",
  "images",
  "beforeState",
  "afterState",
  "aiExtractedProfile",
  "extractionMap",
]);
const numberFields = new Set([
  "price",
  "condoFee",
  "iptu",
  "areaTotal",
  "areaBuilt",
  "budgetMin",
  "budgetMax",
]);

export function databaseRecord(record: object) {
  const sql = getPostgres();
  return Object.fromEntries(
    Object.entries(record)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [
        key,
        jsonFields.has(key) && value !== null
          ? sql.json(value as postgres.JSONValue)
          : value,
      ]),
  );
}

export function domainRecord<T>(record: Record<string, unknown>): T {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key,
      value instanceof Date
        ? value.toISOString()
        : numberFields.has(key) && value !== null
          ? Number(value)
          : value,
    ]),
  ) as T;
}

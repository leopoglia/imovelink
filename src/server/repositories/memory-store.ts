import {
  Lead,
  Property,
  PropertyAuditLog,
  Tenant,
  UserProfile,
} from "@/types/domain";
import {
  SEED_AUDIT_LOGS,
  SEED_LEADS,
  SEED_PROPERTIES,
  SEED_TENANTS,
  SEED_USERS,
} from "@/server/seeds/seed-jaragua";

export interface ImovelinkDatabase {
  tenants: Tenant[];
  users: UserProfile[];
  properties: Property[];
  auditLogs: PropertyAuditLog[];
  leads: Lead[];
}

declare global {
  // eslint-disable-next-line no-var
  var __IMOVELINK_DB__: ImovelinkDatabase | undefined;
}

/**
 * Catálogo em memória usado apenas quando DATABASE_URL não está configurada:
 * desenvolvimento sem banco e testes automatizados. Nada é gravado em disco e
 * o conteúdo é descartado ao encerrar o processo. A persistência real do
 * produto é o PostgreSQL, em src/server/database/postgres.ts.
 */
export function getDb(): ImovelinkDatabase {
  if (!globalThis.__IMOVELINK_DB__) {
    globalThis.__IMOVELINK_DB__ = {
      tenants: structuredClone(SEED_TENANTS),
      users: structuredClone(SEED_USERS),
      properties: structuredClone(SEED_PROPERTIES),
      auditLogs: structuredClone(SEED_AUDIT_LOGS),
      leads: structuredClone(SEED_LEADS),
    };
  }
  return globalThis.__IMOVELINK_DB__;
}

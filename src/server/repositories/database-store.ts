import fs from "fs";
import path from "path";
import { normalizeSnapshotIds } from "@/server/database/identifiers.mjs";
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

interface ImovelinkDatabase {
  tenants: Tenant[];
  users: UserProfile[];
  properties: Property[];
  auditLogs: PropertyAuditLog[];
  leads: Lead[];
}

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "database.json");

declare global {
  // eslint-disable-next-line no-var
  var __IMOVELINK_DB__: ImovelinkDatabase | undefined;
}

function carregarDadosIniciais(): ImovelinkDatabase {
  try {
    if (fs.existsSync(DB_FILE)) {
      const conteudo = fs.readFileSync(DB_FILE, "utf-8");
      return normalizeSnapshotIds(
        JSON.parse(conteudo),
      ) as unknown as ImovelinkDatabase;
    }
  } catch (err) {
    console.warn("Iniciando base de dados com sementes padrão.", err);
  }

  const dadosPadrao: ImovelinkDatabase = {
    tenants: structuredClone(SEED_TENANTS),
    users: structuredClone(SEED_USERS),
    properties: structuredClone(SEED_PROPERTIES),
    auditLogs: structuredClone(SEED_AUDIT_LOGS),
    leads: structuredClone(SEED_LEADS),
  };

  salvarNoDisco(dadosPadrao);
  return dadosPadrao;
}

export function salvarNoDisco(db: ImovelinkDatabase): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
  } catch (err) {
    console.error("Erro ao persistir dados no disco:", err);
  }
}

export function getDb(): ImovelinkDatabase {
  if (!globalThis.__IMOVELINK_DB__) {
    globalThis.__IMOVELINK_DB__ = carregarDadosIniciais();
  }
  return globalThis.__IMOVELINK_DB__;
}

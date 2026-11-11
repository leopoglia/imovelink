import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import postgres from "postgres";
import { databaseTlsOptions } from "../src/server/database/tls.mjs";
import { normalizeSnapshotIds } from "../src/server/database/identifiers.mjs";

const command = process.argv[2] || "check";
const connection = process.env.DATABASE_URL?.trim();
if (!connection || !/^postgres(?:ql)?:\/\//.test(connection)) {
  console.error(
    "Configure DATABASE_URL no .env.local com a conexão PostgreSQL (Connect → Session pooler). Não use a chave publishable como senha.",
  );
  process.exit(1);
}
if (!["check", "migrate", "import"].includes(command)) {
  console.error("Comando esperado: check, migrate ou import.");
  process.exit(1);
}

const sql = postgres(connection, {
  ssl: databaseTlsOptions(),
  max: 1,
  prepare: false,
  connect_timeout: 10,
  transform: { ...postgres.camel, json: false },
  onnotice: () => {},
});
const tables = [
  { key: "tenants", table: "tenants" },
  { key: "users", table: "users" },
  { key: "properties", table: "properties" },
  { key: "leads", table: "leads" },
  { key: "auditLogs", table: "property_audit_logs" },
];
let step = command;

try {
  if (command === "check") {
    const [row] =
      await sql`SELECT current_database() AS database, to_regclass('imovelink.properties') IS NOT NULL AS schema_ready`;
    console.log(
      JSON.stringify({
        connected: true,
        database: row.database,
        schemaReady: row.schemaReady,
      }),
    );
  }

  if (command === "migrate") {
    const directory = new URL("../database/migrations/", import.meta.url);
    const filenames = (await fs.readdir(directory))
      .filter((name) => /^\d+_[a-z_]+\.sql$/.test(name))
      .sort();
    await sql.begin(async (transaction) => {
      await transaction`SELECT pg_advisory_xact_lock(736421029)`;
      await transaction`CREATE SCHEMA IF NOT EXISTS imovelink`;
      await transaction`REVOKE ALL ON SCHEMA imovelink FROM PUBLIC`;
      await transaction`CREATE TABLE IF NOT EXISTS imovelink.schema_migrations (id TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
      for (const filename of filenames) {
        const id = filename.replace(/\.sql$/, "");
        const migration = await fs.readFile(
          new URL(filename, directory),
          "utf8",
        );
        const checksum = createHash("sha256").update(migration).digest("hex");
        const [previous] =
          await transaction`SELECT checksum FROM imovelink.schema_migrations WHERE id = ${id}`;
        if (previous) {
          if (previous.checksum !== checksum)
            throw Object.assign(new Error(), { code: "MIGRATION_CHANGED" });
          continue;
        }
        await transaction.unsafe(migration);
        await transaction`INSERT INTO imovelink.schema_migrations (id, checksum) VALUES (${id}, ${checksum})`;
      }
    });
    console.log(
      "Migrations conferidas e aplicadas. Dados existentes preservados.",
    );
  }

  if (command === "import") {
    const originalSnapshot = JSON.parse(
      await fs.readFile(
        new URL("../data/database.json", import.meta.url),
        "utf8",
      ),
    );
    if (!tables.every(({ key }) => Array.isArray(originalSnapshot[key])))
      throw Object.assign(new Error(), { code: "INVALID_SNAPSHOT" });
    const snapshot = normalizeSnapshotIds(originalSnapshot);
    const counts = {};
    await sql.begin(async (transaction) => {
      await transaction`LOCK TABLE imovelink.tenants, imovelink.users, imovelink.properties, imovelink.leads, imovelink.property_audit_logs IN EXCLUSIVE MODE`;
      for (const { table } of tables) {
        // Table identifiers come exclusively from the fixed list above.
        const [row] =
          await transaction`SELECT COUNT(*)::INTEGER AS count FROM ${transaction.unsafe(`imovelink.${table}`)}`;
        if (row.count !== 0)
          throw Object.assign(new Error(), { code: "DATABASE_NOT_EMPTY" });
      }
      for (const { key, table } of tables) {
        const columns =
          await transaction`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'imovelink' AND table_name = ${table}`;
        const camel = (name) =>
          name.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
        const allowed = new Set(
          columns.map((column) => camel(column.columnName)),
        );
        const json = new Set(
          columns
            .filter((column) => column.dataType === "jsonb")
            .map((column) => camel(column.columnName)),
        );
        for (let index = 0; index < snapshot[key].length; index++) {
          step = `importação de ${table}, registro ${index + 1}`;
          const row = snapshot[key][index];
          if (!row || typeof row.id !== "string")
            throw Object.assign(new Error(), { code: "INVALID_SNAPSHOT" });
          const record = Object.fromEntries(
            Object.entries(row)
              .filter(
                ([name, value]) => allowed.has(name) && value !== undefined,
              )
              .map(([name, value]) => [
                name,
                json.has(name) && value !== null
                  ? transaction.json(value)
                  : value,
              ]),
          );
          await transaction`INSERT INTO ${transaction.unsafe(`imovelink.${table}`)} ${transaction(record)}`;
        }
        counts[key] = snapshot[key].length;
      }
    });
    console.log(
      JSON.stringify({ imported: counts, sourceFileUnchanged: true }),
    );
  }
} catch (error) {
  const code =
    typeof error?.code === "string" && /^[A-Z0-9_]+$/.test(error.code)
      ? error.code
      : "DATABASE_ERROR";
  const messages = {
    DATABASE_NOT_EMPTY:
      "O banco de destino já contém dados. A importação foi cancelada sem sobrescrever registros.",
    MIGRATION_CHANGED:
      "A migration aplicada difere deste arquivo. Crie uma nova migration; a existente não foi modificada.",
    INVALID_SNAPSHOT:
      "O arquivo local não tem o formato esperado. Nenhum dado foi importado.",
    ENOTFOUND:
      "Não foi possível localizar o servidor. Confira a URI copiada em Connect → Session pooler.",
    ECONNREFUSED: "O servidor recusou a conexão. Confira o endereço e a porta.",
    CONNECT_TIMEOUT:
      "A conexão excedeu o tempo limite. Confira a URI, a rede e as restrições de acesso.",
    "28P01":
      "A autenticação do banco falhou. Confira a senha da conexão PostgreSQL no .env.local.",
    23503:
      "Há uma referência a imobiliária ou usuário inexistente no arquivo de origem. A importação foi revertida.",
    "42P01":
      "As tabelas ainda não existem. Execute npm run db:migrate primeiro.",
    UNABLE_TO_VERIFY_LEAF_SIGNATURE:
      "O certificado do servidor não pôde ser verificado. Configure a CA do banco; a validação TLS permanece ativa.",
  };
  console.error(
    `${messages[code] || "Não foi possível concluir a operação no banco."} Etapa: ${step}. Código: ${code}.`,
  );
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}

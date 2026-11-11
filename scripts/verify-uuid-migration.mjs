import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import { databaseTlsOptions } from "../src/server/database/tls.mjs";
import {
  legacyUuid,
  normalizeSnapshotIds,
} from "../src/server/database/identifiers.mjs";

const sql = postgres(process.env.DATABASE_URL, {
  ssl: databaseTlsOptions(),
  max: 1,
  prepare: false,
  connect_timeout: 10,
  transform: { ...postgres.camel, json: false },
  onnotice: () => {},
});
const tableNames = {
  tenants: "tenants",
  users: "users",
  properties: "properties",
  leads: "leads",
  auditLogs: "property_audit_logs",
  credentials: "user_credentials",
  sessions: "auth_sessions",
  attempts: "auth_attempts",
};
function canonical(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}
async function snapshot(client) {
  const result = {};
  for (const [key, table] of Object.entries(tableNames))
    result[key] = [
      ...(await client`SELECT * FROM ${client.unsafe(`imovelink.${table}`)}`),
    ];
  return result;
}
function fingerprint(snapshot) {
  return Object.fromEntries(
    Object.entries(snapshot).map(([key, rows]) => [
      key,
      {
        count: rows.length,
        hash: createHash("sha256")
          .update(
            JSON.stringify(
              rows.map((row) => JSON.stringify(canonical(row))).sort(),
            ),
          )
          .digest("hex"),
      },
    ]),
  );
}
function expectedSnapshot(snapshot) {
  const result = normalizeSnapshotIds(snapshot);
  for (const key of ["credentials", "sessions"])
    for (const row of result[key]) row.userId = legacyUuid("users", row.userId);
  return result;
}
try {
  const original = fingerprint(await snapshot(sql));
  if (process.argv.includes("--fingerprint")) {
    console.log(
      JSON.stringify(fingerprint(expectedSnapshot(await snapshot(sql)))),
    );
  } else if (process.argv.includes("--preview-tenant-ids")) {
    const migration = await readFile(
      new URL(
        "../database/migrations/004_replace_demo_tenant_ids.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const sentinel = new Error("ROLLBACK_TENANT_PREVIEW");
    try {
      await sql.begin(async (tx) => {
        const [user] =
          await tx`SELECT id, tenant_id FROM imovelink.users LIMIT 1`;
        if (user) {
          const state = {
            tenantId: user.tenantId,
            id: randomUUID(),
            title: "Preserve snapshot",
            price: 123,
          };
          await tx`INSERT INTO imovelink.property_audit_logs (id, tenant_id, property_id, property_code, property_title, user_id, user_name, user_role, action, summary, before_state, after_state)
            VALUES (${randomUUID()}, ${user.tenantId}, ${state.id}, 'PREVIEW', 'Preview', ${user.id}, 'Preview', 'BROKER', 'EDITED', 'Preview', ${tx.json(state)}, ${tx.json(state)})`;
        }
        const expected = fingerprint(expectedSnapshot(await snapshot(tx)));
        await tx.unsafe(migration);
        assert.deepEqual(
          fingerprint(await snapshot(tx)),
          expected,
          "only the two tenant IDs and their references change",
        );
        const invalid =
          await tx`SELECT conname FROM pg_constraint WHERE connamespace = 'imovelink'::regnamespace AND contype = 'f' AND NOT convalidated`;
        assert.equal(invalid.length, 0);
        throw sentinel;
      });
    } catch (error) {
      if (error !== sentinel) throw error;
    }
    assert.deepEqual(
      fingerprint(await snapshot(sql)),
      original,
      "preview rollback restores all data",
    );
    console.log(
      JSON.stringify({
        tenantPreviewPassed: true,
        contentAndRelationshipsPreserved: true,
        auditSnapshotsVerified: true,
        previewRolledBack: true,
      }),
    );
  } else if (
    (
      await sql`SELECT data_type FROM information_schema.columns WHERE table_schema = 'imovelink' AND table_name = 'users' AND column_name = 'id'`
    )[0]?.dataType === "uuid"
  ) {
    const columns =
      await sql`SELECT data_type FROM information_schema.columns WHERE table_schema = 'imovelink' AND table_name <> 'schema_migrations' AND (column_name = 'id' OR column_name LIKE '%_id')`;
    assert.equal(columns.length, 15);
    assert.ok(columns.every((column) => column.dataType === "uuid"));
    const invalid =
      await sql`SELECT conname FROM pg_constraint WHERE connamespace = 'imovelink'::regnamespace AND contype = 'f' AND NOT convalidated`;
    assert.equal(invalid.length, 0);
    console.log(
      JSON.stringify({
        alreadyApplied: true,
        allFifteenIdentityColumnsUuid: true,
        allForeignKeysValidated: true,
        noDataChanged: true,
      }),
    );
  } else {
    const migration = await readFile(
      new URL(
        "../database/migrations/003_uuid_identifiers.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const sentinel = new Error("ROLLBACK_VERIFIED_PREVIEW");
    let verified = false;
    try {
      await sql.begin(async (tx) => {
        const [tenant] = await tx`SELECT id FROM imovelink.tenants LIMIT 1`;
        const legacyUser = `preview-user-${randomUUID()}`;
        const orphan = `deleted-property-${randomUUID()}`;
        await tx`INSERT INTO imovelink.users (id, tenant_id, name, email, role) VALUES (${legacyUser}, ${tenant.id}, 'Migration preview', ${`${legacyUser}@example.invalid`}, 'BROKER')`;
        await tx`INSERT INTO imovelink.user_credentials (user_id, password_hash) VALUES (${legacyUser}, 'preview-only-never-valid')`;
        await tx`INSERT INTO imovelink.auth_sessions (token_hash, user_id, kind, expires_at) VALUES ('uuid-preview-remember', ${legacyUser}, 'REMEMBER', NOW() + INTERVAL '1 day')`;
        await tx`INSERT INTO imovelink.auth_sessions (token_hash, user_id, kind, parent_hash, expires_at) VALUES ('uuid-preview-session', ${legacyUser}, 'SESSION', 'uuid-preview-remember', NOW() + INTERVAL '1 hour')`;
        const state = {
          id: orphan,
          tenantId: tenant.id,
          brokerId: legacyUser,
          title: "Preserve this content",
          price: 123,
        };
        await tx`INSERT INTO imovelink.property_audit_logs (id, tenant_id, property_id, property_code, property_title, user_id, user_name, user_role, action, summary, before_state)
          VALUES (${`preview-audit-${randomUUID()}`}, ${tenant.id}, ${orphan}, 'PREVIEW', 'Preview', ${legacyUser}, 'Migration preview', 'BROKER', 'DELETED', 'Preview', ${tx.json(state)})`;
        const expected = fingerprint(expectedSnapshot(await snapshot(tx)));
        await tx.unsafe(migration);
        await tx.unsafe(
          await readFile(
            new URL(
              "../database/migrations/004_replace_demo_tenant_ids.sql",
              import.meta.url,
            ),
            "utf8",
          ),
        );
        assert.deepEqual(
          fingerprint(await snapshot(tx)),
          expected,
          "records preserved after identifier conversion",
        );
        const columns =
          await tx`SELECT data_type FROM information_schema.columns WHERE table_schema = 'imovelink' AND table_name <> 'schema_migrations' AND (column_name = 'id' OR column_name LIKE '%_id')`;
        assert.equal(columns.length, 15);
        assert.ok(columns.every((column) => column.dataType === "uuid"));
        const invalid =
          await tx`SELECT conname FROM pg_constraint WHERE connamespace = 'imovelink'::regnamespace AND contype = 'f' AND NOT convalidated`;
        assert.equal(invalid.length, 0);
        for (const value of [
          legacyUser,
          orphan,
          "legacy-çã",
          tenant.id.toUpperCase(),
        ]) {
          const [row] =
            await tx`SELECT pg_temp.imovelink_uuid('users', ${value})::TEXT AS id`;
          assert.equal(row.id, legacyUuid("users", value));
        }
        verified = true;
        throw sentinel;
      });
    } catch (error) {
      if (error !== sentinel) throw error;
    }
    assert.equal(verified, true);
    assert.deepEqual(
      fingerprint(await snapshot(sql)),
      original,
      "preview rollback restores original database",
    );
    console.log(
      JSON.stringify({
        previewPassed: true,
        allFifteenIdentityColumnsUuid: true,
        relationshipsAndContentPreserved: true,
        credentialsSessionsAndDeletedPropertyAuditPreserved: true,
        previewRolledBack: true,
      }),
    );
  }
} catch (error) {
  console.error("UUID verification failed:", error.code || error.message);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}

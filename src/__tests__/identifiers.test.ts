import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  legacyUuid,
  normalizeSnapshotIds,
  DEMO_TENANT_REPLACEMENTS,
} from "@/server/database/identifiers.mjs";
import {
  SEED_USERS,
  SEED_PROPERTIES,
  SEED_TENANTS,
  SEED_LEADS,
  SEED_AUDIT_LOGS,
} from "@/server/seeds/seed-jaragua";

describe("Identificadores UUID", () => {
  it("usa os mesmos UUIDs aleatórios da migration para substituir as imobiliárias de demonstração", () => {
    const migration = readFileSync(
      "database/migrations/004_replace_demo_tenant_ids.sql",
      "utf8",
    );
    for (const [oldId, newId] of Object.entries(DEMO_TENANT_REPLACEMENTS)) {
      expect(migration).toContain(`('${oldId}', '${newId}')`);
      expect(newId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(legacyUuid("tenants", oldId)).toBe(newId);
      expect(legacyUuid("tenants", newId)).toBe(newId);
    }
  });
  it("mantém UUIDs existentes e converte IDs legados de modo determinístico por entidade", () => {
    const existing = "70FA03E2-9D17-4017-B822-55FEC72AF326";
    expect(legacyUuid("users", existing)).toBe(existing.toLowerCase());
    const id = legacyUuid("users", "legacy-user");
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(legacyUuid("users", "legacy-user")).toBe(id);
    expect(legacyUuid("properties", "legacy-user")).not.toBe(id);
    expect(() => legacyUuid("users", "")).toThrow();
  });
  it("normaliza uma cópia e mantém referências e snapshots de auditoria", () => {
    const input = {
      users: [{ id: "old-user", tenantId: "old-tenant", name: "Keep me" }],
      auditLogs: [
        {
          id: "old-audit",
          tenantId: "old-tenant",
          userId: "old-user",
          propertyId: "deleted",
          beforeState: {
            id: "deleted",
            brokerId: "old-user",
            tenantId: "old-tenant",
            price: 123,
          },
        },
      ],
    };
    const result = normalizeSnapshotIds(input);
    expect(input.users[0].id).toBe("old-user");
    expect(result.users[0].name).toBe("Keep me");
    expect(result.auditLogs[0].userId).toBe(result.users[0].id);
    expect(result.auditLogs[0].beforeState.brokerId).toBe(result.users[0].id);
    expect(result.auditLogs[0].beforeState.id).toBe(
      result.auditLogs[0].propertyId,
    );
    expect(result.auditLogs[0].beforeState.price).toBe(123);
    expect(normalizeSnapshotIds(result)).toEqual(result);
  });
  it("fornece dados de demonstração válidos e vínculos coerentes", () => {
    const source = {
      tenants: SEED_TENANTS,
      users: SEED_USERS,
      properties: SEED_PROPERTIES,
      leads: SEED_LEADS,
      auditLogs: SEED_AUDIT_LOGS,
    };
    expect(normalizeSnapshotIds(source)).toEqual(source);
    for (const rows of Object.values(source))
      for (const row of rows) expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
    for (const property of SEED_PROPERTIES)
      expect(
        SEED_USERS.some(
          (u) => u.id === property.brokerId && u.tenantId === property.tenantId,
        ),
      ).toBe(true);
  });
});

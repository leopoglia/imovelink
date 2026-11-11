import { beforeEach, describe, expect, it, vi } from "vitest";
import { propertyService } from "@/server/services/property.service";
import { getDb } from "@/server/repositories/database-store";
import {
  SEED_TENANTS,
  SEED_USERS,
  SEED_PROPERTIES,
  SEED_LEADS,
  SEED_AUDIT_LOGS,
} from "@/server/seeds/seed-jaragua";
import { hasPermission } from "@/lib/auth/rbac";

const TENANT_ID = SEED_TENANTS[0].id;
vi.mock("@/server/repositories/database-store", () => ({
  getDb: vi.fn(),
  salvarNoDisco: vi.fn(),
}));

describe("RBAC e Auditoria de Imóveis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDb).mockReturnValue(
      structuredClone({
        tenants: SEED_TENANTS,
        users: SEED_USERS,
        properties: SEED_PROPERTIES,
        leads: SEED_LEADS,
        auditLogs: SEED_AUDIT_LOGS,
      }),
    );
  });

  it("deve validar permissões de acordo com o papel do usuário (Corretor vs Gestor)", async () => {
    expect(hasPermission("BROKER", "properties:create")).toBe(true);
    expect(hasPermission("BROKER", "properties:delete")).toBe(false);

    expect(hasPermission("AGENCY_ADMIN", "properties:delete")).toBe(true);
    expect(hasPermission("AGENCY_ADMIN", "whitelabel:configure")).toBe(true);
  });

  it("deve cadastrar imóvel e registrar no log de auditoria", async () => {
    const novo = await propertyService.createProperty({
      tenantId: TENANT_ID,
      userId: SEED_USERS[1].id,
      userName: "Marina Becker",
      userRole: "BROKER",
      title: "Casa Jardim na Vila Nova",
      description: "Casa aconchegante com quintal.",
      type: "HOUSE",
      purpose: "SALE",
      price: 880000,
      bedrooms: 3,
      suites: 2,
      bathrooms: 3,
      parkingSpots: 2,
      areaTotal: 380,
      areaBuilt: 210,
      addressStreet: "Rua 25 de Julho, 500",
      addressNeighborhood: "Vila Nova",
      amenities: ["quintal arborizado"],
    });

    expect(novo.code).toBe("IMV-107");
    const logs = await propertyService.listAuditLogs(TENANT_ID, novo.id);
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0].action).toBe("CREATED");
  });

  it("deve registrar antes e depois quando o preço é alterado", async () => {
    const targetId = SEED_PROPERTIES[0].id;
    const atualizado = await propertyService.updateProperty({
      tenantId: TENANT_ID,
      propertyId: targetId,
      userId: SEED_USERS[0].id,
      userName: "Leonardo Heitor Poglia",
      userRole: "AGENCY_ADMIN",
      updates: { price: 895000 },
    });

    expect(atualizado.price).toBe(895000);
    const logs = await propertyService.listAuditLogs(TENANT_ID, targetId);
    expect(logs[0].action).toBe("PRICE_UPDATED");
    expect(logs[0].beforeState?.price).toBe(920000);
    expect(logs[0].afterState?.price).toBe(895000);
  });
});

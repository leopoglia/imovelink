import { beforeEach, describe, expect, it, vi } from "vitest";
import { leadQualificationService } from "@/server/services/lead-qualification.service";
import { getDb } from "@/server/repositories/database-store";
import {
  SEED_TENANTS,
  SEED_USERS,
  SEED_PROPERTIES,
  SEED_LEADS,
  SEED_AUDIT_LOGS,
} from "@/server/seeds/seed-jaragua";

vi.mock("@/server/repositories/database-store", () => ({
  getDb: vi.fn(),
  salvarNoDisco: vi.fn(),
}));

const TENANT_ID = SEED_TENANTS[0].id;

describe("Captação e qualificação de contatos da vitrine", () => {
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

  it("deve qualificar um novo lead com desejo de compra claro como HOT e vincular imóveis compatíveis do estoque", async () => {
    const created = await leadQualificationService.createAndQualifyLead({
      tenantId: TENANT_ID,
      assignedBrokerId: SEED_USERS[0].id,
      assignedBrokerName: "Leonardo Heitor Poglia",
      name: "Dra. Helena Borgmann",
      email: "helena@borgmann.med.br",
      phone: "(47) 99944-1122",
      originChannel: "PORTAL_B2B",
      naturalSearchDesire:
        "Urgente: procuro apartamento no Czerniewicz com 3 quartos, varanda gourmet com churrasqueira e portaria 24h até 800 mil para mudar logo com meu marido.",
    });

    expect(created.lead.aiScore).toBeGreaterThanOrEqual(82);
    expect(created.lead.aiTemperature).toBe("HOT");
    expect(created.lead.aiExtractedProfile.urgencyLevel).toBe("IMMEDIATE");
    expect(created.lead.aiExtractedProfile.decisionMaker).toContain("Família");
    // Do not fill the recommendations with properties outside the requested criteria.
    expect(created.matchedProperties).toHaveLength(1);
    expect(
      created.matchedProperties.every(
        ({ property }) =>
          property.type === "APARTMENT" &&
          property.price <= 800000 &&
          property.bedrooms >= 3,
      ),
    ).toBe(true);
    expect(created.matchedProperties[0].property.code).toBe("IMV-102");
    expect(created.lead.aiExtractedProfile.recommendedWhatsAppPitch).toContain(
      "IMV-102",
    );
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { leadQualificationService } from "@/server/services/lead-qualification.service";
import { aiSearchService } from "@/server/services/ai-search.service";
import { getDb } from "@/server/repositories/memory-store";
import { geminiConfigured } from "@/server/services/gemini.mjs";
import { interpretPropertyQuery } from "@/server/services/property-query-ai";
import {
  SEED_AUDIT_LOGS,
  SEED_LEADS,
  SEED_PROPERTIES,
  SEED_TENANTS,
  SEED_USERS,
} from "@/server/seeds/seed-jaragua";
import type { StructuredPropertyQuery } from "@/types/domain";

vi.mock("@/server/repositories/memory-store", () => ({ getDb: vi.fn() }));
vi.mock("@/server/services/gemini.mjs", () => ({ geminiConfigured: vi.fn() }));
vi.mock("@/server/services/property-query-ai", () => ({
  interpretPropertyQuery: vi.fn(),
}));

const TENANT_ID = SEED_TENANTS[0].id;
const PEDIDO = "Quero um lugar bom para a família, perto do trabalho.";

/** O que a IA entendeu de um pedido que as regras locais não conseguem ler. */
const criteriosDaIA: StructuredPropertyQuery = {
  rawQuery: PEDIDO,
  intentSummary: "apartamento familiar no Czerniewicz",
  propertyTypes: ["APARTMENT"],
  maxPrice: 800000,
  minBedrooms: 3,
  neighborhoods: ["Czerniewicz"],
  mustHaveAmenities: [],
  semanticKeywords: [],
  aiModelUsed: "gemini",
};

const novoContato = () =>
  leadQualificationService.createAndQualifyLead({
    tenantId: TENANT_ID,
    assignedBrokerId: SEED_USERS[0].id,
    assignedBrokerName: SEED_USERS[0].name,
    name: "Marta Reinert",
    email: "marta@example.com",
    phone: "(47) 99111-2233",
    originChannel: "PORTAL_B2B",
    naturalSearchDesire: PEDIDO,
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getDb).mockReturnValue(
    structuredClone({
      tenants: SEED_TENANTS,
      users: SEED_USERS,
      properties: SEED_PROPERTIES,
      leads: SEED_LEADS,
      auditLogs: SEED_AUDIT_LOGS,
      externalSources: [],
      externalListings: [],
    }),
  );
  vi.mocked(geminiConfigured).mockReturnValue(true);
  vi.mocked(interpretPropertyQuery).mockResolvedValue(criteriosDaIA);
});

describe("Qualificação de contatos com IA", () => {
  it("usa os critérios extraídos pela IA para pontuar e sugerir imóveis", async () => {
    const { lead, matchedProperties } = await novoContato();

    expect(lead.aiExtractedProfile.scoringRationale).toContain(
      "Pedido interpretado por IA",
    );
    expect(lead.aiExtractedProfile.preferredNeighborhoods).toEqual([
      "Czerniewicz",
    ]);
    expect(lead.aiExtractedProfile.preferredTypes).toEqual(["APARTMENT"]);
    expect(lead.budgetMax).toBe(800000);
    expect(matchedProperties.length).toBeGreaterThan(0);
    expect(
      matchedProperties.every(
        ({ property }) =>
          property.type === "APARTMENT" && property.price <= 800000,
      ),
    ).toBe(true);
  });

  it("envia à IA apenas o texto do pedido, sem nome nem telefone", async () => {
    await novoContato();
    expect(interpretPropertyQuery).toHaveBeenCalledOnce();
    const [texto] = vi.mocked(interpretPropertyQuery).mock.calls[0];
    expect(texto).toBe(PEDIDO);
    expect(texto).not.toContain("Marta");
    expect(texto).not.toContain("99111");
  });

  it("registra o contato pelas regras locais quando a IA falha", async () => {
    vi.mocked(interpretPropertyQuery).mockRejectedValue(
      new Error("provedor indisponível"),
    );
    const { lead } = await novoContato();

    expect(lead.id).toBeTruthy();
    expect(lead.stage).toBe("NEW");
    expect(lead.aiExtractedProfile.scoringRationale).not.toContain(
      "Pedido interpretado por IA",
    );
  });

  it("registra o contato pelas regras locais quando a IA estoura o prazo", async () => {
    const buscaComIA = vi
      .spyOn(aiSearchService, "searchWithAI")
      .mockRejectedValue(new DOMException("prazo esgotado", "TimeoutError"));
    const { lead, matchedProperties } = await novoContato();

    expect(buscaComIA.mock.calls[0][3]).toBeInstanceOf(AbortSignal);
    expect(lead.id).toBeTruthy();
    expect(Array.isArray(matchedProperties)).toBe(true);
    expect(lead.aiExtractedProfile.scoringRationale).not.toContain(
      "Pedido interpretado por IA",
    );
    buscaComIA.mockRestore();
  });

  it("não chama a IA quando ela não está configurada", async () => {
    vi.mocked(geminiConfigured).mockReturnValue(false);
    const { lead } = await novoContato();

    expect(interpretPropertyQuery).not.toHaveBeenCalled();
    expect(lead.aiExtractedProfile.scoringRationale).not.toContain(
      "Pedido interpretado por IA",
    );
  });
});

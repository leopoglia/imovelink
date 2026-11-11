import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aiSearchService } from "@/server/services/ai-search.service";
import { propertyRepository } from "@/server/repositories/property.repository";
import { SEED_PROPERTIES, SEED_TENANTS } from "@/server/seeds/seed-jaragua";
import { calcularDistanciaKm } from "@/lib/geo";

const TENANT_ID = SEED_TENANTS[0].id;
vi.mock("@/server/repositories/property.repository", () => ({
  propertyRepository: { findAllByTenant: vi.fn() },
}));

describe("Lugares que só existem no acervo externo", () => {
  it("reconhece a cidade de um anúncio externo quando informada", () => {
    const semExtras = aiSearchService.extractStructuredQuery("imovel em Corupa");
    expect(semExtras.neighborhoods).toEqual([]);
    const comExtras = aiSearchService.extractStructuredQuery(
      "imovel em Corupa",
      [],
      ["Corupa", "Guaramirim"],
    );
    expect(comExtras.neighborhoods).toEqual(["Corupa"]);
  });

  it("não inventa lugar que não foi citado na frase", () => {
    const q = aiSearchService.extractStructuredQuery(
      "casa com piscina",
      [],
      ["Corupa", "Guaramirim"],
    );
    expect(q.neighborhoods).toEqual([]);
  });
});

describe("Busca Inteligente por Compatibilidade de Imóveis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("GOOGLE_API_KEY", "");
    vi.stubEnv("GEMINI_MODEL", "");
    vi.mocked(propertyRepository.findAllByTenant).mockImplementation(
      async (tenantId) =>
        structuredClone(
          SEED_PROPERTIES.filter((property) => property.tenantId === tenantId),
        ),
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("deve extrair os filtros corretos a partir do texto digitado pelo corretor", async () => {
    const busca =
      "Procuro casa com quintal arborizado e piscina na região central ou Vila Nova até 950 mil com 3 quartos";
    const filtros = aiSearchService.extractStructuredQuery(busca);

    expect(filtros.propertyTypes).toContain("HOUSE");
    expect(filtros.maxPrice).toBe(950000);
    expect(filtros.minBedrooms).toBe(3);
    expect(filtros.neighborhoods).toContain("Centro");
    expect(filtros.neighborhoods).toContain("Vila Nova");
    expect(filtros.mustHaveAmenities).toContain("quintal arborizado");
    expect(filtros.mustHaveAmenities).toContain("piscina");
  });

  it("deve calcular a distância geográfica entre bairros de Jaraguá do Sul usando Haversine", async () => {
    // Centro (-26.4851, -49.0713) até Vila Nova (-26.4792, -49.0846)
    const distancia = calcularDistanciaKm(
      -26.4851,
      -49.0713,
      -26.4792,
      -49.0846,
    );
    expect(distancia).toBeGreaterThan(1.0);
    expect(distancia).toBeLessThan(2.5);
  });

  it("deve ranquear no topo os imóveis mais compatíveis com o desejo do cliente", async () => {
    const resposta = await aiSearchService.searchHybrid(
      TENANT_ID,
      "casa com quintal arborizado e piscina na Vila Nova até 950 mil",
      true,
    );

    expect(resposta.results.length).toBeGreaterThan(0);
    const topImovel = resposta.results[0];
    expect(topImovel.property.code).toBe("IMV-101");
    expect(topImovel.hybridScore).toBeGreaterThanOrEqual(75);
  });

  it("entende valores completos, intervalos, vagas e suítes sem confundir quartos com preço", async () => {
    const full = aiSearchService.extractStructuredQuery(
      "Casa até R$ 950.000,00 com 3 quartos, 2 vagas e 1 suíte",
    );
    expect(full).toMatchObject({
      maxPrice: 950000,
      minBedrooms: 3,
      minParkingSpots: 2,
      minSuites: 1,
    });
    expect(
      aiSearchService.extractStructuredQuery("Entre 500 e 950 mil").minPrice,
    ).toBe(500000);
    expect(
      aiSearchService.extractStructuredQuery("Casa até 1,2 milhão").maxPrice,
    ).toBe(1200000);
    expect(
      aiSearchService.extractStructuredQuery("Apartamento com 3 quartos")
        .maxPrice,
    ).toBeUndefined();
    expect(
      aiSearchService.extractStructuredQuery("Casa com área verde")
        .propertyTypes,
    ).not.toContain("LAND");
  });

  it("respeita orçamento, tipo, número de quartos e bairro sem sugerir imóveis fora dos critérios", async () => {
    const response = await aiSearchService.searchHybrid(
      TENANT_ID,
      "Casa até 950 mil com 3 quartos no Centro",
      true,
    );
    expect(response.results.map(({ property }) => property.code)).toEqual([
      "IMV-103",
    ]);
    expect(
      (await aiSearchService.searchHybrid(TENANT_ID, "Casa até 100 mil", true))
        .results,
    ).toEqual([]);
    expect(
      (
        await aiSearchService.searchHybrid(
          TENANT_ID,
          "Apartamento com 8 quartos",
          true,
        )
      ).results,
    ).toEqual([]);
  });

  it("interpreta negação de comodidades e diferencia compra de aluguel", async () => {
    const parsed = aiSearchService.extractStructuredQuery(
      "Casa sem piscina até 950 mil",
    );
    expect(parsed.mustHaveAmenities).not.toContain("piscina");
    expect(parsed.excludedAmenities).toContain("piscina");
    const response = await aiSearchService.searchHybrid(
      TENANT_ID,
      "Casa sem piscina até 950 mil",
      true,
    );
    expect(
      response.results.some(({ property }) => property.code === "IMV-101"),
    ).toBe(false);
    const rent = await aiSearchService.searchHybrid(
      TENANT_ID,
      "Apartamento para alugar",
      true,
    );
    expect(rent.results).toEqual([]);
  });

  it("não usa um centro geográfico inventado e respeita o isolamento por imobiliária", async () => {
    expect(
      (
        await aiSearchService.searchHybrid(TENANT_ID, "Casa com piscina", true)
      ).results.every((item) => item.distanceKm === null),
    ).toBe(true);
    expect(
      (
        await aiSearchService.searchHybrid(
          "outra-agencia",
          "Casa com piscina",
          true,
        )
      ).results,
    ).toEqual([]);
  });

  it("mantém reservas opcionais e não recomenda imóveis vendidos ou inativos", async () => {
    const properties = structuredClone(
      SEED_PROPERTIES.filter((p) => p.tenantId === TENANT_ID),
    );
    properties[0].status = "SOLD";
    properties[1].status = "INACTIVE";
    vi.mocked(propertyRepository.findAllByTenant).mockResolvedValue(properties);
    const response = await aiSearchService.searchHybrid(
      TENANT_ID,
      "imóveis",
      false,
    );
    expect(
      response.results.every(
        ({ property }) => !["SOLD", "INACTIVE"].includes(property.status),
      ),
    ).toBe(true);
    expect(
      response.results.some(({ property }) => property.status === "RESERVED"),
    ).toBe(true);
    expect(
      (
        await aiSearchService.searchHybrid(TENANT_ID, "imóveis", true)
      ).results.every(({ property }) => property.status === "AVAILABLE"),
    ).toBe(true);
  });

  it("funciona sem chave e informa que usou regras locais, sem chamar uma API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await aiSearchService.searchWithAI(
      TENANT_ID,
      "Casa com piscina até 950 mil",
    );
    expect(response.interpretation).toEqual({
      mode: "local",
      reason: "not_configured",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  const modelOutput = {
    intentSummary: "Casa para trabalhar de casa com duas vagas",
    propertyTypes: ["HOUSE"],
    purpose: null,
    minPrice: null,
    maxPrice: 950000,
    minBedrooms: 3,
    minSuites: null,
    minParkingSpots: 2,
    neighborhoods: ["Vila Nova"],
    mustHaveAmenities: ["piscina"],
    excludedAmenities: [],
    semanticKeywords: [],
    locationMode: "exact",
  };
  it("usa a interpretação real do provedor e aplica os filtros apenas ao estoque da agência", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              finishReason: "STOP",
              content: { parts: [{ text: JSON.stringify(modelOutput) }] },
            },
          ],
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const response = await aiSearchService.searchWithAI(
      TENANT_ID,
      "Quero espaço para a família, duas vagas e um lugar para nadar, teto de 950 mil",
    );
    expect(response.interpretation?.mode).toBe("ai");
    expect(response.results.map(({ property }) => property.code)).toEqual([
      "IMV-101",
    ]);
    expect(response.query.minParkingSpots).toBe(2);
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.generationConfig.responseMimeType).toBe("application/json");
    expect(payload.generationConfig.responseJsonSchema.required).toContain(
      "maxPrice",
    );
    expect(payload.contents[0].parts[0].text).not.toContain("brokerId");
    expect(payload.contents[0].parts[0].text).not.toContain("embedding");
  });

  it.each(["invalid-json", "unavailable", "invalid-schema"])(
    "volta à busca local e informa a falha de IA: %s",
    async (failure) => {
      vi.stubEnv("GEMINI_API_KEY", "test-key");
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          failure === "unavailable"
            ? new Response("{}", { status: 503 })
            : new Response(
                JSON.stringify({
                  candidates: [
                    {
                      finishReason: "STOP",
                      content: {
                        parts: [
                          {
                            text:
                              failure === "invalid-json" ? "not json" : "{}",
                          },
                        ],
                      },
                    },
                  ],
                }),
              ),
        ),
      );
      const response = await aiSearchService.searchWithAI(
        TENANT_ID,
        "Casa com piscina até 950 mil",
      );
      expect(response.interpretation).toEqual({
        mode: "local",
        reason: "unavailable",
      });
      expect(response.results.map(({ property }) => property.code)).toEqual([
        "IMV-101",
      ]);
    },
  );
});

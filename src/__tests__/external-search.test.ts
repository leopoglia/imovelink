import { describe, expect, it } from "vitest";
import { filtrarExternos } from "@/server/services/external-search";
import type {
  ExternalListing,
  ExternalSource,
  StructuredPropertyQuery,
} from "@/types/domain";

const TENANT = "11111111-1111-4111-8111-111111111111";

const fonte = (over: Partial<ExternalSource> = {}): ExternalSource => ({
  id: "fonte-1",
  tenantId: TENANT,
  name: "Piermann",
  listUrl: "https://piermann.com.br/imoveis/venda",
  extractionMap: null,
  logoUrl: null,
  purpose: "SALE",
  paginationTemplate: null,
  maxPages: 5,
  active: true,
  lastCrawledAt: null,
  lastError: null,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
  ...over,
});

const anuncio = (over: Partial<ExternalListing> = {}): ExternalListing => ({
  id: "a1",
  sourceId: "fonte-1",
  tenantId: TENANT,
  url: "https://piermann.com.br/imovel/a",
  title: "Apartamento no Centro",
  price: 450000,
  neighborhood: "Centro",
  city: "Jaraguá do Sul",
  bedrooms: 3,
  parkingSpots: 1,
  areaTotal: 90,
  imageUrl: null,
  purpose: "SALE",
  contentHash: "h",
  firstSeenAt: "2026-11-01T00:00:00.000Z",
  lastSeenAt: "2026-11-01T00:00:00.000Z",
  ...over,
});

const consulta = (
  over: Partial<StructuredPropertyQuery> = {},
): StructuredPropertyQuery => ({
  rawQuery: "teste",
  intentSummary: "teste",
  propertyTypes: [],
  neighborhoods: [],
  mustHaveAmenities: [],
  semanticKeywords: [],
  aiModelUsed: "local-rules",
  ...over,
});

const fontes = new Map([["fonte-1", fonte()]]);

describe("Finalidade nos anúncios externos", () => {
  it("não mistura aluguel numa busca por compra", () => {
    // Um aluguel de R$ 2.500 por mês entraria em "até 300 mil" sem esse filtro.
    const anuncios = [
      anuncio(),
      anuncio({ id: "a2", url: "x", purpose: "RENT", price: 2500 }),
    ];
    const r = filtrarExternos(anuncios, consulta({ purpose: "SALE" }), fontes);
    expect(r).toHaveLength(1);
    expect(r[0].purpose).toBe("SALE");
  });

  it("traz só locação quando a busca é de aluguel", () => {
    const anuncios = [
      anuncio(),
      anuncio({ id: "a2", url: "x", purpose: "RENT", price: 2500 }),
    ];
    const r = filtrarExternos(anuncios, consulta({ purpose: "RENT" }), fontes);
    expect(r).toHaveLength(1);
    expect(r[0].price).toBe(2500);
  });

  it("não descarta anúncio de finalidade desconhecida", () => {
    // Fonte misturada: sem saber, é melhor mostrar do que esconder.
    const r = filtrarExternos(
      [anuncio({ purpose: null })],
      consulta({ purpose: "SALE" }),
      fontes,
    );
    expect(r).toHaveLength(1);
  });

  it("sem finalidade na busca, devolve os dois tipos", () => {
    const anuncios = [
      anuncio(),
      anuncio({ id: "a2", url: "x", purpose: "RENT", price: 2500 }),
    ];
    expect(filtrarExternos(anuncios, consulta(), fontes)).toHaveLength(2);
  });
});

describe("Demais filtros dos anúncios externos", () => {
  it("respeita o teto de preço", () => {
    const r = filtrarExternos(
      [anuncio(), anuncio({ id: "a2", url: "x", price: 900000 })],
      consulta({ maxPrice: 500000 }),
      fontes,
    );
    expect(r).toHaveLength(1);
  });

  it("descarta anúncio sem o dado exigido pela busca", () => {
    const r = filtrarExternos(
      [anuncio({ bedrooms: null })],
      consulta({ minBedrooms: 2 }),
      fontes,
    );
    expect(r).toEqual([]);
  });

  it("casa bairro ou cidade pelo nome normalizado", () => {
    expect(
      filtrarExternos([anuncio()], consulta({ neighborhoods: ["centro"] }), fontes),
    ).toHaveLength(1);
    expect(
      filtrarExternos(
        [anuncio()],
        consulta({ neighborhoods: ["Jaragua do Sul"] }),
        fontes,
      ),
    ).toHaveLength(1);
    expect(
      filtrarExternos([anuncio()], consulta({ neighborhoods: ["Corupá"] }), fontes),
    ).toEqual([]);
  });

  it("esconde anúncios de fonte pausada", () => {
    const pausada = new Map([["fonte-1", fonte({ active: false })]]);
    expect(filtrarExternos([anuncio()], consulta(), pausada)).toEqual([]);
  });

  it("ordena do mais barato para o mais caro", () => {
    const r = filtrarExternos(
      [anuncio({ price: 800000 }), anuncio({ id: "a2", url: "x", price: 300000 })],
      consulta(),
      fontes,
    );
    expect(r.map((item) => item.price)).toEqual([300000, 800000]);
  });
});

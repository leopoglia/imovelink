import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PRECO_MINIMO_DE_VENDA,
  externalSourceRepository,
} from "@/server/repositories/external-source.repository";
import { getDb } from "@/server/repositories/memory-store";
import type { ExternalListing } from "@/types/domain";

vi.mock("@/server/repositories/memory-store", () => ({ getDb: vi.fn() }));
vi.mock("@/server/database/postgres", () => ({
  isPostgresConfigured: () => false,
  getPostgres: vi.fn(),
  databaseRecord: vi.fn(),
  domainRecord: vi.fn(),
}));

const TENANT = "11111111-1111-4111-8111-111111111111";
const FONTE = "22222222-2222-4222-8222-222222222222";

const anuncio = (id: string, price: number | null): ExternalListing => ({
  id,
  sourceId: FONTE,
  tenantId: TENANT,
  url: `https://outrosite.com/${id}`,
  title: `Anúncio ${id}`,
  price,
  neighborhood: "Centro",
  city: "Jaraguá do Sul",
  bedrooms: 2,
  parkingSpots: 1,
  areaTotal: 70,
  imageUrl: null,
  purpose: "SALE",
  contentHash: id,
  firstSeenAt: "2026-11-10T10:00:00.000Z",
  lastSeenAt: "2026-11-10T10:00:00.000Z",
});

beforeEach(() => {
  vi.mocked(getDb).mockReturnValue({
    externalListings: [
      anuncio("aluguel", 2500),
      anuncio("limite", PRECO_MINIMO_DE_VENDA),
      anuncio("venda", 480000),
      anuncio("consulte", null),
      anuncio("quase", 34999),
    ],
  } as never);
});

describe("Anúncios de outros sites", () => {
  it("deixa de fora os valores abaixo de R$ 35 mil, que são de aluguel", async () => {
    const lista = await externalSourceRepository.listListings(TENANT);
    expect(lista.map((item) => item.id).sort()).toEqual([
      "consulte",
      "limite",
      "venda",
    ]);
  });

  it("aplica o mesmo corte ao listar uma fonte", async () => {
    const lista = await externalSourceRepository.listListings(TENANT, FONTE);
    expect(lista.some((item) => item.id === "aluguel")).toBe(false);
    expect(lista).toHaveLength(3);
  });

  it("mantém todos os anúncios nas métricas de coleta", async () => {
    expect(await externalSourceRepository.listAllListings()).toHaveLength(5);
  });
});

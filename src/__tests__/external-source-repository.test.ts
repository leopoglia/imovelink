import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/server/repositories/memory-store";
import { externalSourceRepository } from "@/server/repositories/external-source.repository";
import type { ExternalListing, ExternalSource } from "@/types/domain";

vi.mock("@/server/repositories/memory-store", () => ({ getDb: vi.fn() }));

const TENANT = "11111111-1111-4111-8111-111111111111";
const OUTRO_TENANT = "22222222-2222-4222-8222-222222222222";

const fonte = (over: Partial<ExternalSource> = {}): ExternalSource => ({
  id: "fonte-1",
  tenantId: TENANT,
  name: "Poder Imóveis",
  listUrl: "https://www.poderimoveis.com/imoveis",
  extractionMap: { item: "div.ui__card" },
  active: true,
  lastCrawledAt: null,
  lastError: null,
  createdAt: "2026-11-01T10:00:00.000Z",
  updatedAt: "2026-11-01T10:00:00.000Z",
  ...over,
});

const anuncio = (over: Partial<ExternalListing> = {}): ExternalListing => ({
  id: "anuncio-1",
  sourceId: "fonte-1",
  tenantId: TENANT,
  url: "https://www.poderimoveis.com/imovel/a",
  title: "Apartamento",
  price: 130000,
  neighborhood: "Corticeira",
  city: "Guaramirim",
  bedrooms: 2,
  parkingSpots: 1,
  areaTotal: 48.4,
  contentHash: "hash-a",
  firstSeenAt: "2026-11-01T10:00:00.000Z",
  lastSeenAt: "2026-11-01T10:00:00.000Z",
  ...over,
});

let db: ReturnType<typeof getDb>;
beforeEach(() => {
  vi.clearAllMocks();
  db = {
    tenants: [],
    users: [],
    properties: [],
    auditLogs: [],
    leads: [],
    externalSources: [],
    externalListings: [],
  };
  vi.mocked(getDb).mockReturnValue(db);
});

describe("Repositório de fontes externas", () => {
  it("cria uma fonte e a devolve na listagem da imobiliária", async () => {
    await externalSourceRepository.create(fonte());
    const lista = await externalSourceRepository.listByTenant(TENANT);
    expect(lista).toHaveLength(1);
    expect(lista[0].listUrl).toContain("poderimoveis");
  });

  it("não mostra fonte de outra imobiliária", async () => {
    await externalSourceRepository.create(fonte({ tenantId: OUTRO_TENANT }));
    expect(await externalSourceRepository.listByTenant(TENANT)).toEqual([]);
    expect(
      await externalSourceRepository.findById(TENANT, "fonte-1"),
    ).toBeUndefined();
  });

  it("ordena as fontes da mais recente para a mais antiga", async () => {
    await externalSourceRepository.create(
      fonte({ id: "a", createdAt: "2026-11-01T00:00:00.000Z" }),
    );
    await externalSourceRepository.create(
      fonte({ id: "b", createdAt: "2026-11-09T00:00:00.000Z" }),
    );
    const lista = await externalSourceRepository.listByTenant(TENANT);
    expect(lista.map((f) => f.id)).toEqual(["b", "a"]);
  });

  it("registra o desfecho da coleta, com e sem erro", async () => {
    await externalSourceRepository.create(fonte());
    await externalSourceRepository.registrarColeta(TENANT, "fonte-1", null);
    expect(db.externalSources[0].lastCrawledAt).not.toBeNull();
    expect(db.externalSources[0].lastError).toBeNull();

    await externalSourceRepository.registrarColeta(
      TENANT,
      "fonte-1",
      "BLOCKED_BY_ROBOTS",
    );
    expect(db.externalSources[0].lastError).toBe("BLOCKED_BY_ROBOTS");
  });

  it("não deixa uma imobiliária alterar a fonte de outra", async () => {
    await externalSourceRepository.create(fonte());
    await externalSourceRepository.setActive(OUTRO_TENANT, "fonte-1", false);
    expect(db.externalSources[0].active).toBe(true);

    await externalSourceRepository.setActive(TENANT, "fonte-1", false);
    expect(db.externalSources[0].active).toBe(false);
  });

  it("remove a fonte junto com os anúncios dela", async () => {
    await externalSourceRepository.create(fonte());
    await externalSourceRepository.upsertListings([anuncio()]);
    await externalSourceRepository.remove(TENANT, "fonte-1");
    expect(db.externalSources).toEqual([]);
    expect(db.externalListings).toEqual([]);
  });
});

describe("Gravação de anúncios coletados", () => {
  it("insere os anúncios novos", async () => {
    const gravados = await externalSourceRepository.upsertListings([
      anuncio(),
      anuncio({ id: "anuncio-2", url: "https://x/b", price: 150000 }),
    ]);
    expect(gravados).toBe(2);
    expect(db.externalListings).toHaveLength(2);
  });

  it("atualiza em vez de duplicar quando reencontra a mesma URL", async () => {
    await externalSourceRepository.upsertListings([anuncio()]);
    await externalSourceRepository.upsertListings([
      anuncio({ id: "outro-id", price: 125000, contentHash: "hash-b" }),
    ]);
    expect(db.externalListings).toHaveLength(1);
    expect(db.externalListings[0].price).toBe(125000);
  });

  it("preserva a data do primeiro avistamento ao atualizar", async () => {
    await externalSourceRepository.upsertListings([anuncio()]);
    const primeiro = db.externalListings[0].firstSeenAt;
    await externalSourceRepository.upsertListings([
      anuncio({ firstSeenAt: "2030-01-01T00:00:00.000Z", price: 1 }),
    ]);
    expect(db.externalListings[0].firstSeenAt).toBe(primeiro);
    expect(db.externalListings[0].lastSeenAt).not.toBe(primeiro);
  });

  it("não grava nada quando a coleta não trouxe anúncios", async () => {
    expect(await externalSourceRepository.upsertListings([])).toBe(0);
    expect(db.externalListings).toEqual([]);
  });

  it("filtra anúncios por fonte e por imobiliária", async () => {
    await externalSourceRepository.upsertListings([
      anuncio(),
      anuncio({ id: "b", sourceId: "fonte-2", url: "https://x/b" }),
      anuncio({ id: "c", tenantId: OUTRO_TENANT, url: "https://x/c" }),
    ]);
    expect(await externalSourceRepository.listListings(TENANT)).toHaveLength(2);
    expect(
      await externalSourceRepository.listListings(TENANT, "fonte-2"),
    ).toHaveLength(1);
  });
});

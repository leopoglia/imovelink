// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GET } from "@/app/api/properties/route";
import ImoveisPortfolioPage from "@/app/(portal)/imoveis/page";
import { requireSession } from "@/server/services/auth.service";
import { propertyService } from "@/server/services/property.service";
import { externalSourceRepository } from "@/server/repositories/external-source.repository";
import { resumoDaColeta } from "@/lib/crawler-summary";
import { useTenantStore } from "@/store/tenant-store";
import {
  SEED_PROPERTIES,
  SEED_TENANTS,
  SEED_USERS,
} from "@/server/seeds/seed-jaragua";
import type { ExternalListing, Property } from "@/types/domain";

vi.mock("@/server/services/auth.service", async (original) => ({
  ...(await original<typeof import("@/server/services/auth.service")>()),
  requireSession: vi.fn(),
}));
vi.mock("@/server/services/property.service", () => ({
  propertyService: { listProperties: vi.fn(), listAuditLogs: vi.fn() },
}));
vi.mock("@/server/repositories/external-source.repository", () => ({
  externalSourceRepository: {
    listListings: vi.fn(),
    listByTenant: vi.fn(async () => []),
    urlsQueSairam: vi.fn(),
  },
}));

const ORIGEM = "https://outrosite.com/imovel/9";
const imovel = (extra: Partial<Property>): Property => ({
  ...structuredClone(SEED_PROPERTIES[0]),
  ...extra,
});
const anuncio = (url: string): ExternalListing => ({
  id: url,
  sourceId: "33333333-3333-4333-8333-333333333333",
  tenantId: SEED_TENANTS[0].id,
  url,
  title: `Anúncio ${url}`,
  price: 420000,
  neighborhood: "Centro",
  city: "Jaraguá do Sul",
  bedrooms: 2,
  parkingSpots: 1,
  areaTotal: 68,
  imageUrl: null,
  purpose: "SALE",
  contentHash: "x",
  firstSeenAt: "2026-11-10T10:00:00.000Z",
  lastSeenAt: "2026-11-10T10:00:00.000Z",
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireSession).mockResolvedValue({
    tenant: SEED_TENANTS[0],
    user: SEED_USERS[0],
  });
});

describe("API de imóveis e anúncios que saíram da origem", () => {
  async function listar() {
    const resposta = await GET(
      new NextRequest("http://localhost/api/properties?includeExternal=true"),
    );
    expect(resposta.status).toBe(200);
    return resposta.json();
  }

  it("marca o imóvel trazido de um anúncio que saiu da origem", async () => {
    vi.mocked(propertyService.listProperties).mockResolvedValue([
      imovel({ id: "trazido", sourceListingUrl: ORIGEM }),
      imovel({ id: "proprio" }),
    ]);
    vi.mocked(externalSourceRepository.listListings).mockResolvedValue([]);
    vi.mocked(externalSourceRepository.urlsQueSairam).mockResolvedValue(
      new Set([ORIGEM]),
    );
    const { properties } = await listar();
    expect(
      properties.find((p: Property) => p.id === "trazido").sourceListingRemoved,
    ).toBe(true);
    expect(
      properties.find((p: Property) => p.id === "proprio").sourceListingRemoved,
    ).toBeUndefined();
  });

  it("não marca quando o anúncio de origem continua no ar", async () => {
    vi.mocked(propertyService.listProperties).mockResolvedValue([
      imovel({ id: "trazido", sourceListingUrl: ORIGEM }),
    ]);
    vi.mocked(externalSourceRepository.listListings).mockResolvedValue([
      anuncio(ORIGEM),
    ]);
    vi.mocked(externalSourceRepository.urlsQueSairam).mockResolvedValue(
      new Set(),
    );
    const { properties } = await listar();
    expect(properties[0].sourceListingRemoved).toBeUndefined();
  });

  it("não repete como externo o anúncio que já está na carteira", async () => {
    vi.mocked(propertyService.listProperties).mockResolvedValue([
      imovel({ id: "trazido", sourceListingUrl: ORIGEM }),
    ]);
    vi.mocked(externalSourceRepository.listListings).mockResolvedValue([
      anuncio(ORIGEM),
      anuncio("https://outrosite.com/imovel/10"),
    ]);
    vi.mocked(externalSourceRepository.urlsQueSairam).mockResolvedValue(
      new Set(),
    );
    const { externalListings } = await listar();
    expect(externalListings.map((l: ExternalListing) => l.url)).toEqual([
      "https://outrosite.com/imovel/10",
    ]);
  });
});

describe("Resumo da coleta", () => {
  it("diz quantos saíram quando a listagem foi lida inteira", () => {
    expect(resumoDaColeta({ collected: 12, complete: true, removed: 2 })).toBe(
      "12 anúncios coletados. 2 anúncios saíram do site e deixaram de aparecer em Imóveis.",
    );
    expect(resumoDaColeta({ collected: 1, complete: true, removed: 1 })).toBe(
      "1 anúncio coletado. 1 anúncio saiu do site e deixou de aparecer em Imóveis.",
    );
    expect(resumoDaColeta({ collected: 3, complete: true, removed: 0 })).toBe(
      "3 anúncios coletados. Nenhum anúncio saiu do site.",
    );
  });

  it("avisa quando não deu para conferir o que saiu", () => {
    expect(resumoDaColeta({ collected: 40, complete: false })).toContain(
      "não foi lida até o fim",
    );
  });
});

describe("Aviso no card do imóvel", () => {
  const originalSession = useTenantStore.getState();
  let client: QueryClient;

  function abrir(carteira: Property[]) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            properties: carteira,
            auditLogs: [],
            externalListings: [],
            externalSources: [],
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    useTenantStore.setState({
      currentTenant: SEED_TENANTS[0],
      currentUser: SEED_USERS[0],
    });
    render(
      React.createElement(
        QueryClientProvider,
        { client },
        React.createElement(ImoveisPortfolioPage),
      ),
    );
  }

  afterEach(() => {
    cleanup();
    client.clear();
    vi.unstubAllGlobals();
    useTenantStore.setState(originalSession);
  });

  it("avisa para conferir a venda e linka o anúncio de origem", async () => {
    abrir([
      imovel({
        id: "trazido",
        title: "Casa trazida",
        status: "AVAILABLE",
        sourceListingUrl: ORIGEM,
        sourceListingRemoved: true,
      }),
    ]);
    const aviso = await screen.findByRole("note");
    expect(aviso.textContent).toContain(
      "Saiu do site de origem. Confira se foi vendido.",
    );
    expect(
      screen.getByRole("link", { name: "Ver anúncio" }).getAttribute("href"),
    ).toBe(ORIGEM);
  });

  it("não avisa quando o imóvel já está vendido ou o anúncio continua no ar", async () => {
    abrir([
      imovel({
        id: "vendido",
        title: "Casa vendida",
        status: "SOLD",
        sourceListingUrl: ORIGEM,
        sourceListingRemoved: true,
      }),
      imovel({ id: "no-ar", title: "Casa no ar", sourceListingUrl: ORIGEM }),
    ]);
    await screen.findByText("Casa no ar");
    expect(screen.queryByRole("note")).toBeNull();
  });
});

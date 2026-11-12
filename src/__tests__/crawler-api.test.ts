import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/crawler/route";
import { requireSession } from "@/server/services/auth.service";
import { crawlerService } from "@/server/services/crawler.service";
import { externalSourceRepository } from "@/server/repositories/external-source.repository";
import { SEED_TENANTS, SEED_USERS } from "@/server/seeds/seed-jaragua";
import type { UserRole } from "@/types/domain";

vi.mock("@/server/services/auth.service", async (original) => ({
  ...(await original<typeof import("@/server/services/auth.service")>()),
  requireSession: vi.fn(),
}));
vi.mock("@/server/services/crawler-fetch", () => ({
  buscarListagem: vi.fn(),
}));
vi.mock("@/server/services/extraction-discovery", () => ({
  descobrirMapaExtracao: vi.fn(),
}));
vi.mock("@/server/repositories/external-source.repository", () => ({
  externalSourceRepository: {
    listByTenant: vi.fn(async () => []),
    listListings: vi.fn(async () => []),
    create: vi.fn(async (f) => f),
    findById: vi.fn(),
    setActive: vi.fn(),
    setMaxPages: vi.fn(),
    remove: vi.fn(),
    registrarColeta: vi.fn(),
    upsertListings: vi.fn(async () => 0),
  },
}));

const MAPA = {
  item: "div.ui__card",
  fields: {
    url: { selector: "a", attr: "href" },
    title: { selector: "h2" },
  },
};

function sessao(role: UserRole) {
  vi.mocked(requireSession).mockResolvedValue({
    tenant: SEED_TENANTS[0],
    user: { ...SEED_USERS[0], role },
  });
}

const pedido = (body: unknown) =>
  new NextRequest("http://localhost/api/crawler", {
    method: "POST",
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  sessao("AGENCY_ADMIN");
});

describe("Permissão para administrar fontes externas", () => {
  const acoes = [
    { action: "ANALYZE", listUrl: "https://exemplo.com/imoveis" },
    {
      action: "SAVE",
      name: "Exemplo",
      listUrl: "https://exemplo.com/imoveis",
      extractionMap: MAPA,
    },
    { action: "COLLECT", sourceId: SEED_TENANTS[0].id },
    { action: "SET_ACTIVE", sourceId: SEED_TENANTS[0].id, active: false },
    {
      action: "SET_MAX_PAGES",
      sourceId: SEED_TENANTS[0].id,
      maxPages: 50,
    },
    { action: "REMOVE", sourceId: SEED_TENANTS[0].id },
  ];

  it.each(acoes)("corretor recebe 403 em %o", async (corpo) => {
    sessao("BROKER");
    const resposta = await POST(pedido(corpo));
    expect(resposta.status).toBe(403);
    await expect(resposta.json()).resolves.toMatchObject({
      error: expect.stringContaining("gestores"),
    });
  });

  it("corretor também não lista fontes", async () => {
    sessao("BROKER");
    expect((await GET(new NextRequest("http://localhost/api/crawler"))).status)
      .toBe(403);
    expect(externalSourceRepository.listByTenant).not.toHaveBeenCalled();
  });

  it("gestor e super administrador conseguem listar", async () => {
    for (const papel of ["AGENCY_ADMIN", "SUPER_ADMIN"] as UserRole[]) {
      sessao(papel);
      const resposta = await GET(new NextRequest("http://localhost/api/crawler"));
      expect(resposta.status).toBe(200);
    }
  });
});

describe("Rota do crawler", () => {
  it("usa a imobiliária da sessão, ignorando o que vier no corpo", async () => {
    const salvar = vi.spyOn(crawlerService, "salvar");
    await POST(
      pedido({
        action: "SAVE",
        name: "Poder Imóveis",
        listUrl: "https://www.poderimoveis.com/imoveis",
        extractionMap: MAPA,
      }),
    );
    expect(salvar).toHaveBeenCalledWith(
      "AGENCY_ADMIN",
      SEED_TENANTS[0].id,
      expect.objectContaining({ name: "Poder Imóveis" }),
    );
    salvar.mockRestore();
  });

  it("devolve 201 ao cadastrar a fonte", async () => {
    const resposta = await POST(
      pedido({
        action: "SAVE",
        name: "Poder Imóveis",
        listUrl: "https://www.poderimoveis.com/imoveis",
        extractionMap: MAPA,
      }),
    );
    expect(resposta.status).toBe(201);
    expect(externalSourceRepository.create).toHaveBeenCalledOnce();
  });

  it("recusa campo desconhecido no corpo", async () => {
    const resposta = await POST(
      pedido({
        action: "ANALYZE",
        listUrl: "https://exemplo.com/x",
        tenantId: "tentando forjar",
      }),
    );
    expect(resposta.status).toBe(400);
  });

  it("recusa ação inexistente e URL inválida", async () => {
    expect((await POST(pedido({ action: "DROP_TABLE" }))).status).toBe(400);
    expect(
      (await POST(pedido({ action: "ANALYZE", listUrl: "não é url" }))).status,
    ).toBe(400);
  });

  it("recusa mapa de extração malformado ao salvar", async () => {
    const resposta = await POST(
      pedido({
        action: "SAVE",
        name: "X",
        listUrl: "https://exemplo.com/x",
        extractionMap: { item: "div" },
      }),
    );
    expect(resposta.status).toBe(400);
    expect(externalSourceRepository.create).not.toHaveBeenCalled();
  });

  it("responde 404 ao coletar fonte que não existe", async () => {
    vi.mocked(externalSourceRepository.findById).mockResolvedValue(undefined);
    const resposta = await POST(
      pedido({ action: "COLLECT", sourceId: SEED_TENANTS[0].id }),
    );
    expect(resposta.status).toBe(404);
  });

  it("não coleta fonte cujo mapa salvo é inválido", async () => {
    vi.mocked(externalSourceRepository.findById).mockResolvedValue({
      id: SEED_TENANTS[0].id,
      tenantId: SEED_TENANTS[0].id,
      name: "X",
      listUrl: "https://exemplo.com/x",
      extractionMap: { lixo: true },
      logoUrl: null,
      paginationTemplate: null,
      maxPages: 5,
      active: true,
      lastCrawledAt: null,
      lastError: null,
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z",
    });
    const resposta = await POST(
      pedido({ action: "COLLECT", sourceId: SEED_TENANTS[0].id }),
    );
    expect(resposta.status).toBe(400);
    await expect(resposta.json()).resolves.toMatchObject({
      error: expect.stringContaining("mapa válido"),
    });
  });

  it("altera o teto de páginas de uma fonte", async () => {
    const resposta = await POST(
      pedido({
        action: "SET_MAX_PAGES",
        sourceId: SEED_TENANTS[0].id,
        maxPages: 50,
      }),
    );
    expect(resposta.status).toBe(200);
    expect(externalSourceRepository.setMaxPages).toHaveBeenCalledWith(
      SEED_TENANTS[0].id,
      SEED_TENANTS[0].id,
      50,
    );
  });

  it("recusa teto fora do intervalo permitido", async () => {
    for (const maxPages of [0, 201, 1.5]) {
      const r = await POST(
        pedido({
          action: "SET_MAX_PAGES",
          sourceId: SEED_TENANTS[0].id,
          maxPages,
        }),
      );
      expect(r.status).toBe(400);
    }
    expect(externalSourceRepository.setMaxPages).not.toHaveBeenCalled();
  });

  it("não devolve cache nas consultas", async () => {
    const resposta = await GET(new NextRequest("http://localhost/api/crawler"));
    expect(resposta.headers.get("Cache-Control")).toBe("no-store");
  });
});

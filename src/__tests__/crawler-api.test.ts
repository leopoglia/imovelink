import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/crawler/route";
import { requireSession } from "@/server/services/auth.service";
import { crawlerService } from "@/server/services/crawler.service";
import { externalSourceRepository } from "@/server/repositories/external-source.repository";
import { buscarListagem } from "@/server/services/crawler-fetch";
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
    upsertListings: vi.fn(async (lista: unknown[]) => lista.length),
    marcarSaidos: vi.fn(async () => 2),
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
      purpose: null,
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

describe("Coleta e anúncios que saíram da origem", () => {
  const cards = (...refs: string[]) =>
    refs
      .map(
        (ref) =>
          `<div class="ui__card"><a href="/imovel/${ref}"></a><h2>Imóvel ${ref}</h2></div>`,
      )
      .join("");
  const fonteValida = (paginationTemplate: string | null) => ({
    id: SEED_TENANTS[0].id,
    tenantId: SEED_TENANTS[0].id,
    name: "X",
    listUrl: "https://exemplo.com/lista",
    extractionMap: MAPA,
    logoUrl: null,
    purpose: "SALE" as const,
    paginationTemplate,
    maxPages: 5,
    active: true,
    lastCrawledAt: null,
    lastError: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
  });
  const pagina = (html: string) => ({
    html,
    url: new URL("https://exemplo.com/lista"),
  });
  const coletar = async () => {
    const resposta = await POST(
      pedido({ action: "COLLECT", sourceId: SEED_TENANTS[0].id }),
    );
    expect(resposta.status).toBe(200);
    return resposta.json();
  };

  it("marca os ausentes quando a listagem foi lida inteira", async () => {
    vi.mocked(externalSourceRepository.findById).mockResolvedValue(
      fonteValida(null),
    );
    vi.mocked(buscarListagem).mockResolvedValue(pagina(cards("a", "b")));
    const resultado = await coletar();
    expect(resultado).toMatchObject({ collected: 2, complete: true, removed: 2 });
    expect(externalSourceRepository.marcarSaidos).toHaveBeenCalledWith(
      SEED_TENANTS[0].id,
      SEED_TENANTS[0].id,
      ["https://exemplo.com/imovel/a", "https://exemplo.com/imovel/b"],
    );
  });

  it("considera o fim da listagem quando a próxima página não existe", async () => {
    vi.mocked(externalSourceRepository.findById).mockResolvedValue(
      fonteValida("https://exemplo.com/lista?page={n}"),
    );
    vi.mocked(buscarListagem)
      .mockResolvedValueOnce(pagina(cards("a")))
      .mockRejectedValueOnce(
        Object.assign(new Error("404"), { code: "NOT_FOUND" }),
      );
    const resultado = await coletar();
    expect(resultado).toMatchObject({ complete: true });
    expect(externalSourceRepository.marcarSaidos).toHaveBeenCalled();
  });

  it("não marca nada quando uma página falha no meio", async () => {
    vi.mocked(externalSourceRepository.findById).mockResolvedValue(
      fonteValida("https://exemplo.com/lista?page={n}"),
    );
    vi.mocked(buscarListagem)
      .mockResolvedValueOnce(pagina(cards("a")))
      .mockRejectedValueOnce(
        Object.assign(new Error("lento"), { code: "TIMEOUT" }),
      );
    const resultado = await coletar();
    expect(resultado).toMatchObject({ complete: false, removed: 0 });
    expect(externalSourceRepository.marcarSaidos).not.toHaveBeenCalled();
  });
});

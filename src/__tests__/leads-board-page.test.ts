// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import ContatosPage from "@/app/(portal)/contatos/page";
import { useTenantStore } from "@/store/tenant-store";
import {
  SEED_LEADS,
  SEED_PROPERTIES,
  SEED_TENANTS,
} from "@/server/seeds/seed-jaragua";
import type { HybridSearchResponse, Lead } from "@/types/domain";

const initialSession = useTenantStore.getState();
const fetchMock = vi.fn();

const contato = (extra: Partial<Lead>): Lead => ({
  ...structuredClone(SEED_LEADS[0]),
  ...extra,
});

const ana = contato({
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "Ana Souza",
  phone: "(47) 99999-0001",
  stage: "NEW",
  aiScore: 85,
  aiTemperature: "HOT",
  naturalSearchDesire: "Casa com piscina até 950 mil",
  createdAt: "2026-11-10T12:00:00.000Z",
});
const bruno = contato({
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  name: "Bruno Lima",
  phone: "(47) 99999-0002",
  stage: "PROPOSAL",
  aiScore: 60,
  aiTemperature: "WARM",
  naturalSearchDesire: "Apartamento no Centro",
  createdAt: "2026-11-08T12:00:00.000Z",
});

const busca: HybridSearchResponse = {
  query: {
    rawQuery: "Casa com piscina até 950 mil",
    intentSummary: "Casa com piscina",
    propertyTypes: ["HOUSE"],
    maxPrice: 950000,
    neighborhoods: [],
    mustHaveAmenities: ["piscina"],
    semanticKeywords: [],
    aiModelUsed: "local-rules",
  },
  results: SEED_PROPERTIES.slice(0, 4).map((property) => ({
    property,
    hybridScore: 90,
    attributeScore: 100,
    semanticScore: 60,
    geoScore: 100,
    distanceKm: null,
    matchReasons: [],
  })),
  executionTimeMs: 4,
  totalCandidatesEvaluated: 8,
  interpretation: { mode: "local", reason: "not_configured" },
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

/** Responde cada rota com o que o teste configurou. */
function responder(rotas: {
  leads?: () => Response;
  mover?: (body: { stage: string }) => Response;
  busca?: () => Response;
}) {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === "/api/leads")
      return (rotas.leads ?? (() => json({ leads: [ana, bruno] })))();
    if (url.startsWith("/api/leads/"))
      return (
        rotas.mover ??
        ((body) => json({ lead: { ...ana, stage: body.stage } }))
      )(JSON.parse(String(init?.body)));
    if (url === "/api/search/ai")
      return (rotas.busca ?? (() => json(busca)))();
    throw new Error(`Rota inesperada: ${url}`);
  });
}

const coluna = (nome: string) => screen.getByRole("region", { name: nome });
const chamadas = (trecho: string) =>
  fetchMock.mock.calls.filter(([url]) => String(url).startsWith(trecho));

beforeEach(() => {
  vi.clearAllMocks();
  useTenantStore.setState({ currentTenant: SEED_TENANTS[0] });
  vi.stubGlobal("fetch", fetchMock);
  responder({});
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useTenantStore.setState(initialSession);
});

describe("Quadro de contatos", () => {
  it("mostra uma coluna por etapa, com cada contato na sua", async () => {
    render(React.createElement(ContatosPage));
    expect(screen.getByRole("status").textContent).toContain("Carregando");
    await screen.findByRole("article", { name: "Ana Souza" });

    for (const etapa of [
      "Novo",
      "Em contato",
      "Visita agendada",
      "Proposta",
      "Fechado",
      "Perdido",
    ])
      expect(coluna(etapa)).toBeTruthy();

    expect(
      within(coluna("Novo")).getByRole("article", { name: "Ana Souza" }),
    ).toBeTruthy();
    expect(
      within(coluna("Proposta")).getByRole("article", { name: "Bruno Lima" }),
    ).toBeTruthy();
    expect(within(coluna("Fechado")).getByText("Nenhum contato.")).toBeTruthy();
    expect(screen.getByText("2 contatos")).toBeTruthy();
  });

  it("mostra telefone, pedido, pontuação e data do contato", async () => {
    render(React.createElement(ContatosPage));
    const cartao = await screen.findByRole("article", { name: "Ana Souza" });
    const telefone = within(cartao).getByRole("link", {
      name: "(47) 99999-0001",
    });
    expect(telefone.getAttribute("href")).toBe("tel:47999990001");
    expect(within(cartao).getByText("Casa com piscina até 950 mil")).toBeTruthy();
    expect(within(cartao).getByText("Quente · 85")).toBeTruthy();
    expect(within(cartao).getByText("Recebido em 10/11/2026")).toBeTruthy();
  });

  it("move o contato de etapa e grava no servidor", async () => {
    render(React.createElement(ContatosPage));
    await screen.findByRole("article", { name: "Ana Souza" });
    fireEvent.change(screen.getByLabelText("Etapa de Ana Souza"), {
      target: { value: "VISIT_SCHEDULED" },
    });

    await waitFor(() =>
      expect(
        within(coluna("Visita agendada")).getByRole("article", {
          name: "Ana Souza",
        }),
      ).toBeTruthy(),
    );
    expect(within(coluna("Novo")).queryByRole("article")).toBeNull();

    const [url, init] = chamadas("/api/leads/")[0];
    expect(url).toBe(`/api/leads/${ana.id}`);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ stage: "VISIT_SCHEDULED" });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("devolve o contato à etapa anterior quando o servidor recusa", async () => {
    responder({
      mover: () => json({ error: "Você não tem permissão para esta ação." }, 403),
    });
    render(React.createElement(ContatosPage));
    await screen.findByRole("article", { name: "Ana Souza" });
    fireEvent.change(screen.getByLabelText("Etapa de Ana Souza"), {
      target: { value: "WON" },
    });

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Você não tem permissão para esta ação.",
    );
    expect(
      within(coluna("Novo")).getByRole("article", { name: "Ana Souza" }),
    ).toBeTruthy();
    expect(within(coluna("Fechado")).queryByRole("article")).toBeNull();
  });

  it("move o contato ao soltar o cartão em outra coluna", async () => {
    render(React.createElement(ContatosPage));
    const cartao = await screen.findByRole("article", { name: "Ana Souza" });
    const dados = new Map<string, string>();
    const dataTransfer = {
      setData: (tipo: string, valor: string) => dados.set(tipo, valor),
      getData: (tipo: string) => dados.get(tipo) ?? "",
    };
    fireEvent.dragStart(cartao, { dataTransfer });
    fireEvent.dragOver(coluna("Em contato"), { dataTransfer });
    fireEvent.drop(coluna("Em contato"), { dataTransfer });

    await waitFor(() =>
      expect(
        within(coluna("Em contato")).getByRole("article", {
          name: "Ana Souza",
        }),
      ).toBeTruthy(),
    );
    expect(JSON.parse(chamadas("/api/leads/")[0][1].body)).toEqual({
      stage: "QUALIFYING",
    });
  });

  it("não chama o servidor quando a etapa escolhida é a atual", async () => {
    render(React.createElement(ContatosPage));
    const cartao = await screen.findByRole("article", { name: "Ana Souza" });
    const dataTransfer = { setData: vi.fn(), getData: () => ana.id };
    fireEvent.dragStart(cartao, { dataTransfer });
    fireEvent.drop(coluna("Novo"), { dataTransfer });
    await waitFor(() => expect(chamadas("/api/leads")).toHaveLength(1));
    expect(chamadas("/api/leads/")).toHaveLength(0);
  });

  it("sugere até três imóveis usando o pedido do contato", async () => {
    render(React.createElement(ContatosPage));
    const cartao = await screen.findByRole("article", { name: "Ana Souza" });
    fireEvent.click(
      within(cartao).getByRole("button", { name: "Sugerir imóveis" }),
    );

    const lista = await screen.findByRole("list", {
      name: "Imóveis sugeridos para Ana Souza",
    });
    expect(within(lista).getAllByRole("listitem")).toHaveLength(3);
    expect(within(lista).getByText(SEED_PROPERTIES[0].code)).toBeTruthy();
    expect(JSON.parse(chamadas("/api/search/ai")[0][1].body)).toEqual({
      query: "Casa com piscina até 950 mil",
      onlyAvailable: true,
    });
  });

  it("avisa quando nenhum imóvel atende ao pedido", async () => {
    responder({ busca: () => json({ ...busca, results: [] }) });
    render(React.createElement(ContatosPage));
    const cartao = await screen.findByRole("article", { name: "Ana Souza" });
    fireEvent.click(
      within(cartao).getByRole("button", { name: "Sugerir imóveis" }),
    );
    expect(
      await within(cartao).findByText(
        "Nenhum imóvel disponível atende a esse pedido.",
      ),
    ).toBeTruthy();
  });

  it("mostra o erro da busca de imóveis e permite tentar de novo", async () => {
    responder({
      busca: () => json({ error: "Descreva o imóvel com mais detalhes." }, 400),
    });
    render(React.createElement(ContatosPage));
    const cartao = await screen.findByRole("article", { name: "Ana Souza" });
    fireEvent.click(
      within(cartao).getByRole("button", { name: "Sugerir imóveis" }),
    );
    expect((await within(cartao).findByRole("alert")).textContent).toBe(
      "Descreva o imóvel com mais detalhes.",
    );
    expect(
      within(cartao).getByRole("button", { name: "Sugerir imóveis" }),
    ).toBeTruthy();
  });

  it("explica o quadro vazio", async () => {
    responder({ leads: () => json({ leads: [] }) });
    render(React.createElement(ContatosPage));
    expect(
      await screen.findByRole("heading", { name: "Nenhum contato ainda." }),
    ).toBeTruthy();
    expect(screen.getByText("0 contatos")).toBeTruthy();
  });

  it("mostra o erro de carregamento e tenta de novo", async () => {
    let tentativas = 0;
    responder({
      leads: () =>
        ++tentativas === 1
          ? json({ error: "Não foi possível carregar os contatos." }, 500)
          : json({ leads: [ana] }),
    });
    render(React.createElement(ContatosPage));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Não foi possível carregar os contatos.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(
      await screen.findByRole("article", { name: "Ana Souza" }),
    ).toBeTruthy();
    expect(screen.getByText("1 contato")).toBeTruthy();
  });
});

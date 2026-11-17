// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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
  SEED_USERS,
} from "@/server/seeds/seed-jaragua";
import type { HybridSearchResponse, Lead } from "@/types/domain";

const initialSession = useTenantStore.getState();
const fetchMock = vi.fn();
const gestor = SEED_USERS[0];
const corretor = SEED_USERS[1];

const contato = (extra: Partial<Lead>): Lead => ({
  ...structuredClone(SEED_LEADS[0]),
  ...extra,
});

const ana = contato({
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "Ana Souza",
  phone: "(47) 99999-0001",
  email: "ana@example.com",
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
const carla = contato({
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  name: "Carla Dias",
  stage: "WON",
});
const davi = contato({
  id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  name: "Davi Rocha",
  stage: "LOST",
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
  alterar?: (body: Record<string, string>) => Response;
  excluir?: () => Response;
  busca?: () => Response;
}) {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === "/api/leads")
      return (rotas.leads ?? (() => json({ leads: [ana, bruno, carla, davi] })))();
    if (url.startsWith("/api/leads/")) {
      if (init?.method === "DELETE")
        return (rotas.excluir ?? (() => json({ success: true })))();
      return (
        rotas.alterar ?? ((body) => json({ lead: { ...ana, ...body } }))
      )(JSON.parse(String(init?.body)));
    }
    if (url === "/api/search/ai")
      return (rotas.busca ?? (() => json(busca)))();
    throw new Error(`Rota inesperada: ${url}`);
  });
}

const coluna = (nome: string) => screen.getByRole("region", { name: nome });
const chamadas = (trecho: string, metodo?: string) =>
  fetchMock.mock.calls.filter(
    ([url, init]) =>
      String(url).startsWith(trecho) && (!metodo || init?.method === metodo),
  );

function arrastar(cartao: HTMLElement, destino: HTMLElement, id: string) {
  const dataTransfer = { setData: vi.fn(), getData: () => id };
  fireEvent.dragStart(cartao, { dataTransfer });
  fireEvent.dragOver(destino, { dataTransfer });
  fireEvent.drop(destino, { dataTransfer });
}

async function abrirEdicao(nome: string) {
  await screen.findByRole("article", { name: nome });
  fireEvent.click(screen.getByRole("button", { name: `Editar ${nome}` }));
  return screen.findByRole("dialog");
}

// O jsdom não implementa a abertura do <dialog> nativo.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  useTenantStore.setState({
    currentTenant: SEED_TENANTS[0],
    currentUser: gestor,
  });
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
    expect(
      within(coluna("Em contato")).getByText("Nenhum contato."),
    ).toBeTruthy();
    expect(screen.getByText("4 contatos")).toBeTruthy();
  });

  it("mostra telefone, pedido, pontuação e data, sem seletor de etapa no cartão", async () => {
    render(React.createElement(ContatosPage));
    const cartao = await screen.findByRole("article", { name: "Ana Souza" });
    const telefone = within(cartao).getByRole("link", {
      name: "(47) 99999-0001",
    });
    expect(telefone.getAttribute("href")).toBe("tel:47999990001");
    expect(within(cartao).getByText("Casa com piscina até 950 mil")).toBeTruthy();
    expect(within(cartao).getByText("Quente · 85")).toBeTruthy();
    expect(within(cartao).getByText("Recebido em 10/11/2026")).toBeTruthy();
    expect(within(cartao).queryByRole("combobox")).toBeNull();
  });

  it("move o contato ao soltar o cartão em outra coluna", async () => {
    render(React.createElement(ContatosPage));
    const cartao = await screen.findByRole("article", { name: "Ana Souza" });
    arrastar(cartao, coluna("Em contato"), ana.id);

    await waitFor(() =>
      expect(
        within(coluna("Em contato")).getByRole("article", {
          name: "Ana Souza",
        }),
      ).toBeTruthy(),
    );
    expect(within(coluna("Novo")).queryByRole("article")).toBeNull();
    const [url, init] = chamadas("/api/leads/")[0];
    expect(url).toBe(`/api/leads/${ana.id}`);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ stage: "QUALIFYING" });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("devolve o contato à etapa anterior quando o servidor recusa", async () => {
    responder({
      alterar: () =>
        json({ error: "Você não tem permissão para esta ação." }, 403),
    });
    render(React.createElement(ContatosPage));
    const cartao = await screen.findByRole("article", { name: "Ana Souza" });
    arrastar(cartao, coluna("Visita agendada"), ana.id);

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Você não tem permissão para esta ação.",
    );
    expect(
      within(coluna("Novo")).getByRole("article", { name: "Ana Souza" }),
    ).toBeTruthy();
    expect(within(coluna("Visita agendada")).queryByRole("article")).toBeNull();
  });

  it("não chama o servidor quando o cartão é solto na própria coluna", async () => {
    render(React.createElement(ContatosPage));
    const cartao = await screen.findByRole("article", { name: "Ana Souza" });
    arrastar(cartao, coluna("Novo"), ana.id);
    await waitFor(() => expect(chamadas("/api/leads")).toHaveLength(1));
    expect(chamadas("/api/leads/")).toHaveLength(0);
  });
});

describe("Imóveis sugeridos", () => {
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

  it("não oferece sugestão para contatos fechados ou perdidos", async () => {
    render(React.createElement(ContatosPage));
    await screen.findByRole("article", { name: "Ana Souza" });
    for (const nome of ["Carla Dias", "Davi Rocha"]) {
      const cartao = screen.getByRole("article", { name: nome });
      expect(
        within(cartao).queryByRole("button", { name: "Sugerir imóveis" }),
      ).toBeNull();
      expect(
        within(cartao).getByRole("button", { name: `Editar ${nome}` }),
      ).toBeTruthy();
    }
    expect(
      within(screen.getByRole("article", { name: "Bruno Lima" })).getByRole(
        "button",
        { name: "Sugerir imóveis" },
      ),
    ).toBeTruthy();
  });

  it("esconde as sugestões quando o contato é fechado", async () => {
    render(React.createElement(ContatosPage));
    const cartao = await screen.findByRole("article", { name: "Ana Souza" });
    fireEvent.click(
      within(cartao).getByRole("button", { name: "Sugerir imóveis" }),
    );
    await screen.findByRole("list", {
      name: "Imóveis sugeridos para Ana Souza",
    });
    arrastar(cartao, coluna("Fechado"), ana.id);

    await waitFor(() =>
      expect(
        within(coluna("Fechado")).getByRole("article", { name: "Ana Souza" }),
      ).toBeTruthy(),
    );
    expect(
      screen.queryByRole("list", { name: "Imóveis sugeridos para Ana Souza" }),
    ).toBeNull();
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
});

describe("Edição de um contato", () => {
  it("abre o diálogo com os dados atuais do contato", async () => {
    render(React.createElement(ContatosPage));
    const dialogo = await abrirEdicao("Ana Souza");
    expect(
      (within(dialogo).getByLabelText("Nome") as HTMLInputElement).value,
    ).toBe("Ana Souza");
    expect(
      (within(dialogo).getByLabelText("Telefone") as HTMLInputElement).value,
    ).toBe("(47) 99999-0001");
    expect(
      (within(dialogo).getByLabelText("E-mail (opcional)") as HTMLInputElement)
        .value,
    ).toBe("ana@example.com");
    expect(
      (within(dialogo).getByLabelText(/O que procura/) as HTMLTextAreaElement)
        .value,
    ).toBe("Casa com piscina até 950 mil");
    expect(
      (within(dialogo).getByLabelText("Etapa") as HTMLSelectElement).value,
    ).toBe("NEW");
  });

  it("envia só os campos alterados e atualiza o cartão", async () => {
    render(React.createElement(ContatosPage));
    const dialogo = await abrirEdicao("Ana Souza");
    fireEvent.change(within(dialogo).getByLabelText("Nome"), {
      target: { value: "  Ana Souza Lima " },
    });
    fireEvent.change(within(dialogo).getByLabelText("E-mail (opcional)"), {
      target: { value: "" },
    });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Salvar" }));

    expect(
      await screen.findByRole("article", { name: "Ana Souza Lima" }),
    ).toBeTruthy();
    const [url, init] = chamadas("/api/leads/", "PATCH")[0];
    expect(url).toBe(`/api/leads/${ana.id}`);
    expect(JSON.parse(init.body)).toEqual({ name: "Ana Souza Lima", email: "" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("muda a etapa pelo diálogo, para quem não pode arrastar", async () => {
    render(React.createElement(ContatosPage));
    const dialogo = await abrirEdicao("Ana Souza");
    fireEvent.change(within(dialogo).getByLabelText("Etapa"), {
      target: { value: "PROPOSAL" },
    });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(
        within(coluna("Proposta")).getByRole("article", { name: "Ana Souza" }),
      ).toBeTruthy(),
    );
    expect(JSON.parse(chamadas("/api/leads/", "PATCH")[0][1].body)).toEqual({
      stage: "PROPOSAL",
    });
  });

  it("descarta as sugestões antigas quando o pedido muda", async () => {
    render(React.createElement(ContatosPage));
    const cartao = await screen.findByRole("article", { name: "Ana Souza" });
    fireEvent.click(
      within(cartao).getByRole("button", { name: "Sugerir imóveis" }),
    );
    await screen.findByRole("list", {
      name: "Imóveis sugeridos para Ana Souza",
    });

    const dialogo = await abrirEdicao("Ana Souza");
    fireEvent.change(within(dialogo).getByLabelText(/O que procura/), {
      target: { value: "Apartamento no Centro até 600 mil" },
    });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Salvar" }));

    expect(
      await screen.findByText("Apartamento no Centro até 600 mil"),
    ).toBeTruthy();
    expect(
      screen.queryByRole("list", { name: "Imóveis sugeridos para Ana Souza" }),
    ).toBeNull();
    expect(
      within(screen.getByRole("article", { name: "Ana Souza" })).getByRole(
        "button",
        { name: "Sugerir imóveis" },
      ),
    ).toBeTruthy();
  });

  it("fecha sem chamar o servidor quando nada mudou", async () => {
    render(React.createElement(ContatosPage));
    const dialogo = await abrirEdicao("Ana Souza");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(chamadas("/api/leads/")).toHaveLength(0);
  });

  it("cancela sem alterar o contato", async () => {
    render(React.createElement(ContatosPage));
    const dialogo = await abrirEdicao("Ana Souza");
    fireEvent.change(within(dialogo).getByLabelText("Nome"), {
      target: { value: "Outro nome" },
    });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("article", { name: "Ana Souza" })).toBeTruthy();
    expect(chamadas("/api/leads/")).toHaveLength(0);
  });

  it("mostra a recusa do servidor dentro do diálogo e mantém os dados digitados", async () => {
    responder({
      alterar: () => json({ error: "Informe um telefone válido." }, 400),
    });
    render(React.createElement(ContatosPage));
    const dialogo = await abrirEdicao("Ana Souza");
    fireEvent.change(within(dialogo).getByLabelText("Telefone"), {
      target: { value: "123" },
    });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Salvar" }));

    expect((await within(dialogo).findByRole("alert")).textContent).toBe(
      "Informe um telefone válido.",
    );
    expect(
      (within(dialogo).getByLabelText("Telefone") as HTMLInputElement).value,
    ).toBe("123");
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});

describe("Exclusão de um contato", () => {
  it("o gestor exclui depois de confirmar", async () => {
    render(React.createElement(ContatosPage));
    const dialogo = await abrirEdicao("Ana Souza");
    fireEvent.click(
      within(dialogo).getByRole("button", { name: "Excluir contato" }),
    );
    // O primeiro clique só pede confirmação.
    expect(chamadas("/api/leads/", "DELETE")).toHaveLength(0);
    fireEvent.click(
      within(dialogo).getByRole("button", { name: "Confirmar exclusão" }),
    );

    await waitFor(() =>
      expect(screen.queryByRole("article", { name: "Ana Souza" })).toBeNull(),
    );
    expect(chamadas("/api/leads/", "DELETE")[0][0]).toBe(
      `/api/leads/${ana.id}`,
    );
    expect(screen.getByText("3 contatos")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("mantém o contato e avisa quando a exclusão falha", async () => {
    responder({
      excluir: () => json({ error: "Não foi possível excluir o contato." }, 500),
    });
    render(React.createElement(ContatosPage));
    const dialogo = await abrirEdicao("Ana Souza");
    fireEvent.click(
      within(dialogo).getByRole("button", { name: "Excluir contato" }),
    );
    fireEvent.click(
      within(dialogo).getByRole("button", { name: "Confirmar exclusão" }),
    );

    expect((await within(dialogo).findByRole("alert")).textContent).toBe(
      "Não foi possível excluir o contato.",
    );
    expect(screen.getByRole("article", { name: "Ana Souza" })).toBeTruthy();
  });

  it("o corretor não vê a opção de excluir", async () => {
    useTenantStore.setState({ currentUser: corretor });
    render(React.createElement(ContatosPage));
    const dialogo = await abrirEdicao("Ana Souza");
    expect(
      within(dialogo).queryByRole("button", { name: "Excluir contato" }),
    ).toBeNull();
    expect(within(dialogo).getByRole("button", { name: "Salvar" })).toBeTruthy();
  });
});

describe("Estados do quadro", () => {
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

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
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ImoveisPortfolioPage from "@/app/(portal)/imoveis/page";
import { useTenantStore } from "@/store/tenant-store";
import {
  SEED_PROPERTIES,
  SEED_TENANTS,
  SEED_USERS,
} from "@/server/seeds/seed-jaragua";
import type { ExternalListing } from "@/types/domain";

const originalSession = useTenantStore.getState();
const fetchMock = vi.fn();
let client: QueryClient;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const anuncio: ExternalListing = {
  id: "22222222-2222-4222-8222-222222222222",
  sourceId: "33333333-3333-4333-8333-333333333333",
  tenantId: SEED_TENANTS[0].id,
  url: "https://outrosite.com/imovel/9",
  title: "Apartamento 2 quartos no Czerniewicz",
  price: 420000,
  neighborhood: "Czerniewicz",
  city: "Jaraguá do Sul",
  bedrooms: 2,
  parkingSpots: 1,
  areaTotal: 68,
  imageUrl: null,
  purpose: "SALE",
  contentHash: "x",
  firstSeenAt: "2026-11-10T10:00:00.000Z",
  lastSeenAt: "2026-11-10T10:00:00.000Z",
};

const carteira = [
  { ...structuredClone(SEED_PROPERTIES[0]), addressNeighborhood: "Nereu Ramos" },
];

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  useTenantStore.setState({
    currentTenant: SEED_TENANTS[0],
    currentUser: SEED_USERS[0],
  });
  fetchMock.mockImplementation((url: string, init?: RequestInit) =>
    Promise.resolve(
      init?.method === "POST"
        ? json({ property: { id: "novo" } }, 201)
        : json({
            properties: carteira,
            auditLogs: [],
            externalListings: [anuncio],
            externalSources: [{ id: anuncio.sourceId, name: "Poder Imóveis", logoUrl: null }],
          }),
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
  useTenantStore.setState(originalSession);
});

function abrirPagina() {
  render(
    React.createElement(
      QueryClientProvider,
      { client },
      React.createElement(ImoveisPortfolioPage),
    ),
  );
}

describe("Página de imóveis", () => {
  it("abre o cadastro com os bairros conhecidos e os da carteira", async () => {
    abrirPagina();
    await screen.findByText(carteira[0].title);
    fireEvent.click(screen.getByRole("button", { name: "Novo Imóvel" }));

    expect(screen.getByRole("dialog", { name: "Cadastrar novo imóvel" })).toBeTruthy();
    const bairros = [
      ...document.querySelectorAll("#imovel-bairros option"),
    ].map((opcao) => opcao.getAttribute("value"));
    expect(bairros).toContain("Nereu Ramos");
    expect(bairros).toContain("Jaraguá Esquerdo");
    expect(new Set(bairros).size).toBe(bairros.length);
  });

  it("fecha o cadastro e recarrega a carteira depois de salvar", async () => {
    abrirPagina();
    await screen.findByText(carteira[0].title);
    fireEvent.click(screen.getByRole("button", { name: "Novo Imóvel" }));

    for (const [rotulo, valor] of Object.entries({
      "Título do imóvel *": "Casa nova no Centro",
      "Valor de venda *": "500000",
      "Bairro *": "Centro",
      "Rua e número *": "Rua A, 10",
      "Descrição *": "Casa nova.",
    }))
      fireEvent.change(screen.getByLabelText(rotulo), {
        target: { value: valor },
      });
    fireEvent.click(screen.getByRole("button", { name: "Salvar imóvel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // A carteira é pedida de novo para mostrar o imóvel cadastrado.
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([, init]) => init?.method !== "POST")
          .length,
      ).toBe(2),
    );
  });
});

describe("Edição e anúncios de outros sites", () => {
  it("abre a edição ao clicar no card do imóvel", async () => {
    abrirPagina();
    const titulo = await screen.findByText(carteira[0].title);
    fireEvent.click(titulo.closest(".rounded-2xl")!.querySelector("p")!);
    const dialogo = screen.getByRole("dialog", { name: "Editar imóvel" });
    expect(dialogo).toBeTruthy();
    expect(
      (screen.getByLabelText("Bairro *") as HTMLInputElement).value,
    ).toBe("Nereu Ramos");
  });

  it("abre a edição pelo título, para quem usa o teclado", async () => {
    abrirPagina();
    await screen.findByText(carteira[0].title);
    fireEvent.click(
      screen.getByRole("button", { name: `Editar ${carteira[0].code}` }),
    );
    expect(screen.getByRole("dialog", { name: "Editar imóvel" })).toBeTruthy();
  });

  it("não abre a edição ao clicar em excluir", async () => {
    abrirPagina();
    await screen.findByText(carteira[0].title);
    fireEvent.click(screen.getByTitle("Excluir imóvel"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("traz um anúncio de outro site para a carteira", async () => {
    abrirPagina();
    await screen.findByText(anuncio.title);
    expect(
      screen.getByRole("link", { name: "Ver na origem" }).getAttribute("href"),
    ).toBe(anuncio.url);
    fireEvent.click(
      screen.getByRole("button", {
        name: `Trazer ${anuncio.title} para a carteira`,
      }),
    );
    expect(
      screen.getByRole("dialog", { name: "Trazer para a minha carteira" }),
    ).toBeTruthy();
    expect(screen.getByText(/em Poder Imóveis/)).toBeTruthy();
    expect(
      (screen.getByLabelText("Valor de venda *") as HTMLInputElement).value,
    ).toBe("420.000");
  });

  it("não mostra edição nem importação para quem não tem permissão", async () => {
    useTenantStore.setState({
      currentUser: { ...SEED_USERS[0], role: "VIEWER" as never },
    });
    abrirPagina();
    await screen.findByText(anuncio.title);
    expect(screen.queryByRole("button", { name: /Trazer/ })).toBeNull();
    expect(
      screen.queryByRole("button", { name: `Editar ${carteira[0].code}` }),
    ).toBeNull();
  });
});

describe("Filtros da página de imóveis", () => {
  async function abrirFiltros() {
    abrirPagina();
    await screen.findByText(anuncio.title);
    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
    return screen.getByRole("region", { name: "Filtros de imóveis" });
  }

  it("abre e fecha o painel pelo botão", async () => {
    await abrirFiltros();
    const botao = screen.getByRole("button", { name: "Filtros" });
    expect(botao.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(botao);
    expect(screen.queryByRole("region", { name: "Filtros de imóveis" })).toBeNull();
  });

  it("filtra pela busca e mostra quantos aparecem", async () => {
    await abrirFiltros();
    fireEvent.change(screen.getByLabelText("Buscar"), {
      target: { value: "Czerniewicz" },
    });
    expect(screen.queryByText(carteira[0].title)).toBeNull();
    expect(screen.getByText(anuncio.title)).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe(
      "Mostrando 1 de 2 imóveis.",
    );
    expect(screen.getByLabelText("1 filtros ativos")).toBeTruthy();
  });

  it("filtra pelo valor máximo com máscara em reais", async () => {
    await abrirFiltros();
    const maximo = screen.getByLabelText("Valor máximo") as HTMLInputElement;
    fireEvent.change(maximo, { target: { value: "100000" } });
    expect(maximo.value).toBe("100.000");
    expect(screen.getByText("Nenhum imóvel encontrado com esses filtros.")).toBeTruthy();
  });

  it("limpa os filtros pelo aviso de lista vazia", async () => {
    await abrirFiltros();
    fireEvent.change(screen.getByLabelText("Buscar"), {
      target: { value: "nada parecido" },
    });
    const vazio = screen
      .getByText("Nenhum imóvel encontrado com esses filtros.")
      .closest("div")!;
    fireEvent.click(within(vazio).getByRole("button", { name: "Limpar filtros" }));
    expect(screen.getByText(carteira[0].title)).toBeTruthy();
    expect(screen.getByText(anuncio.title)).toBeTruthy();
    expect((screen.getByLabelText("Buscar") as HTMLInputElement).value).toBe("");
  });
});

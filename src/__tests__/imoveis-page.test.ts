// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ImoveisPortfolioPage from "@/app/(portal)/imoveis/page";
import { useTenantStore } from "@/store/tenant-store";
import {
  SEED_PROPERTIES,
  SEED_TENANTS,
  SEED_USERS,
} from "@/server/seeds/seed-jaragua";

const originalSession = useTenantStore.getState();
const fetchMock = vi.fn();
let client: QueryClient;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

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
        : json({ properties: carteira, auditLogs: [] }),
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

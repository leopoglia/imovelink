// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import BuscaIAPage from "@/app/(portal)/busca-ia/page";
import { useTenantStore } from "@/store/tenant-store";
import { SEED_PROPERTIES, SEED_TENANTS } from "@/server/seeds/seed-jaragua";
import type { HybridSearchResponse } from "@/types/domain";

const initialSession = useTenantStore.getState();
const fetchMock = vi.fn();
const clipboard = vi.fn();
const response: HybridSearchResponse = {
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
  results: [
    {
      property: SEED_PROPERTIES[0],
      hybridScore: 90,
      attributeScore: 100,
      semanticScore: 60,
      geoScore: 100,
      distanceKm: null,
      matchReasons: ["Com piscina", "Dentro do orçamento"],
    },
  ],
  executionTimeMs: 4,
  totalCandidatesEvaluated: 8,
  interpretation: { mode: "local", reason: "not_configured" },
};
beforeEach(() => {
  vi.clearAllMocks();
  useTenantStore.setState({ currentTenant: SEED_TENANTS[0] });
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(new Response(JSON.stringify(response)));
  clipboard.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: clipboard },
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useTenantStore.setState(initialSession);
});

function submit(text = "Casa com piscina até 950 mil") {
  fireEvent.change(screen.getByRole("textbox"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Buscar imóveis" }));
}

describe("Tela de busca inteligente", () => {
  it("começa vazia e só busca quando solicitado, exibindo critérios em português e o modo real", async () => {
    render(React.createElement(BuscaIAPage));
    expect(fetchMock).not.toHaveBeenCalled();
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
    expect(
      (
        screen.getByRole("button", {
          name: "Buscar imóveis",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    submit();
    expect(
      await screen.findByRole("heading", { name: "1 imóvel encontrado" }),
    ).toBeTruthy();
    expect(screen.getByText("Até R$ 950.000")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(
      "IA ainda não configurada",
    );
    expect(screen.queryByText("HOUSE")).toBeNull();
    expect(screen.queryByText(/90%/)).toBeNull();
  });

  it("mantém o texto da última busca ao alternar disponibilidade", async () => {
    render(React.createElement(BuscaIAPage));
    submit("Casa com jardim no Centro");
    await screen.findByRole("heading", { name: "1 imóvel encontrado" });
    fireEvent.click(screen.getByRole("checkbox", { name: "Só disponíveis" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      query: "Casa com jardim no Centro",
      onlyAvailable: false,
    });
  });

  it("permite buscar com um exemplo e limpar quando não há resultado", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ...response, results: [] })),
    );
    render(React.createElement(BuscaIAPage));
    fireEvent.click(screen.getByRole("button", { name: "Casa com piscina" }));
    expect(
      await screen.findByText("Nenhum imóvel atende a essa busca."),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Limpar busca" }));
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
    expect(
      screen.queryByRole("region", { name: "Resultados da busca" }),
    ).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("textbox"));
  });

  it("exibe erro de rede e permite tentar novamente", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Falha de conexão"));
    render(React.createElement(BuscaIAPage));
    submit();
    expect(await screen.findByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Buscar imóveis" }));
    expect(
      await screen.findByRole("heading", { name: "1 imóvel encontrado" }),
    ).toBeTruthy();
  });

  it("só confirma a cópia após sucesso e informa uma falha de permissão", async () => {
    render(React.createElement(BuscaIAPage));
    submit();
    const button = await screen.findByRole("button", {
      name: `Copiar imóvel ${SEED_PROPERTIES[0].code}`,
    });
    fireEvent.click(button);
    await waitFor(() => expect(button.textContent).toContain("Copiado"));
    expect(clipboard.mock.calls[0][0]).toContain(SEED_PROPERTIES[0].title);
    expect(clipboard.mock.calls[0][0]).not.toContain("compatibilidade");
    clipboard.mockRejectedValueOnce(new Error("Permission denied"));
    fireEvent.click(button);
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Não foi possível copiar. Tente novamente.",
    );
  });

  it("descarta uma resposta atrasada de outra imobiliária", async () => {
    let finish!: (value: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    render(React.createElement(BuscaIAPage));
    submit();
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    act(() =>
      useTenantStore.setState({
        currentTenant: { ...SEED_TENANTS[0], id: "other-tenant" },
      }),
    );
    expect(signal.aborted).toBe(true);
    await act(async () => {
      finish(new Response(JSON.stringify(response)));
    });
    expect(
      screen.queryByRole("region", { name: "Resultados da busca" }),
    ).toBeNull();
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
  });
});

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
import MinhaVitrinePage from "@/app/(portal)/minha-vitrine/page";
import { useTenantStore } from "@/store/tenant-store";
import { settingsQueryKey } from "@/lib/settings";
import {
  SEED_PROPERTIES,
  SEED_TENANTS,
  SEED_USERS,
} from "@/server/seeds/seed-jaragua";
import type { AccountSettings, Property } from "@/types/domain";

const originalSession = useTenantStore.getState();
let client: QueryClient;
let settings: AccountSettings;
let imoveis: Property[];

const imovel = (extra: Partial<Property>): Property => ({
  ...structuredClone(SEED_PROPERTIES[0]),
  ...extra,
});

function abrir() {
  client.setQueryData(
    settingsQueryKey(settings.tenant.id, settings.user.id),
    settings,
  );
  client.setQueryData(["properties", settings.tenant.id, "vitrine"], {
    properties: imoveis,
  });
  return render(
    React.createElement(
      QueryClientProvider,
      { client },
      React.createElement(MinhaVitrinePage),
    ),
  );
}

beforeEach(() => {
  settings = {
    user: structuredClone(SEED_USERS[0]),
    tenant: structuredClone(SEED_TENANTS[0]),
  };
  imoveis = [
    imovel({ id: "p1", code: "IMV-1", title: "Casa no Centro" }),
    imovel({ id: "p2", code: "IMV-2", title: "Apto reservado", status: "RESERVED" }),
    imovel({ id: "p3", code: "IMV-3", title: "Sobrado vendido", status: "SOLD" }),
  ];
  client = new QueryClient({
    defaultOptions: {
      queries: { staleTime: Infinity, retry: false },
      mutations: { retry: false },
    },
  });
  useTenantStore.setState({
    currentUser: settings.user,
    currentTenant: settings.tenant,
    isAuthenticated: true,
  });
});

afterEach(() => {
  cleanup();
  client.clear();
  useTenantStore.setState(originalSession);
  vi.unstubAllGlobals();
});

describe("Editor da vitrine", () => {
  it("abre a vitrine pública e lista só os imóveis que podem ir para ela", () => {
    abrir();
    expect(
      screen.getByRole("link", { name: "Abrir vitrine" }).getAttribute("href"),
    ).toBe(`/vitrine/${settings.tenant.slug}`);
    expect(screen.getByLabelText(/Casa no Centro/)).toHaveProperty("checked", true);
    expect(screen.getByLabelText(/Apto reservado/)).toHaveProperty("checked", true);
    expect(screen.queryByText("Sobrado vendido")).toBeNull();
    expect(screen.getByText("2 de 2 aparecem")).toBeTruthy();
  });

  it("não mostra prévia nem o endereço escrito na tela", () => {
    abrir();
    expect(
      screen.queryByRole("complementary", { name: "Prévia da vitrine" }),
    ).toBeNull();
    expect(screen.queryByText(/\/vitrine\//)).toBeNull();
  });

  it("copia o endereço completo da vitrine", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Copiar link" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Link copiado" }),
      ).toBeTruthy(),
    );
    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/vitrine/${settings.tenant.slug}`,
    );
  });

  it("salva textos e imóveis escondidos na seção vitrine", async () => {
    const salvo: AccountSettings = {
      ...settings,
      tenant: {
        ...settings.tenant,
        branding: {
          ...settings.tenant.branding,
          headline: "Seu próximo endereço",
          hiddenPropertyIds: ["p2"],
        },
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => salvo });
    vi.stubGlobal("fetch", fetchMock);
    abrir();

    const salvar = screen.getByRole("button", { name: "Salvar vitrine" });
    expect(salvar).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("Título"), {
      target: { value: "Seu próximo endereço" },
    });
    fireEvent.click(screen.getByLabelText(/Apto reservado/));
    expect(screen.getByText("1 de 2 aparecem")).toBeTruthy();
    fireEvent.click(salvar);

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe("Vitrine atualizada."),
    );
    const [url, opcoes] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/settings");
    expect(JSON.parse(opcoes.body)).toMatchObject({
      section: "vitrine",
      values: { headline: "Seu próximo endereço", hiddenPropertyIds: ["p2"] },
    });
    expect(useTenantStore.getState().currentTenant.branding.headline).toBe(
      "Seu próximo endereço",
    );
    expect(salvar).toHaveProperty("disabled", true);
  });

  it("esconder e mostrar de novo o mesmo imóvel não conta como alteração", () => {
    abrir();
    const casa = screen.getByLabelText(/Casa no Centro/);
    fireEvent.click(casa);
    fireEvent.click(casa);
    expect(
      screen.getByRole("button", { name: "Salvar vitrine" }),
    ).toHaveProperty("disabled", true);
  });

  it("mostra o erro do servidor e mantém o que foi digitado", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Escolha uma cor válida." }),
      }),
    );
    abrir();
    fireEvent.change(screen.getByLabelText("Subtítulo"), {
      target: { value: "Novo subtítulo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar vitrine" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "Escolha uma cor válida.",
      ),
    );
    expect(screen.getByLabelText("Subtítulo")).toHaveProperty(
      "value",
      "Novo subtítulo",
    );
  });

  it("deixa o corretor só ver a vitrine, sem salvar", () => {
    settings.user = structuredClone(SEED_USERS[1]);
    useTenantStore.setState({ currentUser: settings.user });
    abrir();
    expect(screen.getByLabelText("Título").matches(":disabled")).toBe(true);
    expect(screen.queryByRole("button", { name: "Salvar vitrine" })).toBeNull();
    expect(
      screen.getByText("Somente gestores podem editar a vitrine."),
    ).toBeTruthy();
  });
});

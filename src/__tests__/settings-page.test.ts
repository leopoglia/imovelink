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
import ConfiguracoesPage from "@/app/(portal)/configuracoes/page";
import { useTenantStore } from "@/store/tenant-store";
import { settingsQueryKey } from "@/lib/settings";
import { SEED_TENANTS, SEED_USERS } from "@/server/seeds/seed-jaragua";
import { AccountSettings } from "@/types/domain";

const originalSession = useTenantStore.getState();
let client: QueryClient;
let settings: AccountSettings;

function mountPage() {
  client.setQueryData(
    settingsQueryKey(settings.tenant.id, settings.user.id),
    settings,
  );
  return render(
    React.createElement(
      QueryClientProvider,
      { client },
      React.createElement(ConfiguracoesPage),
    ),
  );
}

beforeEach(() => {
  settings = {
    user: structuredClone(SEED_USERS[0]),
    tenant: structuredClone(SEED_TENANTS[0]),
  };
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

describe("Página de configurações", () => {
  it("troca entre o perfil e os dados da imobiliária", () => {
    mountPage();
    expect(screen.getByLabelText("Nome")).toHaveProperty(
      "value",
      settings.user.name,
    );
    fireEvent.click(screen.getByRole("button", { name: "Imobiliária" }));
    expect(screen.getByLabelText("Nome da imobiliária")).toHaveProperty(
      "value",
      settings.tenant.name,
    );
    expect(screen.getByLabelText("E-mail de contato")).toHaveProperty(
      "value",
      settings.tenant.branding.email,
    );
  });

  it("salva o formulário e atualiza a sessão e o cache", async () => {
    const updated = {
      ...settings,
      user: { ...settings.user, name: "Novo nome" },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => updated });
    vi.stubGlobal("fetch", fetchMock);
    mountPage();
    expect(
      screen.getByRole("button", { name: "Salvar alterações" }),
    ).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("Nome"), {
      target: { value: "Novo nome" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe("Alterações salvas."),
    );
    expect(useTenantStore.getState().currentUser.name).toBe("Novo nome");
    expect(
      client.getQueryData(
        settingsQueryKey(settings.tenant.id, settings.user.id),
      ),
    ).toEqual(updated);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      section: "profile",
      values: { name: "Novo nome" },
    });
  });

  it("mantém a edição e informa quando o servidor rejeita a alteração", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({
          ok: false,
          json: async () => ({ error: "Este e-mail já está em uso." }),
        }),
    );
    mountPage();
    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "outro@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "Este e-mail já está em uso.",
      ),
    );
    expect(screen.getByLabelText("E-mail")).toHaveProperty(
      "value",
      "outro@example.com",
    );
    expect(useTenantStore.getState().currentUser.email).toBe(
      settings.user.email,
    );
  });

  it("exibe os dados da imobiliária como somente leitura para corretores", () => {
    settings.user = structuredClone(SEED_USERS[1]);
    useTenantStore.setState({ currentUser: settings.user });
    mountPage();
    fireEvent.click(screen.getByRole("button", { name: "Imobiliária" }));
    expect(screen.getByLabelText("Nome da imobiliária")).toHaveProperty(
      "readOnly",
      true,
    );
    expect(
      screen.queryByRole("button", { name: "Salvar alterações" }),
    ).toBeNull();
  });
});

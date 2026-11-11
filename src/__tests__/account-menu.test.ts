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
import { AppShell } from "@/components/layout/app-shell";
import { useTenantStore } from "@/store/tenant-store";
import { settingsQueryKey } from "@/lib/settings";
import { SEED_TENANTS, SEED_USERS } from "@/server/seeds/seed-jaragua";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

const originalSession = useTenantStore.getState();
let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  const user = structuredClone(SEED_USERS[0]);
  const tenant = structuredClone(SEED_TENANTS[0]);
  useTenantStore.setState({
    currentUser: user,
    currentTenant: tenant,
    isAuthenticated: true,
  });
  client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  client.setQueryData(settingsQueryKey(tenant.id, user.id), { user, tenant });
});
afterEach(() => {
  cleanup();
  client.clear();
  useTenantStore.setState(originalSession);
  vi.unstubAllGlobals();
});

function mountShell() {
  return render(
    React.createElement(
      QueryClientProvider,
      { client },
      React.createElement(AppShell, null, "Conteúdo"),
    ),
  );
}

describe("Menu da conta no cabeçalho", () => {
  it("remove o perfil da lateral e mostra a conta e as configurações ao abrir o avatar", async () => {
    mountShell();
    const sidebar = screen.getByRole("complementary");
    expect(within(sidebar).queryByText(SEED_USERS[0].name)).toBeNull();
    expect(
      screen.queryByRole("menuitem", { name: "Sair da conta" }),
    ).toBeNull();
    const trigger = within(screen.getByRole("banner")).getByRole("button", {
      name: "Abrir menu da conta",
    });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const menu = await screen.findByRole("menu", { name: "Minha conta" });
    expect(getComputedStyle(document.body).overflow).not.toBe("hidden");
    expect(getComputedStyle(document.body).pointerEvents).not.toBe("none");
    expect(within(menu).getByText(SEED_USERS[0].name)).toBeTruthy();
    expect(within(menu).getByText(SEED_USERS[0].email)).toBeTruthy();
    expect(
      within(menu)
        .getByRole("menuitem", { name: "Configurações" })
        .getAttribute("href"),
    ).toBe("/configuracoes");
    expect(useTenantStore.getState().isAuthenticated).toBe(true);
  });

  it("encerra a sessão e abre o login ao selecionar Sair da conta", async () => {
    mountShell();
    fireEvent.keyDown(
      screen.getByRole("button", { name: "Abrir menu da conta" }),
      { key: "ArrowDown" },
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Sair da conta" }),
    );
    await waitFor(() => expect(useTenantStore.getState().isAuthenticated).toBe(false));
    expect(push).toHaveBeenCalledWith("/login");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("mantém a conta aberta e informa quando não consegue encerrar a sessão no servidor", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    mountShell();
    fireEvent.keyDown(screen.getByRole("button", { name: "Abrir menu da conta" }), { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Sair da conta" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(useTenantStore.getState().isAuthenticated).toBe(true);
    expect(push).not.toHaveBeenCalled();
  });

  it("fecha com Escape e devolve o foco ao avatar sem sair da conta", async () => {
    mountShell();
    const trigger = screen.getByRole("button", { name: "Abrir menu da conta" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(await screen.findByRole("menu"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(useTenantStore.getState().isAuthenticated).toBe(true);
    expect(push).not.toHaveBeenCalled();
  });
});

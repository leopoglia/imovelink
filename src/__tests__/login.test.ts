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
import { LoginCarousel } from "@/components/login/login-carousel";
import LoginPage from "@/app/login/page";
import { SEED_USERS, SEED_TENANTS } from "@/server/seeds/seed-jaragua";
import { useTenantStore } from "@/store/tenant-store";
import {
  readRecentAccounts,
  rememberRecentAccount,
  writeRecentAccounts,
  RECENT_ACCOUNTS_KEY,
} from "@/lib/recent-accounts";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("next/image", () => ({
  default: ({
    fill: _fill,
    priority: _priority,
    quality: _quality,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & {
    fill?: boolean;
    priority?: boolean;
    quality?: number;
  }) => React.createElement("img", props),
}));

const initialSession = useTenantStore.getState();
function mediaQueries(reduced = false, desktop = true) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query.includes("reduced-motion") ? reduced : desktop,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}
const dot = (number: number) =>
  screen.getByRole("button", { name: new RegExp(`Exibir slide ${number}:`) });

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  writeRecentAccounts(SEED_USERS.slice(0, 2));
  mediaQueries();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
});
afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  useTenantStore.setState(initialSession);
});

describe("Carrossel do login", () => {
  beforeEach(() => vi.useFakeTimers());

  it("mantém apenas os indicadores e retorna ao início automaticamente", () => {
    render(React.createElement(LoginCarousel));
    expect(screen.getAllByRole("button")).toHaveLength(3);
    expect(dot(1).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(dot(2));
    expect(dot(2).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(dot(3));
    act(() => vi.advanceTimersByTime(6500));
    expect(dot(1).getAttribute("aria-pressed")).toBe("true");
  });

  it("continua passando com o ponteiro e o foco sobre o carrossel", () => {
    render(React.createElement(LoginCarousel));
    act(() => vi.advanceTimersByTime(6500));
    expect(dot(2).getAttribute("aria-pressed")).toBe("true");
    const region = screen.getByRole("region", {
      name: "Recursos do Imovelink",
    });
    fireEvent.pointerEnter(region);
    fireEvent.focus(dot(2));
    act(() => vi.advanceTimersByTime(6500));
    expect(dot(3).getAttribute("aria-pressed")).toBe("true");
    fireEvent.pointerLeave(region);
    act(() => vi.advanceTimersByTime(6500));
    expect(dot(1).getAttribute("aria-pressed")).toBe("true");
  });

  it("reinicia o tempo após escolher um indicador sem interromper a rotação", () => {
    render(React.createElement(LoginCarousel));
    act(() => vi.advanceTimersByTime(6000));
    fireEvent.click(dot(3));
    act(() => vi.advanceTimersByTime(500));
    expect(dot(3).getAttribute("aria-pressed")).toBe("true");
    act(() => vi.advanceTimersByTime(6000));
    expect(dot(1).getAttribute("aria-pressed")).toBe("true");
  });

  it("economiza o temporizador quando a aba está oculta e retoma ao voltar", () => {
    render(React.createElement(LoginCarousel));
    const visibility = vi.spyOn(document, "visibilityState", "get");
    visibility.mockReturnValue("hidden");
    fireEvent(document, new Event("visibilitychange"));
    act(() => vi.advanceTimersByTime(13000));
    expect(dot(1).getAttribute("aria-pressed")).toBe("true");
    visibility.mockReturnValue("visible");
    fireEvent(document, new Event("visibilitychange"));
    act(() => vi.advanceTimersByTime(6500));
    expect(dot(2).getAttribute("aria-pressed")).toBe("true");
  });

  it("mantém a troca automática sem depender dos efeitos de transição", () => {
    mediaQueries(true);
    render(React.createElement(LoginCarousel));
    act(() => vi.advanceTimersByTime(6500));
    expect(dot(2).getAttribute("aria-pressed")).toBe("true");
  });

  it("não gira quando oculto no celular e limpa o temporizador ao desmontar", () => {
    mediaQueries(false, false);
    const view = render(React.createElement(LoginCarousel));
    act(() => vi.advanceTimersByTime(13000));
    expect(dot(1).getAttribute("aria-pressed")).toBe("true");
    view.unmount();
    mediaQueries();
    const desktopView = render(React.createElement(LoginCarousel));
    expect(vi.getTimerCount()).toBe(1);
    desktopView.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("Formulário do login", () => {
  it("entra na conta recente sem preencher senha nem clicar no botão Entrar", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ user: SEED_USERS[1], tenant: SEED_TENANTS[0] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(React.createElement(LoginPage));
    expect(screen.getByRole("button", { name: "Entrar" })).toHaveProperty(
      "disabled",
      true,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Usar conta de Marina Becker" }),
    );
    expect(screen.getByLabelText("E-mail de acesso")).toHaveProperty(
      "value",
      "",
    );
    expect(screen.getByLabelText("Senha")).toHaveProperty("value", "");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      action: "QUICK_LOGIN",
      userId: SEED_USERS[1].id,
    });
    expect(useTenantStore.getState().currentUser.id).toBe(SEED_USERS[1].id);
  });

  it("mostra o carregamento na conta escolhida e impede cliques duplicados", async () => {
    let complete!: (value: unknown) => void;
    const fetchMock = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(React.createElement(LoginPage));
    fireEvent.change(screen.getByLabelText("E-mail de acesso"), {
      target: { value: "outra@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Senha"), {
      target: { value: "senha-digitada" },
    });
    const account = screen.getByRole("button", {
      name: "Usar conta de Marina Becker",
    });
    fireEvent.click(account);
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe("Entrando…"),
    );
    expect(screen.getByLabelText("E-mail de acesso")).toHaveProperty(
      "value",
      "outra@example.com",
    );
    expect(screen.getByLabelText("Senha")).toHaveProperty(
      "value",
      "senha-digitada",
    );
    expect(account).toHaveProperty("disabled", true);
    fireEvent.click(account);
    expect(fetchMock).toHaveBeenCalledOnce();
    await act(async () =>
      complete({
        ok: true,
        json: async () => ({ user: SEED_USERS[1], tenant: SEED_TENANTS[0] }),
      }),
    );
    expect(push).toHaveBeenCalledOnce();
  });

  it("permite renovar com senha quando o acesso lembrado expirou", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          error: "Este acesso expirou. Entre com sua senha novamente.",
        }),
      }),
    );
    render(React.createElement(LoginPage));
    fireEvent.click(
      screen.getByRole("button", { name: "Usar conta de Marina Becker" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "Este acesso expirou.",
      ),
    );
    expect(document.activeElement).toBe(screen.getByLabelText("Senha"));
    expect(screen.getByLabelText("E-mail de acesso")).toHaveProperty(
      "value",
      "",
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("envia as credenciais, atualiza a sessão e abre o painel", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ user: SEED_USERS[0], tenant: SEED_TENANTS[0] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(React.createElement(LoginPage));
    fireEvent.change(screen.getByLabelText("E-mail de acesso"), {
      target: { value: SEED_USERS[0].email },
    });
    fireEvent.change(screen.getByLabelText("Senha"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      action: "LOGIN",
      email: SEED_USERS[0].email,
      password: "123456",
    });
    expect(useTenantStore.getState().currentUser.id).toBe(SEED_USERS[0].id);
    expect(readRecentAccounts()[0].id).toBe(SEED_USERS[0].id);
  });

  it("mostra o erro de acesso e permite corrigir os campos", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Credenciais inválidas." }),
      }),
    );
    render(React.createElement(LoginPage));
    fireEvent.change(screen.getByLabelText("E-mail de acesso"), {
      target: { value: "teste@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Senha"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "Credenciais inválidas.",
      ),
    );
    expect(screen.getByLabelText("E-mail de acesso")).toHaveProperty(
      "disabled",
      false,
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("remove contas da lista e mantém a remoção ao abrir o login novamente", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const page = render(React.createElement(LoginPage));
    fireEvent.click(
      screen.getByRole("button", {
        name: `Remover ${SEED_USERS[0].name} das contas recentes`,
      }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: `Remover ${SEED_USERS[1].name} das contas recentes`,
      }),
    );
    expect(
      screen.queryByRole("heading", { name: "Acessos recentes" }),
    ).toBeNull();
    page.unmount();
    render(React.createElement(LoginPage));
    expect(
      screen.queryByRole("heading", { name: "Acessos recentes" }),
    ).toBeNull();
    expect(readRecentAccounts()).toEqual([]);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).action).toBe(
      "FORGET_RECENT",
    );
  });
});

describe("Histórico de contas recentes", () => {
  it("não apresenta contas de demonstração como acessos já autorizados", () => {
    window.localStorage.clear();
    expect(readRecentAccounts()).toEqual([]);
  });
  it("atualiza a ordem sem duplicar contas e armazena apenas nome, e-mail e identificador", () => {
    const credentials = {
      ...SEED_USERS[1],
      password: "secret",
      token: "secret-token",
    };
    rememberRecentAccount(credentials);
    expect(readRecentAccounts()[0].id).toBe(SEED_USERS[1].id);
    expect(readRecentAccounts()).toHaveLength(2);
    const stored = JSON.parse(
      window.localStorage.getItem(RECENT_ACCOUNTS_KEY)!,
    );
    expect(Object.keys(stored[0]).sort()).toEqual(["email", "id", "name"]);
    expect(JSON.stringify(stored)).not.toContain("secret");
  });

  it("limita o histórico e atualiza dados alterados de uma conta existente", () => {
    writeRecentAccounts([]);
    for (let index = 0; index < 5; index++)
      rememberRecentAccount({
        id: `u${index}`,
        name: `Usuário ${index}`,
        email: `user${index}@example.com`,
      });
    expect(readRecentAccounts()).toHaveLength(3);
    rememberRecentAccount({
      id: "u4",
      name: "Nome atualizado",
      email: "novo@example.com",
    });
    expect(readRecentAccounts()[0]).toMatchObject({
      id: "u4",
      name: "Nome atualizado",
      email: "novo@example.com",
    });
    expect(readRecentAccounts()).toHaveLength(3);
  });

  it("tolera dados inválidos e armazenamento indisponível", () => {
    window.localStorage.setItem(RECENT_ACCOUNTS_KEY, "invalid-json");
    expect(readRecentAccounts()).toEqual([]);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    expect(() => rememberRecentAccount(SEED_USERS[0])).not.toThrow();
  });
});

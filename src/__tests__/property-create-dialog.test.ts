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
import {
  PropertyCreateDialog,
  formatarMilhar,
  somenteDigitos,
} from "@/components/property-create-dialog";

const fetchMock = vi.fn();
const onClose = vi.fn();
const onCreated = vi.fn();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function abrir() {
  render(
    React.createElement(PropertyCreateDialog, {
      bairros: ["Centro", "Vila Nova"],
      onClose,
      onCreated,
    }),
  );
}

const campo = (rotulo: string) => screen.getByLabelText(rotulo) as HTMLInputElement;

function preencher(valores: Record<string, string>) {
  for (const [rotulo, valor] of Object.entries(valores))
    fireEvent.change(campo(rotulo), { target: { value: valor } });
}

const COMPLETO = {
  "Título do imóvel *": "Casa com piscina no Centro",
  "Valor de venda *": "850000",
  "Bairro *": "Centro",
  "Rua e número *": "Rua Marechal Deodoro, 450",
  "Descrição *": "Casa térrea com piscina e quintal.",
};

const salvar = () =>
  fireEvent.click(screen.getByRole("button", { name: "Salvar imóvel" }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Máscara do valor de venda", () => {
  it("guarda só os dígitos e mostra com separador de milhar", () => {
    expect(somenteDigitos("R$ 1.250.000")).toBe("1250000");
    expect(somenteDigitos("00450")).toBe("450");
    expect(somenteDigitos("abc")).toBe("");
    expect(formatarMilhar("1250000")).toBe("1.250.000");
    expect(formatarMilhar("")).toBe("");
  });

  it("formata o valor enquanto a pessoa digita", () => {
    abrir();
    fireEvent.change(campo("Valor de venda *"), {
      target: { value: "4500000" },
    });
    expect(campo("Valor de venda *").value).toBe("4.500.000");
    fireEvent.change(campo("Valor de venda *"), {
      target: { value: "4.500.0001" },
    });
    expect(campo("Valor de venda *").value).toBe("45.000.001");
  });
});

describe("Cadastro de imóvel", () => {
  it("não tem mais o campo de comodidades e sugere os bairros", () => {
    abrir();
    expect(screen.queryByText(/Comodidades/)).toBeNull();
    const opcoes = document.querySelectorAll("#imovel-bairros option");
    expect([...opcoes].map((opcao) => opcao.getAttribute("value"))).toEqual([
      "Centro",
      "Vila Nova",
    ]);
    expect(campo("Bairro *").getAttribute("list")).toBe("imovel-bairros");
  });

  it.each([
    [{}, "Informe o título do imóvel (pelo menos 3 letras)."],
    [{ "Valor de venda *": "" }, "Informe o valor de venda."],
    [{ "Bairro *": "  " }, "Informe o bairro."],
    [{ "Rua e número *": "" }, "Informe a rua e o número."],
    [{ "Link da foto": "foto.jpg" }, "O link da foto precisa começar com https://."],
    [{ "Descrição *": "" }, "Escreva uma descrição do imóvel."],
  ])("mostra o que falta sem chamar o servidor (%o)", (troca, mensagem) => {
    abrir();
    preencher(
      Object.keys(troca).length === 0
        ? { ...COMPLETO, "Título do imóvel *": "" }
        : { ...COMPLETO, ...troca },
    );
    salvar();
    expect(screen.getByRole("alert").textContent).toBe(mensagem);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("envia o imóvel com o valor numérico e a foto informada", async () => {
    const criado = { id: "novo", code: "IMV-999" };
    fetchMock.mockResolvedValue(json({ property: criado }, 201));
    abrir();
    preencher({
      ...COMPLETO,
      "Quartos": "3",
      "Vagas": "2",
      "Link da foto": "https://exemplo.com/casa.jpg",
    });
    salvar();

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(criado));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/properties");
    expect(init.method).toBe("POST");
    const corpo = JSON.parse(init.body);
    expect(corpo).toMatchObject({
      title: "Casa com piscina no Centro",
      price: 850000,
      addressNeighborhood: "Centro",
      addressStreet: "Rua Marechal Deodoro, 450",
      bedrooms: 3,
      parkingSpots: 2,
      images: ["https://exemplo.com/casa.jpg"],
    });
    expect(corpo).not.toHaveProperty("amenities");
  });

  it("aceita bairro digitado fora da lista e cadastra sem foto", async () => {
    fetchMock.mockResolvedValue(json({ property: { id: "x" } }, 201));
    abrir();
    preencher({ ...COMPLETO, "Bairro *": "Nereu Ramos" });
    salvar();
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    const corpo = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(corpo.addressNeighborhood).toBe("Nereu Ramos");
    expect(corpo.images).toEqual([]);
  });

  it("mostra a recusa do servidor e mantém o formulário aberto", async () => {
    fetchMock.mockResolvedValue(
      json({ error: "Confira os dados do imóvel." }, 400),
    );
    abrir();
    preencher(COMPLETO);
    salvar();
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Confira os dados do imóvel.",
    );
    expect(onCreated).not.toHaveBeenCalled();
    expect(campo("Título do imóvel *").value).toBe("Casa com piscina no Centro");
    expect(
      (screen.getByRole("button", { name: "Salvar imóvel" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("mostra uma mensagem genérica quando a rede falha", async () => {
    fetchMock.mockRejectedValue("sem rede");
    abrir();
    preencher(COMPLETO);
    salvar();
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Não foi possível cadastrar o imóvel.",
    );
  });

  it("mostra a prévia da foto e avisa quando o link não carrega", () => {
    abrir();
    preencher({ "Link da foto": "https://exemplo.com/casa.jpg" });
    const previa = screen.getByAltText("Prévia da foto do imóvel");
    expect(previa.getAttribute("src")).toBe("https://exemplo.com/casa.jpg");
    fireEvent.error(previa);
    expect(screen.getByRole("status").textContent).toContain(
      "Não foi possível carregar essa imagem",
    );
  });

  it("fecha pelo Cancelar, pelo X e pela tecla Esc", () => {
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Fechar cadastro de imóvel" }),
    );
    fireEvent.keyDown(campo("Título do imóvel *"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});

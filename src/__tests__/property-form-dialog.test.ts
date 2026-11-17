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
  ModoDoFormulario,
  PropertyFormDialog,
  camposDoAnuncio,
  formatarMilhar,
  somenteDigitos,
} from "@/components/property-form-dialog";
import { SEED_PROPERTIES } from "@/server/seeds/seed-jaragua";
import type { ExternalListing, Property } from "@/types/domain";

const fetchMock = vi.fn();
const onClose = vi.fn();
const onSaved = vi.fn();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function abrir(modo: ModoDoFormulario = { tipo: "novo" }) {
  render(
    React.createElement(PropertyFormDialog, {
      modo,
      bairros: ["Centro", "Vila Nova"],
      onClose,
      onSaved,
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

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(criado));
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
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
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
    expect(onSaved).not.toHaveBeenCalled();
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
      "Não foi possível salvar o imóvel.",
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
      screen.getByRole("button", { name: "Fechar formulário do imóvel" }),
    );
    fireEvent.keyDown(campo("Título do imóvel *"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});

const imovel: Property = {
  ...structuredClone(SEED_PROPERTIES[0]),
  id: "11111111-1111-4111-8111-111111111111",
  title: "Casa no Centro",
  price: 900000,
  addressNeighborhood: "Centro",
  addressStreet: "Rua A, 1",
  description: "Casa ampla.",
  images: ["https://exemplo.com/a.jpg", "https://exemplo.com/b.jpg"],
};

describe("Edição de imóvel", () => {
  it("abre com os dados do imóvel preenchidos", () => {
    abrir({ tipo: "editar", imovel });
    expect(screen.getByRole("dialog", { name: "Editar imóvel" })).toBeTruthy();
    expect(campo("Título do imóvel *").value).toBe("Casa no Centro");
    expect(campo("Valor de venda *").value).toBe("900.000");
    expect(campo("Bairro *").value).toBe("Centro");
    expect(campo("Link da foto").value).toBe("https://exemplo.com/a.jpg");
  });

  it("envia só o que mudou", async () => {
    const alterado = { ...imovel, price: 850000 };
    fetchMock.mockResolvedValue(json({ property: alterado }));
    abrir({ tipo: "editar", imovel });
    preencher({ "Valor de venda *": "850000", "Bairro *": "Vila Nova" });
    salvar();

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(alterado));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/properties/${imovel.id}`);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({
      updates: { price: 850000, addressNeighborhood: "Vila Nova" },
    });
  });

  it("troca só a foto principal e mantém as outras", async () => {
    fetchMock.mockResolvedValue(json({ property: imovel }));
    abrir({ tipo: "editar", imovel });
    preencher({ "Link da foto": "https://exemplo.com/nova.jpg" });
    salvar();
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).updates).toEqual({
      images: ["https://exemplo.com/nova.jpg", "https://exemplo.com/b.jpg"],
    });
  });

  it("não chama o servidor quando nada mudou", async () => {
    abrir({ tipo: "editar", imovel });
    preencher({ "Link da foto": "" });
    salvar();
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(imovel));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("mostra a recusa do servidor ao editar", async () => {
    fetchMock.mockResolvedValue(json({}, 400));
    abrir({ tipo: "editar", imovel });
    preencher({ "Título do imóvel *": "Casa reformada no Centro" });
    salvar();
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Não foi possível alterar o imóvel.",
    );
    expect(onSaved).not.toHaveBeenCalled();
  });
});

const anuncio: ExternalListing = {
  id: "22222222-2222-4222-8222-222222222222",
  sourceId: "33333333-3333-4333-8333-333333333333",
  tenantId: "44444444-4444-4444-8444-444444444444",
  url: "https://outrosite.com/imovel/9",
  title: "Apartamento 2 quartos no Czerniewicz",
  price: 420000,
  neighborhood: "Czerniewicz",
  city: "Jaraguá do Sul",
  bedrooms: 2,
  parkingSpots: 1,
  areaTotal: 68.4,
  imageUrl: "https://outrosite.com/foto.jpg",
  purpose: "SALE",
  contentHash: "x",
  firstSeenAt: "2026-11-10T10:00:00.000Z",
  lastSeenAt: "2026-11-10T10:00:00.000Z",
};

describe("Trazer anúncio de outro site para a carteira", () => {
  it("preenche os dados factuais, sem foto nem descrição", () => {
    abrir({ tipo: "importar", anuncio, fonte: "Poder Imóveis" });
    expect(
      screen.getByRole("dialog", { name: "Trazer para a minha carteira" }),
    ).toBeTruthy();
    expect(campo("Título do imóvel *").value).toBe(anuncio.title);
    expect(campo("Valor de venda *").value).toBe("420.000");
    expect(campo("Bairro *").value).toBe("Czerniewicz");
    expect(campo("Quartos").value).toBe("2");
    expect(campo("Vagas").value).toBe("1");
    expect(campo("Área total (m²)").value).toBe("68");
    expect(campo("Link da foto").value).toBe("");
    expect(campo("Descrição *").value).toBe("");
    expect(screen.getByText(/em Poder Imóveis/)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Ver anúncio de origem" }).getAttribute("href"),
    ).toBe(anuncio.url);
  });

  it("cadastra como imóvel próprio à venda", async () => {
    fetchMock.mockResolvedValue(json({ property: { id: "novo" } }, 201));
    abrir({ tipo: "importar", anuncio });
    preencher({
      "Rua e número *": "Rua B, 20",
      "Descrição *": "Apartamento com sacada.",
    });
    salvar();
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/properties");
    expect(JSON.parse(init.body)).toMatchObject({
      title: anuncio.title,
      price: 420000,
      purpose: "SALE",
      addressNeighborhood: "Czerniewicz",
      images: [],
    });
  });

  it("deixa o valor e o bairro vazios quando o anúncio não informa", () => {
    expect(
      camposDoAnuncio({
        ...anuncio,
        price: null,
        neighborhood: null,
        bedrooms: null,
      }),
    ).toMatchObject({ price: "", neighborhood: "", bedrooms: "0" });
  });
});

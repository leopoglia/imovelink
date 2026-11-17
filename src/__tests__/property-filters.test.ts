import { describe, expect, it } from "vitest";
import {
  FILTROS_PADRAO,
  FiltrosDeImoveis,
  bairrosDisponiveis,
  contarFiltrosAtivos,
  filtrarImoveis,
} from "@/lib/property-filters";
import { SEED_PROPERTIES } from "@/server/seeds/seed-jaragua";
import type { ExternalListing, Property } from "@/types/domain";

const imovel = (extra: Partial<Property>): Property => ({
  ...structuredClone(SEED_PROPERTIES[0]),
  ...extra,
});

const anuncio = (extra: Partial<ExternalListing>): ExternalListing => ({
  id: "x",
  sourceId: "s",
  tenantId: "t",
  url: "https://outrosite.com/x",
  title: "Anúncio",
  price: 500000,
  neighborhood: "Centro",
  city: "Jaraguá do Sul",
  bedrooms: 2,
  parkingSpots: 1,
  areaTotal: 70,
  imageUrl: null,
  purpose: "SALE",
  contentHash: "x",
  firstSeenAt: "2026-11-10T10:00:00.000Z",
  lastSeenAt: "2026-11-10T10:00:00.000Z",
  ...extra,
});

const CASA = imovel({
  id: "casa",
  code: "IMV-001",
  title: "Casa com piscina",
  type: "HOUSE",
  status: "AVAILABLE",
  addressNeighborhood: "Vila Nova",
  addressStreet: "Rua das Flores, 10",
  price: 900000,
  bedrooms: 3,
});
const APTO = imovel({
  id: "apto",
  code: "IMV-002",
  title: "Apartamento compacto",
  type: "APARTMENT",
  status: "SOLD",
  addressNeighborhood: "Centro",
  addressStreet: "Rua Reinoldo Rau, 50",
  price: 350000,
  bedrooms: 1,
});
const EXT_CENTRO = anuncio({ id: "ext-centro", title: "Sala no Centro" });
const EXT_AGUA = anuncio({
  id: "ext-agua",
  title: "Casa na Água Verde",
  neighborhood: "Água Verde",
  price: null,
  bedrooms: null,
});

const imoveis = [CASA, APTO];
const anuncios = [EXT_CENTRO, EXT_AGUA];

const aplicar = (filtros: Partial<FiltrosDeImoveis>) => {
  const resultado = filtrarImoveis(imoveis, anuncios, {
    ...FILTROS_PADRAO,
    ...filtros,
  });
  return [
    ...resultado.imoveis.map((item) => item.id),
    ...resultado.anuncios.map((item) => item.id),
  ];
};

describe("Filtros de imóveis", () => {
  it("sem filtros, mostra tudo", () => {
    expect(aplicar({})).toEqual(["casa", "apto", "ext-centro", "ext-agua"]);
    expect(contarFiltrosAtivos(FILTROS_PADRAO)).toBe(0);
  });

  it("filtra pela origem", () => {
    expect(aplicar({ origem: "CARTEIRA" })).toEqual(["casa", "apto"]);
    expect(aplicar({ origem: "EXTERNOS" })).toEqual(["ext-centro", "ext-agua"]);
  });

  it("tipo e status mostram só a carteira, porque anúncios não os têm", () => {
    expect(aplicar({ tipo: "HOUSE" })).toEqual(["casa"]);
    expect(aplicar({ status: "SOLD" })).toEqual(["apto"]);
  });

  it("filtra pelo bairro sem diferenciar acento nem maiúsculas", () => {
    expect(aplicar({ bairro: "centro" })).toEqual(["apto", "ext-centro"]);
    expect(aplicar({ bairro: "Agua Verde" })).toEqual(["ext-agua"]);
  });

  it("filtra pela faixa de valor e deixa de fora quem não informa o preço", () => {
    expect(aplicar({ precoMin: "400000" })).toEqual(["casa", "ext-centro"]);
    expect(aplicar({ precoMax: "400000" })).toEqual(["apto"]);
    expect(aplicar({ precoMin: "400000", precoMax: "600000" })).toEqual([
      "ext-centro",
    ]);
  });

  it("filtra pelo mínimo de quartos", () => {
    expect(aplicar({ quartosMin: "2" })).toEqual(["casa", "ext-centro"]);
    expect(aplicar({ quartosMin: "3" })).toEqual(["casa"]);
  });

  it("busca por título, código, rua e bairro", () => {
    expect(aplicar({ texto: "PISCINA" })).toEqual(["casa"]);
    expect(aplicar({ texto: "imv-002" })).toEqual(["apto"]);
    expect(aplicar({ texto: "reinoldo" })).toEqual(["apto"]);
    expect(aplicar({ texto: "sala" })).toEqual(["ext-centro"]);
    expect(aplicar({ texto: "água verde" })).toEqual(["ext-agua"]);
  });

  it("combina filtros", () => {
    expect(aplicar({ origem: "CARTEIRA", precoMax: "1000000", quartosMin: "2" })).toEqual(["casa"]);
  });

  it("conta os filtros ativos, ignorando busca só com espaços", () => {
    expect(
      contarFiltrosAtivos({
        ...FILTROS_PADRAO,
        texto: "   ",
        tipo: "HOUSE",
        precoMax: "500000",
      }),
    ).toBe(2);
  });

  it("lista os bairros sem repetir variações de escrita", () => {
    expect(
      bairrosDisponiveis(
        [CASA, APTO, imovel({ addressNeighborhood: "CENTRO" })],
        [...anuncios, anuncio({ neighborhood: null }), anuncio({ neighborhood: "  " })],
      ),
    ).toEqual(["Água Verde", "Centro", "Vila Nova"]);
  });
});

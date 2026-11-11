import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  extractionMapSchema,
  extrairAnuncios,
  parseEndereco,
  parseNumeroBR,
  type ExtractionMap,
} from "@/server/services/listing-extraction";

// Listagem real de www.poderimoveis.com, recortada em dois anúncios.
const HTML = readFileSync(
  new URL("./fixtures/poderimoveis-listagem.html", import.meta.url),
  "utf8",
);
const BASE = "https://www.poderimoveis.com/imoveis";

// Mapa que a descoberta deve produzir para esse site. Os campos numéricos são
// identificados pelo título do ícone, não pela posição na lista.
const MAPA: ExtractionMap = {
  item: "div.ui__card",
  fields: {
    url: { selector: "a.ui__card-link", attr: "href" },
    title: { selector: "img.ui__card-img", attr: "alt" },
    price: { selector: "p.ui__card__price" },
    address: { selector: "p.ui__card-address" },
    areaTotal: { selector: 'li.ui__card-item:has(img[title="Área total"])' },
    parkingSpots: { selector: 'li.ui__card-item:has(img[title="Vagas"])' },
    bedrooms: { selector: 'li.ui__card-item:has(img[title="Quartos"])' },
  },
};

describe("Extração de anúncios externos", () => {
  it("o mapa do site real é válido segundo o schema", () => {
    expect(() => extractionMapSchema.parse(MAPA)).not.toThrow();
  });

  it("extrai os dois anúncios da listagem real", () => {
    const anuncios = extrairAnuncios(HTML, MAPA, BASE);
    expect(anuncios).toHaveLength(2);
  });

  it("lê todos os campos do primeiro anúncio", () => {
    const [primeiro] = extrairAnuncios(HTML, MAPA, BASE);
    expect(primeiro.title).toContain("Apartamento");
    expect(primeiro.price).toBe(130000);
    expect(primeiro.neighborhood).toBe("Corticeira");
    expect(primeiro.city).toBe("Guaramirim");
    expect(primeiro.bedrooms).toBe(2);
    expect(primeiro.parkingSpots).toBe(1);
    expect(primeiro.areaTotal).toBe(48.4);
  });

  it("transforma o caminho relativo em URL absoluta da origem", () => {
    const [primeiro] = extrairAnuncios(HTML, MAPA, BASE);
    expect(primeiro.url.startsWith("https://www.poderimoveis.com/imovel/")).toBe(
      true,
    );
  });

  it("não confunde os anúncios entre si", () => {
    const [, segundo] = extrairAnuncios(HTML, MAPA, BASE);
    expect(segundo.price).toBe(150000);
  });

  it("descarta anúncio sem URL ou sem título", () => {
    const semLink = `<div class="ui__card"><p class="ui__card__price">R$ 1,00</p></div>`;
    expect(extrairAnuncios(semLink, MAPA, BASE)).toEqual([]);
  });

  it("descarta anúncio cujo href não forma uma URL válida", () => {
    const quebrado = `<div class="ui__card">
      <a class="ui__card-link" href="http://[inv"><img class="ui__card-img" alt="X"></a>
    </div>`;
    expect(extrairAnuncios(quebrado, MAPA, BASE)).toEqual([]);
  });

  it("deixa o campo indefinido quando o seletor não encontra nada", () => {
    const magro = `<div class="ui__card">
      <a class="ui__card-link" href="/imovel/x"><img class="ui__card-img" alt="Casa"></a>
    </div>`;
    const [anuncio] = extrairAnuncios(magro, MAPA, BASE);
    expect(anuncio.price).toBeUndefined();
    expect(anuncio.bedrooms).toBeUndefined();
    expect(anuncio.neighborhood).toBeUndefined();
  });

  it("devolve lista vazia quando o seletor de anúncio não casa", () => {
    expect(
      extrairAnuncios(HTML, { ...MAPA, item: "div.inexistente" }, BASE),
    ).toEqual([]);
  });

  it("aceita um recorte por expressão no campo", () => {
    const comRef = `<div class="ui__card">
      <a class="ui__card-link" href="/imovel/x"><img class="ui__card-img" alt="Casa"></a>
      <p class="ui__card-reference">REF:26000.297</p>
    </div>`;
    const mapa: ExtractionMap = {
      ...MAPA,
      fields: {
        ...MAPA.fields,
        title: {
          selector: "p.ui__card-reference",
          match: "REF:([0-9.]+)",
        },
      },
    };
    expect(extrairAnuncios(comRef, mapa, BASE)[0].title).toBe("26000.297");
  });
});

describe("Conversão de números no formato brasileiro", () => {
  it("entende milhar com ponto e decimal com vírgula", () => {
    expect(parseNumeroBR("R$160.000,00")).toBe(160000);
    expect(parseNumeroBR("48,40 m²")).toBe(48.4);
    expect(parseNumeroBR("1.234.567,89")).toBe(1234567.89);
  });

  it("entende número simples e com separador de milhar sozinho", () => {
    expect(parseNumeroBR("2")).toBe(2);
    expect(parseNumeroBR("890.000")).toBe(890000);
  });

  it("devolve indefinido quando não há dígito", () => {
    expect(parseNumeroBR("consulte")).toBeUndefined();
    expect(parseNumeroBR("")).toBeUndefined();
  });
});

describe("Separação de bairro e cidade", () => {
  it("usa a UF como âncora no formato do site real", () => {
    expect(
      parseEndereco("R. (consulte a Imobiliária.) - Corticeira, Guaramirim - SC"),
    ).toEqual({ neighborhood: "Corticeira", city: "Guaramirim" });
  });

  it("funciona sem a rua", () => {
    expect(parseEndereco("Centro, Jaraguá do Sul - SC")).toEqual({
      neighborhood: "Centro",
      city: "Jaraguá do Sul",
    });
  });

  it("devolve vazio quando não há partes suficientes", () => {
    expect(parseEndereco("SC")).toEqual({});
    expect(parseEndereco("")).toEqual({});
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  candidatosDeTemplate,
  descobrirPaginacao,
  montarUrlPagina,
  percorrerPaginas,
} from "@/server/services/pagination";
import type { ExtractionMap } from "@/server/services/listing-extraction";

const MAPA: ExtractionMap = {
  item: "div.card",
  fields: {
    url: { selector: "a", attr: "href" },
    title: { selector: "h2" },
  },
};

/** Monta uma página com os anúncios indicados. */
const pagina = (...refs: string[]) =>
  refs
    .map(
      (ref) =>
        `<div class="card"><a href="/imovel/${ref}"></a><h2>Imóvel ${ref}</h2></div>`,
    )
    .join("");

const BASE = "https://exemplo.com/imoveis/venda";
const url = (ref: string) => `https://exemplo.com/imovel/${ref}`;

describe("Candidatos de padrão de paginação", () => {
  it("propõe os formatos comuns a partir da URL base", () => {
    const candidatos = candidatosDeTemplate(BASE);
    expect(candidatos[0]).toBe("https://exemplo.com/imoveis/venda-pagina-{n}");
    expect(candidatos).toContain("https://exemplo.com/imoveis/venda/page/{n}");
    expect(candidatos).toContain("https://exemplo.com/imoveis/venda?page={n}");
  });

  it("usa & quando a URL base já tem parâmetros", () => {
    expect(candidatosDeTemplate("https://exemplo.com/lista?tipo=casa")).toContain(
      "https://exemplo.com/lista?tipo=casa&page={n}",
    );
  });

  it("substitui o marcador pelo número da página", () => {
    expect(montarUrlPagina("https://x/venda-pagina-{n}", 7)).toBe(
      "https://x/venda-pagina-7",
    );
  });
});

describe("Descoberta do padrão", () => {
  it("aceita o padrão que traz anúncios inéditos", async () => {
    const buscar = vi.fn(async (alvo: string) =>
      alvo === "https://exemplo.com/imoveis/venda-pagina-2"
        ? pagina("c", "d")
        : null,
    );
    const r = await descobrirPaginacao(BASE, MAPA, [url("a"), url("b")], buscar);
    expect(r.template).toBe("https://exemplo.com/imoveis/venda-pagina-{n}");
  });

  it("recusa padrão que devolve a mesma primeira página", async () => {
    // Erro clássico: o site ignora o parâmetro e repete a página inicial.
    const buscar = vi.fn(async () => pagina("a", "b"));
    const r = await descobrirPaginacao(BASE, MAPA, [url("a"), url("b")], buscar);
    expect(r.template).toBeNull();
    expect(r.reason).toBe("NO_PATTERN_WORKED");
  });

  it("tenta o próximo candidato quando um falha", async () => {
    const buscar = vi.fn(async (alvo: string) =>
      alvo.includes("?page=2") ? pagina("z") : null,
    );
    const r = await descobrirPaginacao(BASE, MAPA, [url("a")], buscar);
    expect(r.template).toBe("https://exemplo.com/imoveis/venda?page={n}");
  });

  it("não quebra quando a busca de um candidato lança erro", async () => {
    const buscar = vi.fn(async (alvo: string) => {
      if (alvo.includes("-pagina-")) throw new Error("500");
      return alvo.includes("/page/") ? pagina("z") : null;
    });
    const r = await descobrirPaginacao(BASE, MAPA, [url("a")], buscar);
    expect(r.template).toBe("https://exemplo.com/imoveis/venda/page/{n}");
  });

  it("não procura padrão quando a primeira página veio vazia", async () => {
    const buscar = vi.fn();
    const r = await descobrirPaginacao(BASE, MAPA, [], buscar);
    expect(r.reason).toBe("SINGLE_PAGE");
    expect(buscar).not.toHaveBeenCalled();
  });
});

describe("Percurso das páginas", () => {
  const primeira = { url: BASE, html: pagina("a", "b") };
  const TEMPLATE = "https://exemplo.com/imoveis/venda-pagina-{n}";

  it("junta os anúncios de todas as páginas sem repetir", async () => {
    const paginas: Record<string, string> = {
      "https://exemplo.com/imoveis/venda-pagina-2": pagina("c", "d"),
      "https://exemplo.com/imoveis/venda-pagina-3": pagina("e"),
    };
    const buscar = vi.fn(async (alvo: string) => paginas[alvo] ?? null);
    const r = await percorrerPaginas(TEMPLATE, primeira, MAPA, buscar, 10);
    expect(r.anuncios).toHaveLength(5);
    expect(r.paginas).toBe(3);
  });

  it("para quando a página repete o que já foi visto", async () => {
    const buscar = vi.fn(async () => pagina("a", "b"));
    const r = await percorrerPaginas(TEMPLATE, primeira, MAPA, buscar, 10);
    expect(r.anuncios).toHaveLength(2);
    expect(buscar).toHaveBeenCalledTimes(1);
  });

  it("respeita o teto de páginas", async () => {
    let n = 0;
    const buscar = vi.fn(async () => pagina(`novo${n++}`));
    const r = await percorrerPaginas(TEMPLATE, primeira, MAPA, buscar, 3);
    expect(buscar).toHaveBeenCalledTimes(2);
    expect(r.paginas).toBe(3);
  });

  it("devolve só a primeira página quando não há padrão", async () => {
    const buscar = vi.fn();
    const r = await percorrerPaginas(null, primeira, MAPA, buscar, 10);
    expect(r.anuncios).toHaveLength(2);
    expect(buscar).not.toHaveBeenCalled();
  });

  it("espera o intervalo pedido pelo site entre as páginas", async () => {
    const esperas: number[] = [];
    const aguardar = async (ms: number) => {
      esperas.push(ms);
    };
    const buscar = vi.fn(async (alvo: string) =>
      alvo.endsWith("-2") ? pagina("c") : null,
    );
    await percorrerPaginas(TEMPLATE, primeira, MAPA, buscar, 5, aguardar, 2000);
    expect(esperas[0]).toBe(2000);
  });

  it("interrompe o percurso se uma página falhar", async () => {
    const buscar = vi.fn(async (alvo: string) => {
      if (alvo.endsWith("-2")) return pagina("c");
      throw new Error("timeout");
    });
    const r = await percorrerPaginas(TEMPLATE, primeira, MAPA, buscar, 10);
    expect(r.anuncios).toHaveLength(3);
  });
});

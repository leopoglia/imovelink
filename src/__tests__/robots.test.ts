import { describe, expect, it } from "vitest";
import { parseRobots, podeBuscar } from "@/server/services/robots";

// Trecho real do robots.txt de www.poderimoveis.com, o site usado como exemplo.
const PODER_IMOVEIS = `Sitemap: https://www.poderimoveis.com/sitemap.xml

User-agent: *
Allow: /
Disallow: /alterar-senha/
Noindex: /alterar-senha/
Disallow: /proprietario/
Disallow: /inquilino/

# End of robots.txt file`;

describe("Leitura de robots.txt", () => {
  it("libera a listagem pública e bloqueia as áreas restritas do site real", () => {
    const regras = parseRobots(PODER_IMOVEIS);
    expect(podeBuscar("/imoveis", regras)).toBe(true);
    expect(podeBuscar("/proprietario/", regras)).toBe(false);
    expect(podeBuscar("/inquilino/extrato", regras)).toBe(false);
    expect(podeBuscar("/alterar-senha/", regras)).toBe(false);
  });

  it("ignora comentários, linhas vazias e campos desconhecidos", () => {
    const regras = parseRobots(
      "# comentario\n\nSitemap: http://x/y.xml\nUser-agent: *\nDisallow: /privado  # inline\n",
    );
    expect(regras.disallow).toEqual(["/privado"]);
    expect(podeBuscar("/privado/arquivo", regras)).toBe(false);
    expect(podeBuscar("/publico", regras)).toBe(true);
  });

  it("prefere o grupo do nosso agente ao grupo coringa", () => {
    const regras = parseRobots(
      "User-agent: *\nDisallow: /\n\nUser-agent: ImovelinkBot\nDisallow: /somente-isso\n",
    );
    expect(podeBuscar("/imoveis", regras)).toBe(true);
    expect(podeBuscar("/somente-isso", regras)).toBe(false);
  });

  it("aplica o mesmo bloco a agentes declarados em sequência", () => {
    const regras = parseRobots(
      "User-agent: outrobot\nUser-agent: ImovelinkBot\nDisallow: /nada\n",
    );
    expect(podeBuscar("/nada", regras)).toBe(false);
  });

  it("deixa o Allow mais específico vencer um Disallow mais curto", () => {
    const regras = parseRobots(
      "User-agent: *\nDisallow: /area\nAllow: /area/publica\n",
    );
    expect(podeBuscar("/area/privada", regras)).toBe(false);
    expect(podeBuscar("/area/publica/lista", regras)).toBe(true);
  });

  it("lê o intervalo mínimo pedido pelo site", () => {
    expect(parseRobots("User-agent: *\nCrawl-delay: 2.5\n").crawlDelay).toBe(
      2.5,
    );
    expect(parseRobots("User-agent: *\nCrawl-delay: x\n").crawlDelay).toBe(
      undefined,
    );
  });

  it("não proíbe nada quando o arquivo está vazio ou não cita nosso agente", () => {
    expect(podeBuscar("/imoveis", parseRobots(""))).toBe(true);
    expect(
      podeBuscar("/imoveis", parseRobots("User-agent: googlebot\nDisallow: /")),
    ).toBe(true);
  });

  it("trata caminho vazio como raiz", () => {
    const regras = parseRobots("User-agent: *\nDisallow: /\n");
    expect(podeBuscar("", regras)).toBe(false);
  });
});

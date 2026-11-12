import { describe, expect, it } from "vitest";
import { detectarLogo } from "@/server/services/site-logo";

const BASE = "https://www.exemplo.com/imoveis";

describe("Detecção do logo do site", () => {
  it("prefere o apple-touch-icon, que costuma ser a marca em boa resolução", () => {
    const html = `<head>
      <link rel="apple-touch-icon" href="/touch.png">
      <link rel="icon" href="/favicon.ico">
      <meta property="og:image" content="/foto-de-imovel.jpg">
    </head>`;
    expect(detectarLogo(html, BASE)).toBe("https://www.exemplo.com/touch.png");
  });

  it("entre vários ícones, escolhe o de maior resolução declarada", () => {
    const html = `<head>
      <link rel="icon" sizes="16x16" href="/p.png">
      <link rel="icon" sizes="196x196" href="/g.png">
      <link rel="icon" sizes="32x32" href="/m.png">
    </head>`;
    expect(detectarLogo(html, BASE)).toBe("https://www.exemplo.com/g.png");
  });

  it("usa og:image só quando não há ícone de marca", () => {
    const html = `<head><meta property="og:image" content="/logo-link.png"></head>`;
    expect(detectarLogo(html, BASE)).toBe(
      "https://www.exemplo.com/logo-link.png",
    );
  });

  it("cai no favicon padrão quando a página não declara nada", () => {
    expect(detectarLogo("<head></head>", BASE)).toBe(
      "https://www.exemplo.com/favicon.ico",
    );
  });

  it("resolve caminho relativo contra a URL da listagem", () => {
    expect(detectarLogo(`<link rel="icon" href="img/logo.png">`, BASE)).toBe(
      "https://www.exemplo.com/img/logo.png",
    );
  });

  it("aceita URL absoluta de outro domínio, como CDN", () => {
    const html = `<link rel="icon" href="https://cdn.exemplo.net/itaivan/logo.ico">`;
    expect(detectarLogo(html, BASE)).toBe(
      "https://cdn.exemplo.net/itaivan/logo.ico",
    );
  });

  it("reproduz o caso real do Poder Imóveis", () => {
    const html = `<head><link rel="shortcut icon" href="https://www.poderimoveis.com/img/favicon-196x196.png"></head>`;
    expect(detectarLogo(html, "https://www.poderimoveis.com/imoveis")).toBe(
      "https://www.poderimoveis.com/img/favicon-196x196.png",
    );
  });

  it("ignora candidato cuja URL é inválida e segue para o próximo", () => {
    const html = `<head>
      <link rel="apple-touch-icon" href="http://[quebrado">
      <link rel="icon" href="/bom.png">
    </head>`;
    expect(detectarLogo(html, BASE)).toBe("https://www.exemplo.com/bom.png");
  });
});

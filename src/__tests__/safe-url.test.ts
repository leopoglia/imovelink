import { describe, expect, it } from "vitest";
import { ehLinkHttp } from "@/lib/safe-url";
import { novaFonteSchema } from "@/server/services/crawler.service";

const fonte = {
  name: "Imobiliária Exemplo",
  listUrl: "https://imobiliaria-exemplo.com.br/imoveis",
  extractionMap: {
    item: "div.card",
    fields: {
      url: { selector: "a", attr: "href" },
      title: { selector: "h2" },
    },
  },
};

describe("Links que podem virar imagem ou link na tela", () => {
  it("aceita só http e https", () => {
    expect(ehLinkHttp("https://exemplo.com/logo.png")).toBe(true);
    expect(ehLinkHttp("  http://exemplo.com/logo.png ")).toBe(true);
    expect(ehLinkHttp("javascript:alert(1)")).toBe(false);
    expect(ehLinkHttp("data:image/svg+xml,<svg onload=alert(1)>")).toBe(false);
    expect(ehLinkHttp("/logo.png")).toBe(false);
    expect(ehLinkHttp("")).toBe(false);
    expect(ehLinkHttp(null)).toBe(false);
  });

  it("recusa no servidor um logo de fonte que não seja http(s)", () => {
    expect(
      novaFonteSchema.safeParse({ ...fonte, logoUrl: "javascript:alert(1)" })
        .success,
    ).toBe(false);
    expect(
      novaFonteSchema.parse({
        ...fonte,
        logoUrl: "https://imobiliaria-exemplo.com.br/logo.png",
      }).logoUrl,
    ).toBe("https://imobiliaria-exemplo.com.br/logo.png");
    expect(novaFonteSchema.parse(fonte).logoUrl).toBeNull();
  });
});

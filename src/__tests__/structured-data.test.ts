import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonLd, publicOrigin } from "@/lib/structured-data";

afterEach(() => vi.unstubAllEnvs());

describe("Endereço público do site", () => {
  it("usa o endereço configurado em APP_ORIGIN, sem barra final", () => {
    vi.stubEnv("APP_ORIGIN", "https://portal.exemplo.com.br/");
    expect(publicOrigin()).toBe("https://portal.exemplo.com.br");
  });

  it("usa o domínio do Imovelink quando APP_ORIGIN não está definido", () => {
    vi.stubEnv("APP_ORIGIN", "");
    expect(publicOrigin()).toBe("https://imovelink.site");
  });
});

describe("Microdados em JSON-LD", () => {
  it("preserva os dados ao serializar", () => {
    const dados = { name: "Casa & Jardim", price: 950000 };
    expect(JSON.parse(jsonLd(dados))).toEqual(dados);
  });

  it("não permite que um texto cadastrado encerre a tag script", () => {
    const dados = {
      description: 'Ótima casa</script><script>alert("x")</script>',
    };
    const saida = jsonLd(dados);
    expect(saida).not.toContain("<");
    expect(saida).not.toContain("</script>");
    expect(JSON.parse(saida)).toEqual(dados);
  });
});

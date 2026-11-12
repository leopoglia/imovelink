import { describe, expect, it } from "vitest";
import { sugerirFinalidade } from "@/server/services/listing-purpose";

describe("Sugestão de finalidade pela URL da listagem", () => {
  it("reconhece venda nos formatos usados pelos portais", () => {
    for (const url of [
      "https://piermann.com.br/imoveis/venda",
      "https://www.poderimoveis.com/imoveis/venda-pagina-2",
      "https://exemplo.com/comprar/apartamentos",
      "https://exemplo.com/busca?finalidade=venda",
    ])
      expect(sugerirFinalidade(url)).toBe("SALE");
  });

  it("reconhece locação, com e sem acento", () => {
    for (const url of [
      "https://piermann.com.br/imoveis/aluguel",
      "https://exemplo.com/locacao/casas",
      "https://exemplo.com/locação/casas",
      "https://exemplo.com/imoveis/alugar",
    ])
      expect(sugerirFinalidade(url)).toBe("RENT");
  });

  it("não decide quando a URL não diz nada", () => {
    // Caso real: /imoveis/ da Piermann mistura venda e locação.
    expect(sugerirFinalidade("https://piermann.com.br/imoveis/")).toBeNull();
    expect(sugerirFinalidade("https://exemplo.com/")).toBeNull();
  });

  it("não decide quando a URL cita as duas finalidades", () => {
    expect(
      sugerirFinalidade("https://exemplo.com/venda-e-aluguel/casas"),
    ).toBeNull();
  });

  it("ignora o domínio, olhando só o caminho e a consulta", () => {
    // "vendaimoveis.com" no domínio não torna a listagem uma página de venda.
    expect(sugerirFinalidade("https://vendaimoveis.com/imoveis")).toBeNull();
  });

  it("aceita texto que não é URL válida", () => {
    expect(sugerirFinalidade("/imoveis/aluguel")).toBe("RENT");
  });
});

import { describe, expect, it } from "vitest";
import {
  COR_PADRAO,
  conteudoDaVitrine,
  corDoTextoSobre,
  corValida,
  imoveisDaVitrine,
  siglaDaImobiliaria,
  tituloDaVitrine,
} from "@/lib/vitrine";
import { SEED_PROPERTIES, SEED_TENANTS } from "@/server/seeds/seed-jaragua";
import type { Property, Tenant } from "@/types/domain";

const tenant = (branding: Partial<Tenant["branding"]> = {}, extra = {}) => {
  const base = structuredClone(SEED_TENANTS[0]);
  return { ...base, ...extra, branding: { ...base.branding, ...branding } };
};
const imovel = (extra: Partial<Property>): Property => ({
  ...structuredClone(SEED_PROPERTIES[0]),
  ...extra,
});

describe("Regras da vitrine", () => {
  it("mostra só disponíveis e reservados que não foram escondidos", () => {
    const lista = [
      imovel({ id: "a", status: "AVAILABLE" }),
      imovel({ id: "b", status: "RESERVED" }),
      imovel({ id: "c", status: "SOLD" }),
      imovel({ id: "d", status: "INACTIVE" }),
      imovel({ id: "e", status: "AVAILABLE" }),
    ];
    expect(imoveisDaVitrine(lista, ["e"]).map((p) => p.id)).toEqual(["a", "b"]);
    expect(imoveisDaVitrine(lista).map((p) => p.id)).toEqual(["a", "b", "e"]);
  });

  it("escolhe texto claro ou escuro conforme a cor da marca", () => {
    expect(corDoTextoSobre("#1E56CC")).toBe("#FFFFFF");
    expect(corDoTextoSobre("#FDE68A")).toBe("#1C222C");
    expect(corValida("azul")).toBe(COR_PADRAO);
    expect(corValida("#abcdef")).toBe("#ABCDEF");
  });

  it("usa um título padrão e a sigla pelas iniciais quando não há", () => {
    expect(tituloDaVitrine(tenant())).toBe("Imóveis à venda em Jaraguá do Sul");
    expect(tituloDaVitrine(tenant({ headline: "Seu novo lar" }))).toBe(
      "Seu novo lar",
    );
    expect(siglaDaImobiliaria(tenant({ logoText: "CP" }))).toBe("CP");
    expect(
      siglaDaImobiliaria(
        tenant({ logoText: "" }, { name: "Vale Europeu Imóveis" }),
      ),
    ).toBe("VE");
  });

  it("lê o conteúdo editável com valores vazios no lugar do que falta", () => {
    const conteudo = conteudoDaVitrine(tenant({ primaryColor: "inválida" }));
    expect(conteudo).toMatchObject({
      headline: "",
      about: "",
      coverImageUrl: "",
      primaryColor: COR_PADRAO,
      logoText: "CP",
      hiddenPropertyIds: [],
    });
  });
});

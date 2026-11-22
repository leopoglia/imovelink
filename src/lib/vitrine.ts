import type { Property, Tenant } from "@/types/domain";

export const COR_PADRAO = "#1E56CC";

/** O que o gestor edita na tela "Vitrine". */
export interface ConteudoDaVitrine {
  headline: string;
  tagline: string;
  about: string;
  coverImageUrl: string;
  primaryColor: string;
  logoText: string;
  hiddenPropertyIds: string[];
}

export function conteudoDaVitrine(tenant: Tenant): ConteudoDaVitrine {
  const marca = tenant.branding;
  return {
    headline: marca.headline ?? "",
    tagline: marca.tagline ?? "",
    about: marca.about ?? "",
    coverImageUrl: marca.coverImageUrl ?? "",
    primaryColor: corValida(marca.primaryColor),
    logoText: marca.logoText ?? "",
    hiddenPropertyIds: marca.hiddenPropertyIds ?? [],
  };
}

export function corValida(cor: string | undefined): string {
  return cor && /^#[0-9a-f]{6}$/i.test(cor) ? cor.toUpperCase() : COR_PADRAO;
}

/** Branco ou quase preto, o que ler melhor sobre a cor da marca. */
export function corDoTextoSobre(cor: string): string {
  const hex = corValida(cor).slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const canal = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return canal <= 0.03928 ? canal / 12.92 : ((canal + 0.055) / 1.055) ** 2.4;
  });
  const luminancia = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminancia > 0.4 ? "#1C222C" : "#FFFFFF";
}

export function tituloDaVitrine(tenant: Tenant): string {
  return tenant.branding.headline?.trim() || `Imóveis à venda em ${tenant.city}`;
}

export function siglaDaImobiliaria(tenant: Tenant): string {
  const sigla = tenant.branding.logoText?.trim();
  if (sigla) return sigla;
  const iniciais = tenant.name
    .split(/\s+/)
    .filter((palavra) => palavra.length > 2)
    .slice(0, 2)
    .map((palavra) => palavra[0])
    .join("");
  return (iniciais || tenant.name.slice(0, 2)).toUpperCase();
}

/** Só imóveis à venda (disponíveis ou reservados) que o gestor não escondeu. */
export function podeAparecerNaVitrine(imovel: Property): boolean {
  return imovel.status === "AVAILABLE" || imovel.status === "RESERVED";
}

export function imoveisDaVitrine(
  imoveis: Property[],
  escondidos: string[] = [],
): Property[] {
  const ocultos = new Set(escondidos);
  return imoveis.filter(
    (imovel) => podeAparecerNaVitrine(imovel) && !ocultos.has(imovel.id),
  );
}


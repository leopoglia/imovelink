import { normalizarTexto } from "@/lib/geo";
import type {
  ExternalListing,
  Property,
  PropertyStatus,
  PropertyType,
} from "@/types/domain";

/** Valor usado nos seletores para "sem filtro". */
export const TODOS = "TODOS";

export type OrigemDoImovel = typeof TODOS | "CARTEIRA" | "EXTERNOS";

export interface FiltrosDeImoveis {
  texto: string;
  origem: OrigemDoImovel;
  tipo: typeof TODOS | PropertyType;
  status: typeof TODOS | PropertyStatus;
  bairro: string;
  /** Só dígitos, em reais; vazio é sem limite. */
  precoMin: string;
  precoMax: string;
  quartosMin: string;
}

export const FILTROS_PADRAO: FiltrosDeImoveis = {
  texto: "",
  origem: TODOS,
  tipo: TODOS,
  status: TODOS,
  bairro: TODOS,
  precoMin: "",
  precoMax: "",
  quartosMin: "0",
};

/** Quantos filtros diferem do padrão, para o contador do botão. */
export function contarFiltrosAtivos(filtros: FiltrosDeImoveis): number {
  return (Object.keys(FILTROS_PADRAO) as (keyof FiltrosDeImoveis)[]).filter(
    (chave) => filtros[chave].trim() !== FILTROS_PADRAO[chave],
  ).length;
}

const contem = (campos: (string | null | undefined)[], busca: string) =>
  campos.some((campo) => campo && normalizarTexto(campo).includes(busca));

function dentroDaFaixa(
  valor: number | null,
  minimo: number | null,
  maximo: number | null,
): boolean {
  if (minimo === null && maximo === null) return true;
  // Sem valor informado, não dá para afirmar que está na faixa.
  if (valor === null) return false;
  return (
    (minimo === null || valor >= minimo) && (maximo === null || valor <= maximo)
  );
}

const numeroOuNulo = (texto: string) => (texto ? Number(texto) : null);

/**
 * Aplica os filtros aos imóveis da carteira e aos anúncios de outros sites.
 * Anúncios externos não têm tipo nem status: filtrar por um deles mostra só
 * a carteira.
 */
export function filtrarImoveis(
  imoveis: Property[],
  anuncios: ExternalListing[],
  filtros: FiltrosDeImoveis,
): { imoveis: Property[]; anuncios: ExternalListing[] } {
  const busca = normalizarTexto(filtros.texto);
  const bairro =
    filtros.bairro === TODOS ? null : normalizarTexto(filtros.bairro);
  const precoMin = numeroOuNulo(filtros.precoMin);
  const precoMax = numeroOuNulo(filtros.precoMax);
  const quartosMin = Number(filtros.quartosMin) || 0;

  const imoveisFiltrados =
    filtros.origem === "EXTERNOS"
      ? []
      : imoveis.filter(
          (imovel) =>
            (filtros.tipo === TODOS || imovel.type === filtros.tipo) &&
            (filtros.status === TODOS || imovel.status === filtros.status) &&
            (!bairro ||
              normalizarTexto(imovel.addressNeighborhood) === bairro) &&
            dentroDaFaixa(imovel.price, precoMin, precoMax) &&
            imovel.bedrooms >= quartosMin &&
            (!busca ||
              contem(
                [
                  imovel.title,
                  imovel.code,
                  imovel.addressStreet,
                  imovel.addressNeighborhood,
                ],
                busca,
              )),
        );

  const soCarteira =
    filtros.origem === "CARTEIRA" ||
    filtros.tipo !== TODOS ||
    filtros.status !== TODOS;

  const anunciosFiltrados = soCarteira
    ? []
    : anuncios.filter(
        (anuncio) =>
          (!bairro ||
            (anuncio.neighborhood !== null &&
              normalizarTexto(anuncio.neighborhood) === bairro)) &&
          dentroDaFaixa(anuncio.price, precoMin, precoMax) &&
          (quartosMin === 0 || (anuncio.bedrooms ?? 0) >= quartosMin) &&
          (!busca ||
            contem([anuncio.title, anuncio.neighborhood, anuncio.city], busca)),
      );

  return { imoveis: imoveisFiltrados, anuncios: anunciosFiltrados };
}

/** Bairros presentes na carteira e nos anúncios, sem repetição, em ordem. */
export function bairrosDisponiveis(
  imoveis: Property[],
  anuncios: ExternalListing[],
): string[] {
  const porChave = new Map<string, string>();
  for (const nome of [
    ...imoveis.map((imovel) => imovel.addressNeighborhood),
    ...anuncios.map((anuncio) => anuncio.neighborhood),
  ]) {
    const limpo = nome?.trim();
    if (limpo && !porChave.has(normalizarTexto(limpo)))
      porChave.set(normalizarTexto(limpo), limpo);
  }
  return [...porChave.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

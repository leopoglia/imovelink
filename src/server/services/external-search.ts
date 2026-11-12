import type {
  ExternalListing,
  ExternalResultItem,
  ExternalSource,
  StructuredPropertyQuery,
} from "@/types/domain";
import { normalizarTexto } from "@/lib/geo";

/**
 * Aplica a consulta estruturada aos anúncios indexados de outros sites.
 *
 * A avaliação é só por atributos. Anúncios externos não têm descrição nem lista
 * de comodidades — o crawler indexa e aponta para a origem —, então critérios
 * semânticos e de comodidade não têm como ser verificados aqui. O resultado
 * entra na mesma lista dos imóveis próprios, sempre identificado.
 */

/** Teto de pontuação: sem texto para comparar, um externo nunca supera um imóvel próprio bem casado. */
const TETO = 80;

function atendeNumero(
  valor: number | null,
  minimo: number | undefined,
): boolean {
  if (minimo === undefined) return true;
  // Campo ausente não é prova de que atende; o anúncio fica de fora.
  return valor !== null && valor >= minimo;
}

export function filtrarExternos(
  anuncios: ExternalListing[],
  query: StructuredPropertyQuery,
  fontes: Map<string, ExternalSource>,
): ExternalResultItem[] {
  return anuncios
    .filter((anuncio) => {
      const fonte = fontes.get(anuncio.sourceId);
      if (fonte && !fonte.active) return false;
      if (query.minPrice !== undefined && (anuncio.price ?? 0) < query.minPrice)
        return false;
      if (
        query.maxPrice !== undefined &&
        (anuncio.price === null || anuncio.price > query.maxPrice)
      )
        return false;
      if (!atendeNumero(anuncio.bedrooms, query.minBedrooms)) return false;
      if (!atendeNumero(anuncio.parkingSpots, query.minParkingSpots))
        return false;
      // Suítes não são indexadas; exigir esse critério descartaria todos.
      if (query.neighborhoods.length) {
        const alvo = normalizarTexto(anuncio.neighborhood ?? "");
        const cidade = normalizarTexto(anuncio.city ?? "");
        const casa = query.neighborhoods.some((nome) => {
          const procurado = normalizarTexto(nome);
          return alvo === procurado || cidade === procurado;
        });
        if (!casa) return false;
      }
      return true;
    })
    .map((anuncio) => {
      const fonte = fontes.get(anuncio.sourceId);
      const motivos: string[] = [];
      if (query.maxPrice !== undefined && anuncio.price !== null)
        motivos.push("Dentro do orçamento");
      if (query.minBedrooms !== undefined && anuncio.bedrooms !== null)
        motivos.push(`${anuncio.bedrooms} quartos`);
      if (anuncio.neighborhood) motivos.push(anuncio.neighborhood);

      return {
        id: anuncio.id,
        sourceName: fonte?.name ?? "Outro site",
        url: anuncio.url,
        title: anuncio.title,
        price: anuncio.price,
        neighborhood: anuncio.neighborhood,
        city: anuncio.city,
        bedrooms: anuncio.bedrooms,
        parkingSpots: anuncio.parkingSpots,
        areaTotal: anuncio.areaTotal,
        imageUrl: anuncio.imageUrl,
        score: TETO,
        matchReasons: motivos.length ? motivos : ["Anúncio de outro site"],
      };
    })
    .sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
}

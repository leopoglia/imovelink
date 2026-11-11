import type {
  HybridSearchResponse,
  HybridSearchResultItem,
  Property,
  PropertyPurpose,
  PropertyType,
  StructuredPropertyQuery,
} from "@/types/domain";
import {
  BAIRROS_JARAGUA,
  calcularDistanciaKm,
  normalizarTexto,
} from "@/lib/geo";
import { PROPERTY_TYPE_LABELS } from "@/lib/property-search";
import { propertyRepository } from "@/server/repositories/property.repository";
import { externalSourceRepository } from "@/server/repositories/external-source.repository";
import { filtrarExternos } from "./external-search";
import { interpretPropertyQuery } from "./property-query-ai";
import { geminiConfigured } from "./gemini.mjs";

const PADROES_DE_TIPO: [PropertyType, RegExp][] = [
  ["HOUSE", /\b(casas?|sobrado|residencia|geminado|chacara)\b/],
  ["APARTMENT", /\b(apartamentos?|apto|ape|studio|flat|kitnet)\b/],
  ["PENTHOUSE", /\b(cobertura|duplex|penthouse|triplex)\b/],
  [
    "COMMERCIAL",
    /\b(comercial|sala|corporativa|consultorio|loja|galpao|escritorio)\b/,
  ],
  ["LAND", /\b(terreno|lote)\b/],
];

// Um valor em reais com unidade opcional: "r$ 950 mil", "1,2 milhao", "890000".
const PADRAO_VALOR = /(?:r\$\s*)?(\d[\d.,]*)\s*(milhoes?|milhao|mil|k)?/;

const COMODIDADES = [
  "quintal arborizado",
  "quintal",
  "piscina",
  "espaco gourmet",
  "churrasqueira",
  "portaria 24h",
  "mobiliado",
  "hidromassagem",
  "financiamento",
  "elevador",
  "aceita pet",
  "home office",
];

const PALAVRAS_SEMANTICAS = [
  "catolica",
  "parque malwee",
  "investimento",
  "natureza",
  "area verde",
  "jardim",
];

function multiplicadorDaUnidade(unit: string) {
  if (/milh/.test(unit)) return 1_000_000;
  if (/mil|k/.test(unit)) return 1000;
  return 1;
}

function normalizarNumero(compact: string) {
  // Tem virgula decimal ("1,2 milhao"): os pontos sao separadores de milhar.
  if (compact.includes(","))
    return compact.replace(/\./g, "").replace(",", ".");
  // Só pontos, em grupos de tres ("890.000"): tambem separador de milhar.
  if (/^\d{1,3}(?:\.\d{3})+$/.test(compact)) return compact.replace(/\./g, "");
  // Numero simples ("890000") ou que ja usa ponto decimal ("1.2").
  return compact;
}

function parseMoney(value: string, unit = "") {
  const compact = value.replace(/\s/g, "");
  const numero = Number(normalizarNumero(compact));
  return Math.round(numero * multiplicadorDaUnidade(unit));
}

function propertyText(property: Property) {
  return normalizarTexto(
    `${property.title} ${property.description} ${property.amenities.join(" ")}`,
  );
}

function containsFeature(text: string, feature: string) {
  const normalized = normalizarTexto(feature);
  const aliases: Record<string, string[]> = {
    "espaco gourmet": ["espaco gourmet", "area gourmet", "varanda gourmet"],
    quintal: ["quintal", "jardim", "pomar"],
    "aceita pet": ["aceita pet", "pet friendly", "permite animais"],
    "home office": ["home office", "escritorio"],
  };
  return (aliases[normalized] ?? [normalized]).some((term) =>
    text.includes(term),
  );
}

function queryCenters(query: StructuredPropertyQuery) {
  return query.neighborhoods.flatMap((name) => {
    const known = BAIRROS_JARAGUA[normalizarTexto(name)];
    return known ? [known] : [];
  });
}

function detectarTipos(text: string): PropertyType[] {
  const tipos = PADROES_DE_TIPO.filter(([, padrao]) => padrao.test(text)).map(
    ([tipo]) => tipo,
  );
  // "cobertura duplex" casa com apartamento tambem; o tipo mais especifico vence.
  return tipos.includes("PENTHOUSE")
    ? tipos.filter((tipo) => tipo !== "APARTMENT")
    : tipos;
}

function detectarFinalidade(text: string): PropertyPurpose | undefined {
  if (/\b(aluguel|alugar|locacao)\b/.test(text)) return "RENT";
  if (/\b(comprar|compra|venda)\b/.test(text)) return "SALE";
  return undefined;
}

function extrairQuantidade(text: string, padrao: RegExp) {
  const match = text.match(padrao);
  return match ? Number(match[1]) : undefined;
}

function extrairFaixaDePreco(text: string) {
  const intervalo = text.match(
    /(?:entre|de)\s*(?:r\$\s*)?(\d[\d.,]*)\s*(milhoes?|milhao|mil|k)?\s*(?:e|a)\s*(?:r\$\s*)?(\d[\d.,]*)\s*(milhoes?|milhao|mil|k)?/,
  );
  if (intervalo) {
    const [, minValor, minUnidade, maxValor, maxUnidade] = intervalo;
    return {
      // "entre 500 e 950 mil": o primeiro numero herda a unidade do segundo.
      minPrice: parseMoney(minValor, minUnidade || maxUnidade),
      maxPrice: parseMoney(maxValor, maxUnidade),
    };
  }

  const teto = text.match(
    new RegExp(
      `(?:ate|no maximo|maximo|orcamento(?: de)?)\\s*(?:r\\$\\s*)?${PADRAO_VALOR.source}`,
      "i",
    ),
  );
  const piso = text.match(
    new RegExp(
      `(?:a partir de|acima de|minimo(?: de)?)\\s*${PADRAO_VALOR.source}`,
      "i",
    ),
  );
  // Valor solto ("casa de 800 mil") vale como teto so quando nao houve teto nem piso.
  const solto =
    !teto && !piso
      ? text.match(/(?:r\$\s*)?(\d[\d.,]*)\s*(milhoes?|milhao|mil|k)\b/)
      : null;
  const tetoEfetivo = teto ?? solto;

  return {
    minPrice: piso ? parseMoney(piso[1], piso[2]) : undefined,
    maxPrice: tetoEfetivo
      ? parseMoney(tetoEfetivo[1], tetoEfetivo[2])
      : undefined,
  };
}

function extrairBairros(
  text: string,
  catalog: Property[],
  extras: string[] = [],
): string[] {
  const conhecidos = [
    ...Object.values(BAIRROS_JARAGUA).map((item) => item.bairro),
    ...catalog.map((item) => item.addressNeighborhood),
    // Bairros e cidades que só aparecem nos anúncios de outros sites.
    ...extras,
  ];
  // O mesmo bairro pode vir do mapa e do catalogo; a chave normalizada tira a repeticao.
  const porNomeNormalizado = new Map(
    conhecidos.map((nome) => [normalizarTexto(nome), nome]),
  );
  const bairros = [...porNomeNormalizado]
    .filter(([normalizado]) => text.includes(normalizado))
    .map(([, nome]) => nome);
  if (/\bcentral\b/.test(text) && !bairros.includes("Centro"))
    bairros.push("Centro");
  return bairros;
}

function extrairComodidades(text: string) {
  const mustHaveAmenities: string[] = [];
  const excludedAmenities: string[] = [];
  for (const comodidade of COMODIDADES) {
    if (!text.includes(comodidade)) continue;
    // "quintal arborizado" ja cobre "quintal"; nao registra os dois.
    if (comodidade === "quintal" && text.includes("quintal arborizado"))
      continue;
    const negada = new RegExp(
      `(?:sem|nao (?:quero|preciso|pode ter))\\s+(?:\\w+\\s+){0,2}${comodidade}`,
    ).test(text);
    if (negada) excludedAmenities.push(comodidade);
    else mustHaveAmenities.push(comodidade);
  }
  return { mustHaveAmenities, excludedAmenities };
}

/** Anúncios de outros sites que atendem a mesma consulta, se houver fontes. */
/** Acervo externo da imobiliária. A busca própria nunca falha por causa dele. */
async function carregarAcervoExterno(tenantId: string) {
  try {
    const [anuncios, fontes] = await Promise.all([
      externalSourceRepository.listListings(tenantId),
      externalSourceRepository.listByTenant(tenantId),
    ]);
    return { anuncios, fontes: new Map(fontes.map((f) => [f.id, f])) };
  } catch {
    return { anuncios: [], fontes: new Map() };
  }
}

/** Bairros e cidades que só existem nos anúncios externos. */
function lugaresDoAcervo(anuncios: { neighborhood: string | null; city: string | null }[]) {
  const nomes = new Set<string>();
  for (const anuncio of anuncios) {
    if (anuncio.neighborhood) nomes.add(anuncio.neighborhood);
    if (anuncio.city) nomes.add(anuncio.city);
  }
  return [...nomes];
}

function externosPara(
  acervo: Awaited<ReturnType<typeof carregarAcervoExterno>>,
  query: StructuredPropertyQuery,
) {
  if (!acervo.anuncios.length) return undefined;
  const encontrados = filtrarExternos(acervo.anuncios, query, acervo.fontes);
  return encontrados.length ? encontrados : undefined;
}

export class AISearchService {
  extractStructuredQuery(
    rawQuery: string,
    catalog: Property[] = [],
    lugaresExtras: string[] = [],
  ): StructuredPropertyQuery {
    const text = normalizarTexto(rawQuery);
    const { minPrice, maxPrice } = extrairFaixaDePreco(text);
    const { mustHaveAmenities, excludedAmenities } = extrairComodidades(text);
    return {
      rawQuery,
      intentSummary: rawQuery,
      propertyTypes: detectarTipos(text),
      purpose: detectarFinalidade(text),
      minPrice,
      maxPrice,
      minBedrooms: extrairQuantidade(
        text,
        /(\d+)\s*(?:quartos?|dormitorios?|dorms?)\b/,
      ),
      minSuites: extrairQuantidade(text, /(\d+)\s*suites?\b/),
      minParkingSpots: extrairQuantidade(text, /(\d+)\s*vagas?\b/),
      neighborhoods: extrairBairros(text, catalog, lugaresExtras),
      mustHaveAmenities,
      excludedAmenities,
      locationMode: /\b(perto|proximo|proximidades|arredores)\b/.test(text)
        ? "nearby"
        : "exact",
      semanticKeywords: PALAVRAS_SEMANTICAS.filter((termo) =>
        text.includes(termo),
      ),
      aiModelUsed: "local-rules",
    };
  }

  private rank(
    catalog: Property[],
    query: StructuredPropertyQuery,
    onlyAvailable: boolean,
  ): HybridSearchResultItem[] {
    const centers = queryCenters(query);
    const candidates = catalog.filter((property) => {
      if (
        onlyAvailable
          ? property.status !== "AVAILABLE"
          : !["AVAILABLE", "RESERVED"].includes(property.status)
      )
        return false;
      if (
        query.propertyTypes.length &&
        !query.propertyTypes.includes(property.type)
      )
        return false;
      if (
        query.purpose &&
        query.purpose !== "BOTH" &&
        property.purpose !== "BOTH" &&
        property.purpose !== query.purpose
      )
        return false;
      if (query.minPrice !== undefined && property.price < query.minPrice)
        return false;
      if (query.maxPrice !== undefined && property.price > query.maxPrice)
        return false;
      if (
        query.minBedrooms !== undefined &&
        property.bedrooms < query.minBedrooms
      )
        return false;
      if (query.minSuites !== undefined && property.suites < query.minSuites)
        return false;
      if (
        query.minParkingSpots !== undefined &&
        property.parkingSpots < query.minParkingSpots
      )
        return false;
      if (query.neighborhoods.length) {
        const exact = query.neighborhoods.some(
          (name) =>
            normalizarTexto(name) ===
            normalizarTexto(property.addressNeighborhood),
        );
        const nearby =
          query.locationMode === "nearby" &&
          centers.some(
            (center) =>
              calcularDistanciaKm(
                center.latitude,
                center.longitude,
                property.latitude,
                property.longitude,
              ) <= 3.5,
          );
        if (!exact && !nearby) return false;
      }
      const text = propertyText(property);
      if (
        !query.mustHaveAmenities.every((feature) =>
          containsFeature(text, feature),
        )
      )
        return false;
      if (
        query.excludedAmenities?.some((feature) =>
          containsFeature(text, feature),
        )
      )
        return false;
      return true;
    });
    return candidates
      .map((property) => {
        const text = propertyText(property);
        const matchedKeywords = query.semanticKeywords.filter((keyword) =>
          containsFeature(text, keyword),
        );
        const semanticScore = query.semanticKeywords.length
          ? Math.round(
              (matchedKeywords.length / query.semanticKeywords.length) * 100,
            )
          : 100;
        const distanceKm = centers.length
          ? Math.min(
              ...centers.map((center) =>
                calcularDistanciaKm(
                  center.latitude,
                  center.longitude,
                  property.latitude,
                  property.longitude,
                ),
              ),
            )
          : null;
        const exactNeighborhood = query.neighborhoods.some(
          (name) =>
            normalizarTexto(name) ===
            normalizarTexto(property.addressNeighborhood),
        );
        const geoScore =
          exactNeighborhood || distanceKm === null
            ? 100
            : Math.max(0, Math.round(100 * (1 - distanceKm / 3.5)));
        const matchReasons = [
          ...query.mustHaveAmenities.map((feature) => `Com ${feature}`),
          ...matchedKeywords.map((keyword) =>
            keyword === "catolica"
              ? "Próximo à Católica"
              : keyword === "parque malwee"
                ? "Próximo ao Parque Malwee"
                : keyword,
          ),
          ...(query.maxPrice !== undefined ? ["Dentro do orçamento"] : []),
          ...(exactNeighborhood
            ? [property.addressNeighborhood]
            : distanceKm !== null
              ? [`A ${distanceKm.toLocaleString("pt-BR")} km da região buscada`]
              : []),
          ...(query.minBedrooms !== undefined
            ? [`${property.bedrooms} quartos`]
            : []),
        ];
        return {
          property,
          hybridScore: Math.round(65 + semanticScore * 0.25 + geoScore * 0.1),
          attributeScore: 100,
          semanticScore,
          geoScore,
          distanceKm,
          matchReasons: matchReasons.length
            ? matchReasons
            : [
                PROPERTY_TYPE_LABELS[property.type],
                property.addressNeighborhood,
              ],
        };
      })
      .sort(
        (a, b) =>
          b.hybridScore - a.hybridScore || a.property.price - b.property.price,
      );
  }

  async searchHybrid(
    tenantId: string,
    rawQuery: string,
    onlyAvailable = false,
  ): Promise<HybridSearchResponse> {
    const start = performance.now();
    const [catalog, acervo] = await Promise.all([
      propertyRepository.findAllByTenant(tenantId),
      carregarAcervoExterno(tenantId),
    ]);
    const query = this.extractStructuredQuery(
      rawQuery,
      catalog,
      lugaresDoAcervo(acervo.anuncios),
    );
    return {
      query,
      results: this.rank(catalog, query, onlyAvailable),
      externalResults: externosPara(acervo, query),
      executionTimeMs: Math.round(performance.now() - start),
      totalCandidatesEvaluated: catalog.length,
      interpretation: { mode: "local", reason: "not_configured" },
    };
  }

  async searchWithAI(
    tenantId: string,
    rawQuery: string,
    onlyAvailable = true,
    signal?: AbortSignal,
  ): Promise<HybridSearchResponse> {
    const start = performance.now();
    signal?.throwIfAborted();
    const [catalog, acervo] = await Promise.all([
      propertyRepository.findAllByTenant(tenantId),
      carregarAcervoExterno(tenantId),
    ]);
    const lugares = lugaresDoAcervo(acervo.anuncios);
    let query = this.extractStructuredQuery(rawQuery, catalog, lugares);
    let interpretation: NonNullable<HybridSearchResponse["interpretation"]> = {
      mode: "local",
      reason: "not_configured",
    };
    if (geminiConfigured()) {
      try {
        query = await interpretPropertyQuery(
          rawQuery,
          catalog,
          signal,
          lugares,
        );
        interpretation = { mode: "ai" };
      } catch {
        if (signal?.aborted) throw signal.reason;
        interpretation = { mode: "local", reason: "unavailable" };
      }
    }
    return {
      query,
      results: this.rank(catalog, query, onlyAvailable),
      externalResults: externosPara(acervo, query),
      executionTimeMs: Math.round(performance.now() - start),
      totalCandidatesEvaluated: catalog.length,
      interpretation,
    };
  }
}

export const aiSearchService = new AISearchService();

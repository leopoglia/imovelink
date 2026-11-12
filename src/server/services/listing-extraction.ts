import * as cheerio from "cheerio";
import { z } from "zod";

/**
 * Extração determinística de anúncios a partir do HTML de uma listagem.
 *
 * O mapa de extração é inferido uma única vez por fonte e guardado em
 * imovelink.external_sources.extraction_map. A coleta reaplica esse mapa sem
 * consultar IA: dado o mesmo HTML e o mesmo mapa, o resultado é sempre igual.
 */

const campoSchema = z.object({
  /** Seletor CSS relativo ao elemento do anúncio. */
  selector: z.string().min(1).max(300),
  /** Lê um atributo em vez do texto do elemento. */
  attr: z.string().min(1).max(60).optional(),
  /** Expressão para isolar parte do valor; o grupo 1 vence, senão o casamento inteiro. */
  match: z.string().min(1).max(300).optional(),
});

export const extractionMapSchema = z.object({
  /** Seletor que isola cada anúncio na página. */
  item: z.string().min(1).max(300),
  fields: z.object({
    url: campoSchema,
    title: campoSchema,
    price: campoSchema.optional(),
    address: campoSchema.optional(),
    bedrooms: campoSchema.optional(),
    parkingSpots: campoSchema.optional(),
    areaTotal: campoSchema.optional(),
    image: campoSchema.optional(),
  }),
});

export type ExtractionMap = z.infer<typeof extractionMapSchema>;
type Campo = z.infer<typeof campoSchema>;

export interface ExtractedListing {
  url: string;
  title: string;
  price?: number;
  neighborhood?: string;
  city?: string;
  bedrooms?: number;
  parkingSpots?: number;
  areaTotal?: number;
  imageUrl?: string;
}

/** "R$160.000,00" e "1.234,5" usam ponto de milhar e vírgula decimal. */
export function parseNumeroBR(texto: string): number | undefined {
  const limpo = texto.replace(/[^\d.,]/g, "");
  if (!limpo) return undefined;
  const normalizado = limpo.includes(",")
    ? limpo.replace(/\./g, "").replace(",", ".")
    : limpo.replace(/\.(?=\d{3}\b)/g, "");
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : undefined;
}

/** "R. Tal - Corticeira, Guaramirim - SC" → bairro e cidade. */
export function parseEndereco(texto: string): {
  neighborhood?: string;
  city?: string;
} {
  const partes = texto
    .split(/[-,]/)
    .map((parte) => parte.trim())
    .filter(Boolean);
  // O último trecho costuma ser a UF; cidade e bairro vêm logo antes.
  const semUf = partes.filter((parte) => !/^[A-Z]{2}$/.test(parte));
  if (semUf.length < 2) return {};
  return {
    neighborhood: semUf[semUf.length - 2],
    city: semUf[semUf.length - 1],
  };
}

function lerCampo(
  $: cheerio.CheerioAPI,
  raiz: ReturnType<cheerio.CheerioAPI>,
  campo: Campo | undefined,
): string | undefined {
  if (!campo) return undefined;
  const alvo = raiz.find(campo.selector).first();
  if (!alvo.length) return undefined;
  const bruto = campo.attr ? alvo.attr(campo.attr) : alvo.text();
  if (bruto === undefined) return undefined;
  const valor = bruto.replace(/\s+/g, " ").trim();
  if (!campo.match) return valor || undefined;
  const encontrado = new RegExp(campo.match).exec(valor);
  if (!encontrado) return undefined;
  return (encontrado[1] ?? encontrado[0]).trim() || undefined;
}

/**
 * Aplica o mapa ao HTML. Anúncios sem URL ou sem título são descartados: sem
 * esses dois não há o que indexar nem para onde mandar o usuário.
 */
export function extrairAnuncios(
  html: string,
  mapa: ExtractionMap,
  baseUrl: string,
): ExtractedListing[] {
  const $ = cheerio.load(html);
  const anuncios: ExtractedListing[] = [];

  $(mapa.item).each((_, elemento) => {
    const raiz = $(elemento);
    const href = lerCampo($, raiz, mapa.fields.url);
    const title = lerCampo($, raiz, mapa.fields.title);
    if (!href || !title) return;

    let url: string;
    try {
      // Listagens costumam usar caminho relativo; o destino precisa ser absoluto.
      url = new URL(href, baseUrl).toString();
    } catch {
      return;
    }

    const imagemBruta = lerCampo($, raiz, mapa.fields.image);
    // A foto costuma vir em caminho relativo, igual ao link do anúncio.
    let imageUrl: string | undefined;
    if (imagemBruta) {
      try {
        imageUrl = new URL(imagemBruta, baseUrl).toString();
      } catch {
        imageUrl = undefined;
      }
    }

    const precoTexto = lerCampo($, raiz, mapa.fields.price);
    const enderecoTexto = lerCampo($, raiz, mapa.fields.address);
    const numero = (campo: Campo | undefined) => {
      const texto = lerCampo($, raiz, campo);
      return texto === undefined ? undefined : parseNumeroBR(texto);
    };

    anuncios.push({
      url,
      title,
      price: precoTexto === undefined ? undefined : parseNumeroBR(precoTexto),
      ...(enderecoTexto ? parseEndereco(enderecoTexto) : {}),
      bedrooms: numero(mapa.fields.bedrooms),
      parkingSpots: numero(mapa.fields.parkingSpots),
      areaTotal: numero(mapa.fields.areaTotal),
      imageUrl,
    });
  });

  return anuncios;
}

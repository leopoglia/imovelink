import { extrairAnuncios, type ExtractionMap } from "./listing-extraction";

/**
 * Descoberta do padrão de paginação de uma listagem.
 *
 * Não adivinhamos: cada candidato é testado contra a página 2 e só é aceito se
 * trouxer anúncios que não estavam na página 1. Um padrão errado normalmente
 * devolve a primeira página de novo, e a comparação de URLs detecta isso.
 */

/** `{n}` é substituído pelo número da página. */
export const MARCADOR = "{n}";

/** Formatos comuns em portais imobiliários brasileiros, do mais específico ao mais genérico. */
export function candidatosDeTemplate(base: string): string[] {
  const url = new URL(base);
  const semBarra = url.href.replace(/\/$/, "");
  const separador = url.search ? "&" : "?";
  return [
    `${semBarra}-pagina-${MARCADOR}`,
    `${semBarra}/page/${MARCADOR}`,
    `${semBarra}${separador}page=${MARCADOR}`,
    `${semBarra}${separador}pagina=${MARCADOR}`,
  ];
}

export function montarUrlPagina(template: string, pagina: number): string {
  return template.split(MARCADOR).join(String(pagina));
}

export interface ResultadoPaginacao {
  template: string | null;
  /** Motivo da ausência de template, útil para explicar na interface. */
  reason?: "NO_PATTERN_WORKED" | "SINGLE_PAGE";
}

/**
 * Testa os candidatos contra a página 2.
 * @param buscar devolve o HTML de uma URL, ou null se a página não existir.
 */
export async function descobrirPaginacao(
  baseUrl: string,
  mapa: ExtractionMap,
  urlsDaPrimeiraPagina: string[],
  buscar: (url: string) => Promise<string | null>,
): Promise<ResultadoPaginacao> {
  if (!urlsDaPrimeiraPagina.length) return { template: null, reason: "SINGLE_PAGE" };
  const conhecidas = new Set(urlsDaPrimeiraPagina);

  for (const template of candidatosDeTemplate(baseUrl)) {
    const alvo = montarUrlPagina(template, 2);
    let html: string | null;
    try {
      html = await buscar(alvo);
    } catch {
      continue;
    }
    if (!html) continue;

    const anuncios = extrairAnuncios(html, mapa, alvo);
    if (!anuncios.length) continue;
    // A prova: pelo menos um anúncio que a primeira página não tinha.
    const novos = anuncios.filter((anuncio) => !conhecidas.has(anuncio.url));
    if (novos.length) return { template };
  }
  return { template: null, reason: "NO_PATTERN_WORKED" };
}

/**
 * Percorre as páginas aplicando o mapa, parando quando a página não traz
 * nenhum anúncio inédito ou quando o teto é atingido.
 */
export async function percorrerPaginas(
  template: string | null,
  primeiraPagina: { url: string; html: string },
  mapa: ExtractionMap,
  buscar: (url: string) => Promise<string | null>,
  maxPaginas: number,
  aguardar?: (ms: number) => Promise<void>,
  intervaloMs = 0,
) {
  const vistas = new Map<string, ReturnType<typeof extrairAnuncios>[number]>();
  for (const anuncio of extrairAnuncios(
    primeiraPagina.html,
    mapa,
    primeiraPagina.url,
  ))
    vistas.set(anuncio.url, anuncio);

  if (!template) return { anuncios: [...vistas.values()], paginas: 1 };

  let paginas = 1;
  for (let numero = 2; numero <= maxPaginas; numero++) {
    if (intervaloMs && aguardar) await aguardar(intervaloMs);
    const alvo = montarUrlPagina(template, numero);
    let html: string | null;
    try {
      html = await buscar(alvo);
    } catch {
      break;
    }
    if (!html) break;

    const anuncios = extrairAnuncios(html, mapa, alvo);
    const inéditos = anuncios.filter((anuncio) => !vistas.has(anuncio.url));
    // Repetir a mesma página é o sinal de que a listagem acabou.
    if (!inéditos.length) break;
    for (const anuncio of inéditos) vistas.set(anuncio.url, anuncio);
    paginas = numero;
  }
  return { anuncios: [...vistas.values()], paginas };
}

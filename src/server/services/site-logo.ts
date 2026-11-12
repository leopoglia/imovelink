import * as cheerio from "cheerio";

/**
 * Descobre o logo de um site a partir do HTML da listagem.
 *
 * A ordem favorece ícones de marca: eles identificam a imobiliária. O
 * `og:image` vem depois porque em página de listagem costuma ser a foto de um
 * imóvel, não a marca. Como tudo aqui, guardamos só a URL.
 */

/** Maior tamanho declarado em `sizes="32x32 16x16"`, para escolher o ícone melhor. */
function maiorTamanho(sizes: string | undefined): number {
  if (!sizes) return 0;
  const numeros = sizes.match(/\d+/g);
  return numeros ? Math.max(...numeros.map(Number)) : 0;
}

export function detectarLogo(html: string, baseUrl: string): string | null {
  const $ = cheerio.load(html);

  const candidatos: string[] = [];
  const apple = $('link[rel="apple-touch-icon"]').attr("href");
  if (apple) candidatos.push(apple);

  // Entre vários <link rel="icon">, o de maior resolução declarada.
  const icones = $('link[rel~="icon"]')
    .toArray()
    .map((elemento) => ({
      href: $(elemento).attr("href"),
      tamanho: maiorTamanho($(elemento).attr("sizes")),
    }))
    .filter((item): item is { href: string; tamanho: number } =>
      Boolean(item.href),
    )
    .sort((a, b) => b.tamanho - a.tamanho);
  candidatos.push(...icones.map((item) => item.href));

  const og = $('meta[property="og:image"]').attr("content");
  if (og) candidatos.push(og);

  candidatos.push("/favicon.ico");

  for (const candidato of candidatos) {
    try {
      return new URL(candidato, baseUrl).toString();
    } catch {
      continue;
    }
  }
  return null;
}

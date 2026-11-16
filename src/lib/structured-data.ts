const ENDERECO_PADRAO = "https://imovelink.site";

/** Endereço público do site, sem barra final. Vem de APP_ORIGIN em produção. */
export function publicOrigin(): string {
  return (process.env.APP_ORIGIN?.trim() || ENDERECO_PADRAO).replace(
    /\/+$/,
    "",
  );
}

/**
 * Serializa dados para uma tag <script type="application/ld+json">.
 * O "<" é escapado para que um texto cadastrado (título, descrição) contendo
 * "</script>" não encerre a tag e injete HTML na página pública.
 */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/**
 * Só endereços http(s) podem virar link ou imagem na tela. Outros esquemas,
 * como `javascript:` ou `data:`, são recusados.
 */
export function ehLinkHttp(valor: string | null | undefined): boolean {
  if (!valor) return false;
  try {
    const url = new URL(valor.trim());
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/** Texto mostrado depois de "Coletar": quantos vieram e quantos saíram da origem. */
export function resumoDaColeta(resultado: {
  collected?: number;
  complete?: boolean;
  removed?: number;
}): string {
  const coletados = resultado.collected ?? 0;
  const base =
    coletados === 1 ? "1 anúncio coletado." : `${coletados} anúncios coletados.`;
  if (!resultado.complete)
    return `${base} A listagem não foi lida até o fim, então anúncios que saíram do site não foram conferidos.`;
  const saidos = resultado.removed ?? 0;
  if (saidos === 0) return `${base} Nenhum anúncio saiu do site.`;
  return saidos === 1
    ? `${base} 1 anúncio saiu do site e deixou de aparecer em Imóveis.`
    : `${base} ${saidos} anúncios saíram do site e deixaram de aparecer em Imóveis.`;
}

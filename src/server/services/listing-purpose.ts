import type { PropertyPurpose } from "@/types/domain";

/**
 * Deduz venda ou locação a partir do endereço da listagem.
 *
 * Portais filtram por finalidade no próprio caminho da URL. A sugestão é só um
 * padrão: quem cadastra a fonte confirma ou corrige antes de salvar, porque uma
 * finalidade errada faria o valor mensal de um aluguel competir com preços de
 * venda na busca.
 */
const PADRAO_VENDA = /\b(venda|vender|comprar|compra|a-venda)\b/i;
const PADRAO_LOCACAO = /\b(aluguel|alugar|locacao|loca[çc][aã]o|alugue)\b/i;

export function sugerirFinalidade(url: string): PropertyPurpose | null {
  let alvo = url;
  try {
    const endereco = new URL(url);
    alvo = decodeURIComponent(endereco.pathname + endereco.search);
  } catch {
    // Texto que não é URL ainda pode conter a palavra-chave.
  }
  const normalizado = alvo.replace(/[-_/+]/g, " ");
  const venda = PADRAO_VENDA.test(normalizado);
  const locacao = PADRAO_LOCACAO.test(normalizado);
  // Os dois na mesma URL não decidem nada: o gestor escolhe.
  if (venda === locacao) return null;
  return venda ? "SALE" : "RENT";
}

import { NextResponse } from "next/server";
import { metricas } from "@/server/observability/metrics";
import { externalSourceRepository } from "@/server/repositories/external-source.repository";
import { getPostgres, isPostgresConfigured } from "@/server/database/postgres";

/**
 * Endpoint lido pelo Prometheus.
 *
 * Não exige sessão: o Prometheus raspa sem credencial, e aqui só saem
 * contadores e medidas agregadas — nenhum dado de imóvel, cliente ou usuário.
 * Numa publicação real este caminho ficaria restrito à rede interna.
 */
export const dynamic = "force-dynamic";

/** Mede o banco com um prazo curto: a raspagem não pode travar por causa dele. */
async function medirBanco(): Promise<boolean> {
  if (!isPostgresConfigured()) return false;
  try {
    await Promise.race([
      getPostgres()`SELECT 1`,
      new Promise((_, rejeitar) =>
        setTimeout(() => rejeitar(new Error("TIMEOUT")), 2000),
      ),
    ]);
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  const m = metricas();

  m.bancoDisponivel.set((await medirBanco()) ? 1 : 0);

  // Métrica de negócio: quantos anúncios cada fonte mantém indexados.
  try {
    const anuncios = await externalSourceRepository.listAllListings();
    const porFonte = new Map<string, number>();
    for (const anuncio of anuncios)
      porFonte.set(anuncio.sourceId, (porFonte.get(anuncio.sourceId) ?? 0) + 1);
    m.anunciosExternos.reset();
    for (const [fonte, total] of porFonte)
      m.anunciosExternos.set({ fonte }, total);
  } catch {
    // Falha ao contar anúncios não pode derrubar a exposição das demais métricas.
  }

  return new NextResponse(await m.registry.metrics(), {
    headers: {
      "Content-Type": m.registry.contentType,
      "Cache-Control": "no-store",
    },
  });
}

import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { ExternalListing, UserRole } from "@/types/domain";
import { hasPermission } from "@/lib/auth/rbac";
import { externalSourceRepository } from "@/server/repositories/external-source.repository";
import { buscarListagem } from "./crawler-fetch";
import { descobrirMapaExtracao } from "./extraction-discovery";
import {
  extractionMapSchema,
  extrairAnuncios,
  type ExtractedListing,
} from "./listing-extraction";

/**
 * Cadastro de fontes externas e coleta dos anúncios.
 *
 * Quem pode administrar fontes é decidido pelo papel da sessão, nunca por
 * dado vindo do cliente. A imobiliária também vem da sessão.
 */

export class CrawlerError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export const novaFonteSchema = z.object({
  name: z.string().trim().min(2).max(120),
  listUrl: z.string().trim().url().max(2000),
  extractionMap: extractionMapSchema,
});

function exigirPermissao(role: UserRole) {
  if (!hasPermission(role, "crawler:manage"))
    throw new CrawlerError(
      "Apenas gestores podem administrar fontes externas.",
      403,
    );
}

/** Identifica o conteúdo do anúncio para detectar mudança entre coletas. */
function hashConteudo(anuncio: ExtractedListing): string {
  return createHash("sha256")
    .update(
      [
        anuncio.title,
        anuncio.price,
        anuncio.neighborhood,
        anuncio.city,
        anuncio.bedrooms,
        anuncio.parkingSpots,
        anuncio.areaTotal,
      ].join("|"),
    )
    .digest("hex");
}

function paraRegistro(
  anuncio: ExtractedListing,
  sourceId: string,
  tenantId: string,
): ExternalListing {
  const agora = new Date().toISOString();
  return {
    id: randomUUID(),
    sourceId,
    tenantId,
    url: anuncio.url,
    title: anuncio.title,
    price: anuncio.price ?? null,
    neighborhood: anuncio.neighborhood ?? null,
    city: anuncio.city ?? null,
    bedrooms: anuncio.bedrooms ?? null,
    parkingSpots: anuncio.parkingSpots ?? null,
    areaTotal: anuncio.areaTotal ?? null,
    contentHash: hashConteudo(anuncio),
    firstSeenAt: agora,
    lastSeenAt: agora,
  };
}

export class CrawlerService {
  /**
   * Busca a página e descobre como lê-la, sem gravar nada. A amostra volta
   * para o gestor conferir: a descoberta é assistida por IA e precisa de aval
   * humano antes de virar uma fonte cadastrada.
   */
  async analisar(role: UserRole, listUrl: string, signal?: AbortSignal) {
    exigirPermissao(role);
    const { html, url } = await buscarListagem(listUrl, signal);
    const { map, sample, total } = await descobrirMapaExtracao(
      html,
      url.toString(),
      signal,
    );
    return { listUrl: url.toString(), extractionMap: map, sample, total };
  }

  async listar(role: UserRole, tenantId: string) {
    exigirPermissao(role);
    return externalSourceRepository.listByTenant(tenantId);
  }

  async salvar(
    role: UserRole,
    tenantId: string,
    entrada: z.infer<typeof novaFonteSchema>,
  ) {
    exigirPermissao(role);
    const dados = novaFonteSchema.parse(entrada);
    const agora = new Date().toISOString();
    return externalSourceRepository.create({
      id: randomUUID(),
      tenantId,
      name: dados.name,
      listUrl: dados.listUrl,
      extractionMap: dados.extractionMap,
      active: true,
      lastCrawledAt: null,
      lastError: null,
      createdAt: agora,
      updatedAt: agora,
    });
  }

  /**
   * Recoleta uma fonte já cadastrada aplicando o mapa salvo. Não usa IA: o
   * resultado depende só do HTML e do mapa.
   */
  async coletar(
    role: UserRole,
    tenantId: string,
    sourceId: string,
    signal?: AbortSignal,
  ) {
    exigirPermissao(role);
    const fonte = await externalSourceRepository.findById(tenantId, sourceId);
    if (!fonte) throw new CrawlerError("Fonte não encontrada.", 404);

    const mapa = extractionMapSchema.safeParse(fonte.extractionMap);
    if (!mapa.success)
      throw new CrawlerError(
        "Esta fonte não tem um mapa válido. Analise a página novamente.",
      );

    try {
      const { html, url } = await buscarListagem(fonte.listUrl, signal);
      const anuncios = extrairAnuncios(html, mapa.data, url.toString());
      if (!anuncios.length) {
        // A página mudou de estrutura: o mapa salvo não serve mais.
        await externalSourceRepository.registrarColeta(
          tenantId,
          sourceId,
          "MAP_MATCHED_NOTHING",
        );
        throw new CrawlerError(
          "A página mudou e o mapa salvo não encontrou anúncios. Analise novamente.",
        );
      }
      const gravados = await externalSourceRepository.upsertListings(
        anuncios.map((anuncio) => paraRegistro(anuncio, sourceId, tenantId)),
      );
      await externalSourceRepository.registrarColeta(tenantId, sourceId, null);
      return { collected: gravados };
    } catch (erro) {
      if (erro instanceof CrawlerError) throw erro;
      const codigo =
        erro && typeof erro === "object" && "code" in erro
          ? String((erro as { code: unknown }).code)
          : "UNKNOWN";
      await externalSourceRepository.registrarColeta(
        tenantId,
        sourceId,
        codigo,
      );
      throw new CrawlerError(`Não foi possível coletar esta fonte: ${codigo}.`);
    }
  }

  async anuncios(role: UserRole, tenantId: string, sourceId?: string) {
    exigirPermissao(role);
    return externalSourceRepository.listListings(tenantId, sourceId);
  }

  async alternarAtiva(
    role: UserRole,
    tenantId: string,
    sourceId: string,
    active: boolean,
  ) {
    exigirPermissao(role);
    await externalSourceRepository.setActive(tenantId, sourceId, active);
  }

  async remover(role: UserRole, tenantId: string, sourceId: string) {
    exigirPermissao(role);
    await externalSourceRepository.remove(tenantId, sourceId);
  }
}

export const crawlerService = new CrawlerService();

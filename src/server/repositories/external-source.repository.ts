import type { ExternalListing, ExternalSource } from "@/types/domain";
import { getDb } from "./memory-store";
import {
  databaseRecord,
  domainRecord,
  getPostgres,
  isPostgresConfigured,
} from "@/server/database/postgres";

/**
 * Fontes externas e os anúncios indexados a partir delas.
 * Toda consulta é restrita ao tenant da sessão, como nos demais repositórios.
 */
export class ExternalSourceRepository {
  async listByTenant(tenantId: string): Promise<ExternalSource[]> {
    if (isPostgresConfigured()) {
      const rows =
        await getPostgres()`SELECT * FROM imovelink.external_sources WHERE tenant_id = ${tenantId} ORDER BY created_at DESC`;
      return rows.map((row) => domainRecord<ExternalSource>(row));
    }
    return getDb()
      .externalSources.filter((fonte) => fonte.tenantId === tenantId)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  async findById(
    tenantId: string,
    sourceId: string,
  ): Promise<ExternalSource | undefined> {
    if (isPostgresConfigured()) {
      const [row] =
        await getPostgres()`SELECT * FROM imovelink.external_sources WHERE tenant_id = ${tenantId} AND id = ${sourceId}`;
      return row ? domainRecord<ExternalSource>(row) : undefined;
    }
    return getDb().externalSources.find(
      (fonte) => fonte.tenantId === tenantId && fonte.id === sourceId,
    );
  }

  /**
   * Cadastra a fonte ou atualiza a existente com a mesma URL. Reanalisar uma
   * página é como o gestor corrige um mapa que parou de funcionar.
   */
  async create(source: ExternalSource): Promise<ExternalSource> {
    if (isPostgresConfigured()) {
      const sql = getPostgres();
      const [row] =
        await sql`INSERT INTO imovelink.external_sources ${sql(databaseRecord(source))}
          ON CONFLICT (tenant_id, list_url) DO UPDATE SET
            name = EXCLUDED.name,
            extraction_map = EXCLUDED.extraction_map,
            logo_url = EXCLUDED.logo_url,
            purpose = EXCLUDED.purpose,
            pagination_template = EXCLUDED.pagination_template,
            max_pages = EXCLUDED.max_pages,
            last_error = NULL,
            updated_at = NOW()
          RETURNING *`;
      return domainRecord<ExternalSource>(row);
    }
    const db = getDb();
    const existente = db.externalSources.find(
      (item) =>
        item.tenantId === source.tenantId && item.listUrl === source.listUrl,
    );
    if (existente) {
      Object.assign(existente, source, {
        id: existente.id,
        createdAt: existente.createdAt,
        lastCrawledAt: existente.lastCrawledAt,
        lastError: null,
      });
      return existente;
    }
    db.externalSources.unshift(source);
    return source;
  }

  /** Registra o desfecho de uma coleta, com ou sem erro. */
  async registrarColeta(
    tenantId: string,
    sourceId: string,
    erro: string | null,
  ): Promise<void> {
    if (isPostgresConfigured()) {
      await getPostgres()`UPDATE imovelink.external_sources
        SET last_crawled_at = NOW(), last_error = ${erro}, updated_at = NOW()
        WHERE tenant_id = ${tenantId} AND id = ${sourceId}`;
      return;
    }
    const fonte = getDb().externalSources.find(
      (item) => item.tenantId === tenantId && item.id === sourceId,
    );
    if (!fonte) return;
    fonte.lastCrawledAt = new Date().toISOString();
    fonte.lastError = erro;
    fonte.updatedAt = fonte.lastCrawledAt;
  }

  async setActive(
    tenantId: string,
    sourceId: string,
    active: boolean,
  ): Promise<void> {
    if (isPostgresConfigured()) {
      await getPostgres()`UPDATE imovelink.external_sources
        SET active = ${active}, updated_at = NOW()
        WHERE tenant_id = ${tenantId} AND id = ${sourceId}`;
      return;
    }
    const fonte = getDb().externalSources.find(
      (item) => item.tenantId === tenantId && item.id === sourceId,
    );
    if (fonte) fonte.active = active;
  }

  async setMaxPages(
    tenantId: string,
    sourceId: string,
    maxPages: number,
  ): Promise<void> {
    if (isPostgresConfigured()) {
      await getPostgres()`UPDATE imovelink.external_sources
        SET max_pages = ${maxPages}, updated_at = NOW()
        WHERE tenant_id = ${tenantId} AND id = ${sourceId}`;
      return;
    }
    const fonte = getDb().externalSources.find(
      (item) => item.tenantId === tenantId && item.id === sourceId,
    );
    if (fonte) fonte.maxPages = maxPages;
  }

  async remove(tenantId: string, sourceId: string): Promise<void> {
    if (isPostgresConfigured()) {
      // Os anúncios saem junto pela chave estrangeira com ON DELETE CASCADE.
      await getPostgres()`DELETE FROM imovelink.external_sources WHERE tenant_id = ${tenantId} AND id = ${sourceId}`;
      return;
    }
    const db = getDb();
    db.externalSources = db.externalSources.filter(
      (item) => !(item.tenantId === tenantId && item.id === sourceId),
    );
    db.externalListings = db.externalListings.filter(
      (item) => item.sourceId !== sourceId,
    );
  }

  async listListings(
    tenantId: string,
    sourceId?: string,
  ): Promise<ExternalListing[]> {
    if (isPostgresConfigured()) {
      const sql = getPostgres();
      const rows = sourceId
        ? await sql`SELECT * FROM imovelink.external_listings WHERE tenant_id = ${tenantId} AND source_id = ${sourceId} ORDER BY last_seen_at DESC`
        : await sql`SELECT * FROM imovelink.external_listings WHERE tenant_id = ${tenantId} ORDER BY last_seen_at DESC`;
      return rows.map((row) => domainRecord<ExternalListing>(row));
    }
    return getDb()
      .externalListings.filter(
        (anuncio) =>
          anuncio.tenantId === tenantId &&
          (!sourceId || anuncio.sourceId === sourceId),
      )
      .sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt));
  }

  /**
   * Grava os anúncios de uma coleta. A chave é (tenant_id, url): a URL
   * identifica o imóvel, então duas fontes que encontram o mesmo anúncio
   * atualizam a mesma linha em vez de duplicá-la.
   */
  async upsertListings(anuncios: ExternalListing[]): Promise<number> {
    if (!anuncios.length) return 0;
    if (isPostgresConfigured()) {
      const sql = getPostgres();
      for (const anuncio of anuncios) {
        await sql`INSERT INTO imovelink.external_listings ${sql(databaseRecord(anuncio))}
          ON CONFLICT (tenant_id, url) DO UPDATE SET
            source_id = EXCLUDED.source_id,
            title = EXCLUDED.title,
            price = EXCLUDED.price,
            neighborhood = EXCLUDED.neighborhood,
            city = EXCLUDED.city,
            bedrooms = EXCLUDED.bedrooms,
            parking_spots = EXCLUDED.parking_spots,
            area_total = EXCLUDED.area_total,
            image_url = EXCLUDED.image_url,
            purpose = EXCLUDED.purpose,
            content_hash = EXCLUDED.content_hash,
            last_seen_at = NOW()`;
      }
      return anuncios.length;
    }
    const db = getDb();
    for (const anuncio of anuncios) {
      const existente = db.externalListings.find(
        (item) => item.tenantId === anuncio.tenantId && item.url === anuncio.url,
      );
      if (existente)
        Object.assign(existente, anuncio, {
          id: existente.id,
          // A primeira vez que o imóvel foi visto não se perde ao reencontrá-lo.
          firstSeenAt: existente.firstSeenAt,
          lastSeenAt: new Date().toISOString(),
        });
      else db.externalListings.push(anuncio);
    }
    return anuncios.length;
  }
}

export const externalSourceRepository = new ExternalSourceRepository();

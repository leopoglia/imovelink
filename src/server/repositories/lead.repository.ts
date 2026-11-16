import type { Lead, LeadStage } from "@/types/domain";
import { getDb } from "./memory-store";
import {
  databaseRecord,
  domainRecord,
  getPostgres,
  isPostgresConfigured,
} from "@/server/database/postgres";

export class LeadRepository {
  async create(lead: Lead): Promise<Lead> {
    if (isPostgresConfigured()) {
      const sql = getPostgres();
      const [row] =
        await sql`INSERT INTO imovelink.leads ${sql(databaseRecord(lead))} RETURNING *`;
      return domainRecord<Lead>(row);
    }
    const db = getDb();
    db.leads.unshift(lead);
    return lead;
  }

  /** Contatos da imobiliária, do mais recente para o mais antigo. */
  async findAllByTenant(tenantId: string): Promise<Lead[]> {
    if (isPostgresConfigured()) {
      const rows =
        await getPostgres()`SELECT * FROM imovelink.leads WHERE tenant_id = ${tenantId} ORDER BY created_at DESC`;
      return rows.map((row) => domainRecord<Lead>(row));
    }
    return getDb()
      .leads.filter((lead) => lead.tenantId === tenantId)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  /**
   * Muda a etapa de um contato. O filtro por imobiliária faz parte da própria
   * consulta: um identificador de outra imobiliária não encontra nada.
   */
  async updateStage(
    tenantId: string,
    leadId: string,
    stage: LeadStage,
  ): Promise<Lead | null> {
    if (isPostgresConfigured()) {
      const [row] =
        await getPostgres()`UPDATE imovelink.leads SET stage = ${stage}, updated_at = NOW() WHERE tenant_id = ${tenantId} AND id = ${leadId} RETURNING *`;
      return row ? domainRecord<Lead>(row) : null;
    }
    const lead = getDb().leads.find(
      (item) => item.tenantId === tenantId && item.id === leadId,
    );
    if (!lead) return null;
    lead.stage = stage;
    lead.updatedAt = new Date().toISOString();
    return lead;
  }
}
export const leadRepository = new LeadRepository();

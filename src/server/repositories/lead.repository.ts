import type { Lead } from "@/types/domain";
import { getDb } from "./memory-store";
import {
  databaseRecord,
  domainRecord,
  getPostgres,
  isPostgresConfigured,
} from "@/server/database/postgres";

/** Campos que uma edição pode alterar. Identidade, imobiliária e datas ficam de fora. */
const EDITAVEIS = new Set<keyof Lead>([
  "name",
  "email",
  "phone",
  "stage",
  "naturalSearchDesire",
  "aiScore",
  "aiTemperature",
  "aiExtractedProfile",
  "budgetMin",
  "budgetMax",
]);

export type LeadUpdates = Partial<
  Pick<
    Lead,
    | "name"
    | "email"
    | "phone"
    | "stage"
    | "naturalSearchDesire"
    | "aiScore"
    | "aiTemperature"
    | "aiExtractedProfile"
    | "budgetMin"
    | "budgetMax"
  >
>;

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

  async findById(tenantId: string, leadId: string): Promise<Lead | null> {
    if (isPostgresConfigured()) {
      const [row] =
        await getPostgres()`SELECT * FROM imovelink.leads WHERE tenant_id = ${tenantId} AND id = ${leadId}`;
      return row ? domainRecord<Lead>(row) : null;
    }
    return (
      getDb().leads.find(
        (item) => item.tenantId === tenantId && item.id === leadId,
      ) ?? null
    );
  }

  /**
   * Altera um contato. O filtro por imobiliária faz parte da própria consulta:
   * um identificador de outra imobiliária não encontra nada.
   */
  async update(
    tenantId: string,
    leadId: string,
    updates: LeadUpdates,
  ): Promise<Lead | null> {
    const safeUpdates = {
      ...Object.fromEntries(
        Object.entries(updates).filter(
          ([key, value]) =>
            EDITAVEIS.has(key as keyof Lead) && value !== undefined,
        ),
      ),
      updatedAt: new Date().toISOString(),
    };
    if (isPostgresConfigured()) {
      const sql = getPostgres();
      const [row] =
        await sql`UPDATE imovelink.leads SET ${sql(databaseRecord(safeUpdates))} WHERE tenant_id = ${tenantId} AND id = ${leadId} RETURNING *`;
      return row ? domainRecord<Lead>(row) : null;
    }
    const lead = getDb().leads.find(
      (item) => item.tenantId === tenantId && item.id === leadId,
    );
    if (!lead) return null;
    Object.assign(lead, safeUpdates);
    return lead;
  }

  /** Exclui um contato da imobiliária. Devolve false se ele não existia. */
  async delete(tenantId: string, leadId: string): Promise<boolean> {
    if (isPostgresConfigured()) {
      const rows =
        await getPostgres()`DELETE FROM imovelink.leads WHERE tenant_id = ${tenantId} AND id = ${leadId} RETURNING id`;
      return rows.length > 0;
    }
    const db = getDb();
    const index = db.leads.findIndex(
      (item) => item.tenantId === tenantId && item.id === leadId,
    );
    if (index === -1) return false;
    db.leads.splice(index, 1);
    return true;
  }
}
export const leadRepository = new LeadRepository();

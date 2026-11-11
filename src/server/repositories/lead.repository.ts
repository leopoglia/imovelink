import type { Lead } from "@/types/domain";
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
}
export const leadRepository = new LeadRepository();

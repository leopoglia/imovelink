import type { Property, PropertyAuditLog } from "@/types/domain";
import { getDb, salvarNoDisco } from "./database-store";
import {
  databaseRecord,
  domainRecord,
  getPostgres,
  isPostgresConfigured,
} from "@/server/database/postgres";

export class PropertyRepository {
  async findAllByTenant(tenantId: string): Promise<Property[]> {
    if (isPostgresConfigured()) {
      const rows =
        await getPostgres()`SELECT * FROM imovelink.properties WHERE tenant_id = ${tenantId} ORDER BY updated_at DESC`;
      return rows.map((row) => domainRecord<Property>(row));
    }
    return getDb()
      .properties.filter((p) => p.tenantId === tenantId)
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }

  async findById(
    tenantId: string,
    propertyId: string,
  ): Promise<Property | undefined> {
    if (isPostgresConfigured()) {
      const [row] =
        await getPostgres()`SELECT * FROM imovelink.properties WHERE tenant_id = ${tenantId} AND id = ${propertyId}`;
      return row ? domainRecord<Property>(row) : undefined;
    }
    return getDb().properties.find(
      (p) => p.tenantId === tenantId && p.id === propertyId,
    );
  }

  async nextCode(tenantId: string): Promise<string> {
    if (isPostgresConfigured()) {
      const sql = getPostgres();
      const [tenant] =
        await sql`SELECT id FROM imovelink.tenants WHERE id = ${tenantId} FOR UPDATE`;
      if (!tenant) throw new Error("Imobiliária não encontrada.");
      const [row] =
        await sql`SELECT COALESCE(MAX(SUBSTRING(code FROM 5)::INTEGER), 100) + 1 AS number FROM imovelink.properties WHERE tenant_id = ${tenantId} AND code ~ '^IMV-[0-9]+$'`;
      return `IMV-${row.number}`;
    }
    const numbers = getDb()
      .properties.filter((p) => p.tenantId === tenantId)
      .map((p) => Number(p.code.replace("IMV-", "")))
      .filter(Number.isFinite);
    return `IMV-${Math.max(100, ...numbers) + 1}`;
  }

  async create(property: Property): Promise<Property> {
    if (isPostgresConfigured()) {
      const sql = getPostgres();
      const [row] =
        await sql`INSERT INTO imovelink.properties ${sql(databaseRecord(property))} RETURNING *`;
      return domainRecord<Property>(row);
    }
    const db = getDb();
    db.properties.unshift(property);
    salvarNoDisco(db);
    return property;
  }

  async update(
    tenantId: string,
    propertyId: string,
    updates: Partial<Property>,
  ): Promise<Property | null> {
    const allowed = new Set([
      "brokerId",
      "brokerName",
      "title",
      "description",
      "type",
      "purpose",
      "status",
      "price",
      "condoFee",
      "iptu",
      "bedrooms",
      "suites",
      "bathrooms",
      "parkingSpots",
      "areaTotal",
      "areaBuilt",
      "addressStreet",
      "addressNeighborhood",
      "addressCity",
      "addressState",
      "addressZip",
      "latitude",
      "longitude",
      "amenities",
      "images",
      "featured",
    ]);
    const safeUpdates = {
      ...Object.fromEntries(
        Object.entries(updates).filter(([key]) => allowed.has(key)),
      ),
      updatedAt: new Date().toISOString(),
    };
    if (isPostgresConfigured()) {
      const sql = getPostgres();
      const [row] =
        await sql`UPDATE imovelink.properties SET ${sql(databaseRecord(safeUpdates))} WHERE tenant_id = ${tenantId} AND id = ${propertyId} RETURNING *`;
      return row ? domainRecord<Property>(row) : null;
    }
    const db = getDb();
    const index = db.properties.findIndex(
      (p) => p.tenantId === tenantId && p.id === propertyId,
    );
    if (index === -1) return null;
    db.properties[index] = { ...db.properties[index], ...safeUpdates };
    salvarNoDisco(db);
    return db.properties[index];
  }

  async delete(tenantId: string, propertyId: string): Promise<boolean> {
    if (isPostgresConfigured()) {
      const rows =
        await getPostgres()`DELETE FROM imovelink.properties WHERE tenant_id = ${tenantId} AND id = ${propertyId} RETURNING id`;
      return rows.length > 0;
    }
    const db = getDb();
    const index = db.properties.findIndex(
      (p) => p.tenantId === tenantId && p.id === propertyId,
    );
    if (index === -1) return false;
    db.properties.splice(index, 1);
    salvarNoDisco(db);
    return true;
  }

  async createAuditLog(log: PropertyAuditLog): Promise<PropertyAuditLog> {
    if (isPostgresConfigured()) {
      const sql = getPostgres();
      const [row] =
        await sql`INSERT INTO imovelink.property_audit_logs ${sql(databaseRecord(log))} RETURNING *`;
      return domainRecord<PropertyAuditLog>(row);
    }
    const db = getDb();
    db.auditLogs.unshift(log);
    salvarNoDisco(db);
    return log;
  }

  async findAuditLogsByTenant(
    tenantId: string,
    propertyId?: string,
  ): Promise<PropertyAuditLog[]> {
    if (isPostgresConfigured()) {
      const sql = getPostgres();
      const rows = propertyId
        ? await sql`SELECT * FROM imovelink.property_audit_logs WHERE tenant_id = ${tenantId} AND property_id = ${propertyId} ORDER BY created_at DESC`
        : await sql`SELECT * FROM imovelink.property_audit_logs WHERE tenant_id = ${tenantId} ORDER BY created_at DESC`;
      return rows.map((row) => domainRecord<PropertyAuditLog>(row));
    }
    return getDb()
      .auditLogs.filter(
        (log) =>
          log.tenantId === tenantId &&
          (!propertyId || log.propertyId === propertyId),
      )
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }
}

export const propertyRepository = new PropertyRepository();

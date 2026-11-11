import type { Tenant, UserProfile } from "@/types/domain";
import { getDb, salvarNoDisco } from "./database-store";
import {
  databaseRecord,
  domainRecord,
  getPostgres,
  isPostgresConfigured,
  withDatabaseTransaction,
} from "@/server/database/postgres";

export class TenantRepository {
  async findAllTenants(): Promise<Tenant[]> {
    if (isPostgresConfigured())
      return (
        await getPostgres()`SELECT * FROM imovelink.tenants ORDER BY created_at`
      ).map((row) => domainRecord<Tenant>(row));
    return getDb().tenants;
  }
  async findTenantById(tenantId: string): Promise<Tenant | undefined> {
    if (isPostgresConfigured()) {
      const [row] =
        await getPostgres()`SELECT * FROM imovelink.tenants WHERE id = ${tenantId}`;
      return row ? domainRecord<Tenant>(row) : undefined;
    }
    return getDb().tenants.find((t) => t.id === tenantId);
  }
  async findTenantBySlug(slug: string): Promise<Tenant | undefined> {
    if (isPostgresConfigured()) {
      const [row] =
        await getPostgres()`SELECT * FROM imovelink.tenants WHERE LOWER(slug) = LOWER(${slug})`;
      return row ? domainRecord<Tenant>(row) : undefined;
    }
    return getDb().tenants.find(
      (t) => t.slug.toLowerCase() === slug.toLowerCase(),
    );
  }
  async findTenantByName(name: string): Promise<Tenant | undefined> {
    if (isPostgresConfigured()) {
      const [row] =
        await getPostgres()`SELECT * FROM imovelink.tenants WHERE LOWER(name) = LOWER(${name}) LIMIT 1`;
      return row ? domainRecord<Tenant>(row) : undefined;
    }
    return getDb().tenants.find(
      (t) => t.name.toLowerCase() === name.toLowerCase(),
    );
  }
  async updateTenant(
    tenantId: string,
    updates: Partial<Tenant>,
  ): Promise<Tenant | null> {
    const allowed = new Set(["name", "creci", "city", "state", "branding"]);
    const safeUpdates = Object.fromEntries(
      Object.entries(updates).filter(([key]) => allowed.has(key)),
    );
    if (isPostgresConfigured()) {
      const sql = getPostgres();
      const [row] =
        await sql`UPDATE imovelink.tenants SET ${sql(databaseRecord(safeUpdates))} WHERE id = ${tenantId} RETURNING *`;
      return row ? domainRecord<Tenant>(row) : null;
    }
    const db = getDb();
    const index = db.tenants.findIndex((t) => t.id === tenantId);
    if (index === -1) return null;
    db.tenants[index] = { ...db.tenants[index], ...safeUpdates };
    salvarNoDisco(db);
    return db.tenants[index];
  }
  async findUserById(userId: string): Promise<UserProfile | undefined> {
    if (isPostgresConfigured()) {
      const [row] =
        await getPostgres()`SELECT * FROM imovelink.users WHERE id = ${userId}`;
      return row ? domainRecord<UserProfile>(row) : undefined;
    }
    return getDb().users.find((user) => user.id === userId);
  }
  async findUserByEmail(email: string): Promise<UserProfile | undefined> {
    if (isPostgresConfigured()) {
      const [row] =
        await getPostgres()`SELECT * FROM imovelink.users WHERE LOWER(email) = LOWER(${email})`;
      return row ? domainRecord<UserProfile>(row) : undefined;
    }
    return getDb().users.find(
      (user) => user.email.toLowerCase() === email.toLowerCase(),
    );
  }
  async findFirstBroker(tenantId: string): Promise<UserProfile | undefined> {
    if (isPostgresConfigured()) {
      const [row] =
        await getPostgres()`SELECT * FROM imovelink.users WHERE tenant_id = ${tenantId} AND active = TRUE ORDER BY CASE WHEN role = 'AGENCY_ADMIN' THEN 0 ELSE 1 END, id LIMIT 1`;
      return row ? domainRecord<UserProfile>(row) : undefined;
    }
    return getDb().users.find(
      (user) => user.tenantId === tenantId && user.active,
    );
  }
  async updateUser(
    userId: string,
    updates: Pick<UserProfile, "name" | "email" | "phone" | "creci">,
  ): Promise<UserProfile | null> {
    const safeUpdates = {
      name: updates.name,
      email: updates.email,
      phone: updates.phone,
      creci: updates.creci,
    };
    if (isPostgresConfigured()) {
      const sql = getPostgres();
      const [row] =
        await sql`UPDATE imovelink.users SET ${sql(databaseRecord(safeUpdates))} WHERE id = ${userId} RETURNING *`;
      return row ? domainRecord<UserProfile>(row) : null;
    }
    const db = getDb();
    const index = db.users.findIndex((user) => user.id === userId);
    if (index === -1) return null;
    db.users[index] = { ...db.users[index], ...safeUpdates };
    salvarNoDisco(db);
    return db.users[index];
  }
  async createUser(user: UserProfile, tenant?: Tenant): Promise<UserProfile> {
    return withDatabaseTransaction(async () => {
      if (isPostgresConfigured()) {
        const sql = getPostgres();
        if (tenant)
          await sql`INSERT INTO imovelink.tenants ${sql(databaseRecord(tenant))}`;
        const [row] =
          await sql`INSERT INTO imovelink.users ${sql(databaseRecord(user))} RETURNING *`;
        return domainRecord<UserProfile>(row);
      }
      const db = getDb();
      if (tenant) db.tenants.push(tenant);
      db.users.unshift(user);
      salvarNoDisco(db);
      return user;
    });
  }
}
export const tenantRepository = new TenantRepository();

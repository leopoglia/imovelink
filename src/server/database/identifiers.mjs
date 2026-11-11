import { createHash } from "node:crypto";

const canonicalUuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Fixed random replacements from migration 004, also used when importing legacy data.
export const DEMO_TENANT_REPLACEMENTS = Object.freeze({
  "11111111-1111-4111-8111-111111111111":
    "09e1cc27-15ec-4a5c-9a95-0485de24d386",
  "22222222-2222-4222-8222-222222222222":
    "a3b76ce0-cc99-41e5-b071-8827170a7a2c",
});
/**
 * Preserves UUIDs except the two demo tenant replacements from migration 004.
 * Legacy identifiers use a stable, namespaced UUIDv8
 * (SHA-256, first 128 bits, RFC version/variant bits). New records use UUIDv4.
 * Keep this derivation identical to migration 003; it is part of the import format.
 * @param {string} entity
 * @param {string} value
 */
export function legacyUuid(entity, value) {
  if (typeof value !== "string" || !value.length)
    throw new Error("INVALID_IDENTIFIER");
  const normalized = value.toLowerCase();
  if (entity === "tenants" && DEMO_TENANT_REPLACEMENTS[normalized])
    return DEMO_TENANT_REPLACEMENTS[normalized];
  if (canonicalUuid.test(value)) return normalized;
  const bytes = createHash("sha256")
    .update(`imovelink:${entity}:${value}`, "utf8")
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const identities = {
  tenants: { id: "tenants" },
  users: { id: "users", tenantId: "tenants" },
  properties: { id: "properties", tenantId: "tenants", brokerId: "users" },
  leads: { id: "leads", tenantId: "tenants", assignedBrokerId: "users" },
  auditLogs: {
    id: "auditLogs",
    tenantId: "tenants",
    propertyId: "properties",
    userId: "users",
  },
};
/** @param {Record<string, unknown>} value */
function propertyState(value) {
  const result = { ...value };
  for (const [key, entity] of Object.entries(identities.properties))
    if (typeof result[key] === "string")
      result[key] = legacyUuid(entity, result[key]);
  return result;
}
/** Convert an import copy; never mutate the source snapshot. @param {Record<string, any>} snapshot */
export function normalizeSnapshotIds(snapshot) {
  const result = structuredClone(snapshot);
  for (const [collection, fields] of Object.entries(identities)) {
    if (!Array.isArray(result[collection])) continue;
    for (const record of result[collection]) {
      for (const [key, entity] of Object.entries(fields))
        record[key] = legacyUuid(entity, record[key]);
      if (collection === "auditLogs") {
        for (const key of ["beforeState", "afterState"])
          if (record[key] && typeof record[key] === "object")
            record[key] = propertyState(record[key]);
      }
    }
  }
  return result;
}

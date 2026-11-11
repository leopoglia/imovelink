// Integration verification: creates isolated temporary records and removes them in finally.
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import postgres from "postgres";
import { hashPassword } from "../src/server/services/password.mjs";
import { databaseTlsOptions } from "../src/server/database/tls.mjs";

const base = process.env.AUTH_TEST_ORIGIN || "http://localhost:3001";
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base))
  throw new Error("Use um servidor local para esta verificação.");
const sql = postgres(process.env.DATABASE_URL, {
  ssl: databaseTlsOptions(),
  max: 1,
  prepare: false,
  connect_timeout: 10,
});
const id = randomUUID();
const agencies = [randomUUID(), randomUUID()];
const users = [randomUUID(), randomUUID(), randomUUID()];
const emails = users.map((user) => `auth-check-${user}@example.invalid`);
const password = randomBytes(24).toString("base64url");
const digest = (value) => createHash("sha256").update(value).digest("hex");
const jar = () => new Map();
async function api(path, method = "GET", body, cookies = jar(), extra = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    redirect: "manual",
    headers: {
      "Content-Type": "application/json",
      Cookie: [...cookies]
        .map(([name, value]) => `${name}=${value}`)
        .join("; "),
      ...extra,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  for (const cookie of response.headers.getSetCookie()) {
    const [pair] = cookie.split(";");
    const separator = pair.indexOf("=");
    cookies.set(
      pair.slice(0, separator),
      decodeURIComponent(pair.slice(separator + 1)),
    );
  }
  return response;
}
async function login(index, cookies) {
  const response = await api(
    "/api/auth",
    "POST",
    { action: "LOGIN", email: emails[index], password },
    cookies,
  );
  assert.equal(response.status, 200, "password login");
  const data = await response.json();
  assert.equal(data.user.id, users[index]);
  assert.equal("token" in data, false);
  assert.equal(JSON.stringify(data).includes("scrypt$"), false);
}
const counts = async () =>
  (
    await sql`SELECT
  (SELECT count(*) FROM imovelink.tenants)::int AS tenants,
  (SELECT count(*) FROM imovelink.users)::int AS users,
  (SELECT count(*) FROM imovelink.properties)::int AS properties,
  (SELECT count(*) FROM imovelink.property_audit_logs)::int AS audits`
  )[0];
const checks = [];
let initial;
try {
  initial = await counts();
  const hash = await hashPassword(password);
  await sql.begin(async (tx) => {
    for (const agency of agencies) {
      await tx`INSERT INTO imovelink.tenants (id, name, slug, cnpj, city, state, branding)
        VALUES (${agency}, 'Temporary auth verification', ${agency}, '', 'Jaraguá do Sul', 'SC', ${tx.json({ primaryColor: "#1E56CC", accentColor: "", tagline: "", phone: "", whatsapp: "", email: "", address: "" })})`;
    }
    for (let i = 0; i < users.length; i++) {
      await tx`INSERT INTO imovelink.users (id, tenant_id, name, email, role)
        VALUES (${users[i]}, ${agencies[i === 2 ? 1 : 0]}, 'Temporary auth verification', ${emails[i]}, ${i === 1 ? "BROKER" : "AGENCY_ADMIN"})`;
      await tx`INSERT INTO imovelink.user_credentials (user_id, password_hash) VALUES (${users[i]}, ${hash})`;
    }
  });
  for (const path of ["/", "/imoveis", "/busca-ia", "/configuracoes"]) {
    const response = await api(path);
    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), "/login");
  }
  for (const [path, method] of [
    ["/api/properties", "GET"],
    ["/api/properties", "POST"],
    ["/api/properties/any", "PATCH"],
    ["/api/properties/any", "DELETE"],
    ["/api/settings", "GET"],
    ["/api/settings", "PATCH"],
    ["/api/search/ai", "POST"],
  ]) {
    assert.equal(
      (
        await api(
          path,
          method,
          method === "GET" || method === "DELETE" ? undefined : {},
        )
      ).status,
      401,
    );
  }
  checks.push("private pages and seven API operations require a session");
  assert.equal(
    (
      await api("/api/auth", "POST", {
        action: "LOGIN",
        email: emails[0],
        password: "incorrect password",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await api("/api/auth", "POST", {
        action: "QUICK_LOGIN",
        userId: users[0],
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await api("/api/auth", "POST", {
        action: "REGISTER",
        email: emails[0],
        role: "SUPER_ADMIN",
      })
    ).status,
    400,
  );
  const admin = jar();
  const broker = jar();
  await login(0, admin);
  await login(1, broker);
  checks.push(
    "password verification, HttpOnly session issuance, no public privilege registration",
  );
  const payload = {
    title: "Temporary authentication check",
    description: "This temporary record is deleted after verification.",
    type: "HOUSE",
    price: 123456,
    addressStreet: "Test street",
    addressNeighborhood: "Centro",
    tenantId: agencies[1],
    userId: users[2],
    userRole: "SUPER_ADMIN",
    userName: "Forged identity",
  };
  const createdResponse = await api("/api/properties", "POST", payload, admin);
  assert.equal(createdResponse.status, 201);
  const { property } = await createdResponse.json();
  assert.equal(property.tenantId, agencies[0]);
  assert.equal(property.brokerId, users[0]);
  const [audit] =
    await sql`SELECT user_id, tenant_id FROM imovelink.property_audit_logs WHERE property_id = ${property.id}`;
  assert.equal(audit.user_id, users[0]);
  assert.equal(audit.tenant_id, agencies[0]);
  const update = await api(
    `/api/properties/${property.id}`,
    "PATCH",
    { tenantId: agencies[1], userId: users[2], updates: { price: 123457 } },
    admin,
  );
  assert.equal(update.status, 200);
  assert.equal((await update.json()).property.price, 123457);
  assert.equal(
    (
      await api(
        `/api/properties/${property.id}?userRole=SUPER_ADMIN`,
        "DELETE",
        undefined,
        broker,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await api(
        `/api/properties/${property.id}`,
        "PATCH",
        { updates: { brokerId: users[2] } },
        broker,
      )
    ).status,
    400,
  );
  checks.push(
    "property mutations and audit use the authenticated actor; broker cannot elevate role",
  );
  const other = jar();
  await login(2, other);
  const listing = await api(
    `/api/properties?tenantId=${agencies[0]}`,
    "GET",
    undefined,
    other,
  );
  assert.equal((await listing.json()).total, 0);
  assert.notEqual(
    (
      await api(
        `/api/properties/${property.id}`,
        "PATCH",
        { tenantId: agencies[0], updates: { price: 1 } },
        other,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await api(
        `/api/properties/${property.id}?tenantId=${agencies[0]}`,
        "DELETE",
        undefined,
        other,
      )
    ).status,
    404,
  );
  const settings = await api(
    `/api/settings?tenantId=${agencies[1]}&userId=${users[2]}`,
    "GET",
    undefined,
    admin,
  );
  assert.equal((await settings.json()).user.id, users[0]);
  const savedSettings = await api(
    "/api/settings",
    "PATCH",
    {
      userId: users[2],
      tenantId: agencies[1],
      section: "profile",
      values: {
        name: "Updated temporary profile",
        email: emails[0],
        phone: "",
        creci: "",
      },
    },
    admin,
  );
  assert.equal(savedSettings.status, 200);
  assert.equal((await savedSettings.json()).user.id, users[0]);
  const deniedAgency = await api(
    "/api/settings",
    "PATCH",
    {
      section: "agency",
      values: {
        name: "Denied",
        creci: "",
        city: "Jaraguá do Sul",
        state: "SC",
        phone: "",
        email: emails[1],
        address: "",
      },
    },
    broker,
  );
  assert.equal(deniedAgency.status, 403);
  const search = await api(
    "/api/search/ai",
    "POST",
    { query: "Casa", tenantId: agencies[0] },
    other,
  );
  assert.equal(search.status, 200);
  assert.equal((await search.json()).results.length, 0);
  checks.push("cross-tenant list/edit/delete/settings/search isolation");
  assert.equal(
    (
      await api("/api/auth", "POST", { action: "LOGOUT" }, admin, {
        Origin: "https://foreign.invalid",
      })
    ).status,
    403,
  );
  await sql`UPDATE imovelink.users SET active = FALSE WHERE id = ${users[0]}`;
  assert.equal(
    (await api("/api/properties", "GET", undefined, admin)).status,
    401,
  );
  await sql`UPDATE imovelink.users SET active = TRUE, role = 'BROKER' WHERE id = ${users[0]}`;
  assert.equal(
    (await api(`/api/properties/${property.id}`, "DELETE", undefined, admin))
      .status,
    403,
  );
  await sql`UPDATE imovelink.users SET role = 'AGENCY_ADMIN' WHERE id = ${users[0]}`;
  checks.push("cross-origin rejection and live role/active checks");
  const oldSession = admin.get("imovelink_session");
  await sql`UPDATE imovelink.auth_sessions SET expires_at = NOW() - INTERVAL '1 minute' WHERE token_hash = ${digest(oldSession)}`;
  assert.equal(
    (await api("/api/properties", "GET", undefined, admin)).status,
    401,
  );
  assert.equal(
    (
      await api(
        "/api/auth",
        "POST",
        { action: "QUICK_LOGIN", userId: users[0] },
        admin,
      )
    ).status,
    200,
  );
  assert.notEqual(admin.get("imovelink_session"), oldSession);
  const copied = new Map(admin);
  const remembered = admin.get("imovelink_recent_sessions");
  assert.equal(
    (await api("/api/auth", "POST", { action: "LOGOUT" }, admin)).status,
    200,
  );
  assert.equal(
    (await api("/api/properties", "GET", undefined, copied)).status,
    401,
  );
  assert.equal(
    (
      await api(
        "/api/auth",
        "POST",
        { action: "QUICK_LOGIN", userId: users[0] },
        new Map([["imovelink_recent_sessions", remembered]]),
      )
    ).status,
    401,
  );
  checks.push(
    "expiry, recent access, rotation and server-side logout revocation",
  );
  // The account limiter uses the database and survives server restarts.
  for (let i = 0; i < 11; i++) {
    const response = await api("/api/auth", "POST", {
      action: "LOGIN",
      email: `limit-${id}@example.invalid`,
      password: "incorrect password",
    });
    assert.equal(response.status, i < 10 ? 401 : 429);
  }
  checks.push("persistent login attempt limit");
} catch (error) {
  console.error("Falha na verificação de autenticação:", error.message);
  process.exitCode = 1;
} finally {
  try {
    await sql.begin(async (tx) => {
      await tx`DELETE FROM imovelink.property_audit_logs WHERE tenant_id IN ${tx(agencies)}`;
      await tx`DELETE FROM imovelink.properties WHERE tenant_id IN ${tx(agencies)}`;
      await tx`DELETE FROM imovelink.leads WHERE tenant_id IN ${tx(agencies)}`;
      await tx`DELETE FROM imovelink.users WHERE id IN ${tx(users)}`;
      await tx`DELETE FROM imovelink.tenants WHERE id IN ${tx(agencies)}`;
      await tx`DELETE FROM imovelink.auth_attempts WHERE bucket_hash IN ${tx([...emails, `limit-${id}@example.invalid`].map((email) => digest(`login:${email}`)))}`;
    });
    if (initial)
      assert.deepEqual(
        await counts(),
        initial,
        "existing business records preserved",
      );
    console.log(
      JSON.stringify({
        checks,
        temporaryRecordsRemoved: true,
        existingRecordsPreserved: true,
      }),
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

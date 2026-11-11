import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getPostgres,
  withDatabaseTransaction,
  databaseRecord,
  domainRecord,
} from "@/server/database/postgres";
import { propertyRepository } from "@/server/repositories/property.repository";

const { driver, client, transactionClient, rows, json } = vi.hoisted(() => {
  const rows: Record<string, unknown>[] = [];
  const json = vi.fn((value: unknown) => ({ json: value }));
  const query = (strings: unknown, ...values: unknown[]) =>
    Array.isArray(strings) && "raw" in strings
      ? Promise.resolve([...rows])
      : { record: strings, values };
  const transactionClient = Object.assign(vi.fn(query), { json });
  const client = Object.assign(vi.fn(query), {
    json,
    begin: vi.fn(async (operation: (sql: unknown) => Promise<unknown>) =>
      operation(transactionClient),
    ),
  });
  const driver = Object.assign(
    vi.fn((_url: string, _options: unknown) => client),
    { camel: {} },
  );
  return { driver, client, transactionClient, rows, json };
});
vi.mock("postgres", () => ({ default: driver }));

beforeEach(() => {
  vi.clearAllMocks();
  rows.length = 0;
  delete globalThis.__IMOVELINK_SQL__;
  vi.stubEnv("DATABASE_URL", "postgresql://test:test@example.test/postgres");
  vi.stubEnv("DATABASE_SSL_CA_FILE", "");
});
afterEach(() => {
  delete globalThis.__IMOVELINK_SQL__;
  vi.unstubAllEnvs();
});

describe("Repositórios PostgreSQL", () => {
  it("parametriza a imobiliária e o identificador em vez de concatenar valores no SQL", async () => {
    rows.push({
      id: "property",
      tenantId: "agency",
      price: "920000.00",
      createdAt: new Date("2026-11-01T00:00:00Z"),
    });
    const injectedId = "x'; DROP TABLE users; --";
    const result = await propertyRepository.findById("agency", injectedId);
    const [strings, ...values] = client.mock.calls[0];
    expect((strings as string[]).join("?")).not.toContain(injectedId);
    expect(values).toEqual(["agency", injectedId]);
    expect(result?.price).toBe(920000);
    expect(result?.createdAt).toBe("2026-11-01T00:00:00.000Z");
  });

  it("impede alterar identificadores, imobiliária e código pelo payload de edição", async () => {
    await propertyRepository.update("agency", "property", {
      title: "Novo título",
      id: "other",
      tenantId: "other",
      code: "IMV-999",
    });
    const helperCall = client.mock.calls.find(
      ([first]) => !Array.isArray(first),
    );
    expect(helperCall?.[0]).toMatchObject({ title: "Novo título" });
    expect(helperCall?.[0]).not.toHaveProperty("id");
    expect(helperCall?.[0]).not.toHaveProperty("tenantId");
    expect(helperCall?.[0]).not.toHaveProperty("code");
  });

  it("usa a mesma conexão transacional em operações encadeadas e não abre outra transação", async () => {
    await withDatabaseTransaction(async () => {
      expect(getPostgres()).toBe(transactionClient);
      await withDatabaseTransaction(async () => {
        await propertyRepository.findById("agency", "property");
      });
    });
    expect(client.begin).toHaveBeenCalledOnce();
    expect(transactionClient).toHaveBeenCalledOnce();
    expect(client).not.toHaveBeenCalled();
  });

  it("preserva JSON estruturado e normaliza números e datas", () => {
    const branding = { phone: "123", primaryColor: "#1E56CC" };
    const record = databaseRecord({
      branding,
      avatarUrl: undefined,
      beforeState: null,
    });
    expect(json).toHaveBeenCalledWith(branding);
    expect(record).not.toHaveProperty("avatarUrl");
    expect(record.beforeState).toBeNull();
    expect(
      domainRecord({
        price: "12.50",
        areaBuilt: "50.00",
        updatedAt: new Date("2026-11-01T00:00:00Z"),
      }),
    ).toEqual({
      price: 12.5,
      areaBuilt: 50,
      updatedAt: "2026-11-01T00:00:00.000Z",
    });
    expect(driver.mock.calls[0][1]).toMatchObject({
      ssl: "verify-full",
      prepare: false,
    });
  });

  it("recusa uma configuração inválida sem devolver o valor da conexão no erro", () => {
    vi.stubEnv("DATABASE_URL", "private-invalid-connection");
    expect(() => getPostgres()).toThrow(
      "Configure uma conexão PostgreSQL válida em DATABASE_URL.",
    );
    expect(driver).not.toHaveBeenCalled();
  });

  it("usa o certificado CA configurado e mantém a verificação TLS ativa", () => {
    vi.stubEnv(
      "DATABASE_SSL_CA_FILE",
      "database/certificates/supabase-prod-ca-2021.crt",
    );
    getPostgres();
    expect(driver.mock.calls[0][1]).toMatchObject({
      ssl: {
        rejectUnauthorized: true,
        ca: expect.stringContaining("BEGIN CERTIFICATE"),
      },
    });
  });

  it("recusa um arquivo CA inexistente em vez de desativar a verificação", () => {
    vi.stubEnv("DATABASE_SSL_CA_FILE", "database/certificates/missing.crt");
    expect(() => getPostgres()).toThrow(
      "Configure um arquivo de certificado CA válido",
    );
    expect(driver).not.toHaveBeenCalled();
  });
});

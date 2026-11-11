import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { getDb } from "@/server/repositories/memory-store";
import { settingsService } from "@/server/services/settings.service";
import { SEED_TENANTS, SEED_USERS } from "@/server/seeds/seed-jaragua";

vi.mock("@/server/repositories/memory-store", () => ({
  getDb: vi.fn(),
}));

function createDatabase(): ReturnType<typeof getDb> {
  return {
    tenants: structuredClone(SEED_TENANTS),
    users: structuredClone(SEED_USERS),
    properties: [],
    auditLogs: [],
    leads: [],
  };
}

describe("Configurações da conta", () => {
  let db: ReturnType<typeof getDb>;
  let inicial: ReturnType<typeof getDb>;
  beforeEach(() => {
    vi.clearAllMocks();
    db = createDatabase();
    vi.mocked(getDb).mockReturnValue(db);
    inicial = structuredClone(db);
  });

  const profileValues = {
    name: "Leonardo Poglia",
    email: "LEONARDO@EXAMPLE.COM",
    phone: "(47) 99900-0000",
    creci: "CRECI/SC 48210-F",
  };
  const agencyValues = {
    name: "Prime Imóveis",
    creci: "CRECI/SC 6840-J",
    city: "Jaraguá do Sul",
    state: "SC",
    phone: "(47) 3371-9400",
    email: "CONTATO@EXAMPLE.COM",
    address: "Rua Central, 100",
  };

  it("salva o perfil, normaliza o e-mail e mantém o papel do usuário", async () => {
    const result = await settingsService.updateSettings({
      section: "profile",
      userId: db.users[0].id,
      tenantId: db.tenants[0].id,
      values: profileValues,
    });
    expect(result.user.name).toBe("Leonardo Poglia");
    expect(result.user.email).toBe("leonardo@example.com");
    expect(result.user.role).toBe("AGENCY_ADMIN");
    expect(db.users[0]).toEqual(result.user);
  });

  it("rejeita tentativas de alterar o papel pelo formulário de perfil", async () => {
    await expect(
      settingsService.updateSettings({
        section: "profile",
        userId: db.users[1].id,
        tenantId: db.tenants[0].id,
        values: { ...profileValues, role: "SUPER_ADMIN" },
      }),
    ).rejects.toThrow(ZodError);
    expect(db).toEqual(inicial);
  });

  it("rejeita acesso a outra imobiliária sem permissão", async () => {
    await expect(
      settingsService.getSettings(db.users[0].id, db.tenants[1].id),
    ).rejects.toThrow("Não foi possível acessar este perfil.");
    expect(db).toEqual(inicial);
  });

  it("rejeita a edição da imobiliária por um corretor", async () => {
    await expect(
      settingsService.updateSettings({
        section: "agency",
        userId: db.users[1].id,
        tenantId: db.tenants[0].id,
        values: agencyValues,
      }),
    ).rejects.toThrow("Apenas gestores");
    expect(db).toEqual(inicial);
  });

  it("salva a imobiliária sem perder a identidade da vitrine", async () => {
    const original = structuredClone(db.tenants[0]);
    const result = await settingsService.updateSettings({
      section: "agency",
      userId: db.users[0].id,
      tenantId: original.id,
      values: agencyValues,
    });
    expect(result.tenant.name).toBe("Prime Imóveis");
    expect(result.tenant.branding.email).toBe("contato@example.com");
    expect(result.tenant.branding.address).toBe("Rua Central, 100");
    expect(result.tenant.branding.primaryColor).toBe(
      original.branding.primaryColor,
    );
    expect(result.tenant.slug).toBe(original.slug);
    expect(db.tenants[0]).toEqual(result.tenant);
  });

  it("permite ao super administrador configurar a imobiliária selecionada", async () => {
    const result = await settingsService.updateSettings({
      section: "agency",
      userId: db.users[2].id,
      tenantId: db.tenants[1].id,
      values: agencyValues,
    });
    expect(result.tenant.id).toBe(SEED_TENANTS[1].id);
    expect(result.tenant.name).toBe("Prime Imóveis");
  });

  it("rejeita e-mail já utilizado por outro usuário", async () => {
    await expect(
      settingsService.updateSettings({
        section: "profile",
        userId: db.users[0].id,
        tenantId: db.tenants[0].id,
        values: { ...profileValues, email: db.users[1].email },
      }),
    ).rejects.toThrow("Este e-mail já está em uso.");
    expect(db).toEqual(inicial);
  });

  it("rejeita e-mail e nome inválidos sem gravar dados", async () => {
    await expect(
      settingsService.updateSettings({
        section: "profile",
        userId: db.users[0].id,
        tenantId: db.tenants[0].id,
        values: { ...profileValues, name: " ", email: "invalid" },
      }),
    ).rejects.toThrow(ZodError);
    expect(db).toEqual(inicial);
  });
});

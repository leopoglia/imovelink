import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { getDb } from "@/server/repositories/memory-store";
import {
  SettingsError,
  settingsService,
} from "@/server/services/settings.service";
import { SEED_TENANTS, SEED_USERS } from "@/server/seeds/seed-jaragua";

vi.mock("@/server/repositories/memory-store", () => ({
  getDb: vi.fn(),
}));

let db: ReturnType<typeof getDb>;

const valores = {
  headline: "Seu próximo endereço em Jaraguá",
  tagline: "Casas e apartamentos com curadoria",
  about: "Atendemos desde 2010.",
  coverImageUrl: "https://example.com/capa.jpg",
  primaryColor: "#0F766E",
  logoText: "cp",
  hiddenPropertyIds: ["p1", "p1", "p2"],
};

function salvar(extra: Partial<typeof valores> = {}, usuario = 0) {
  return settingsService.updateSettings({
    section: "vitrine",
    userId: db.users[usuario].id,
    tenantId: db.tenants[0].id,
    values: { ...valores, ...extra },
  });
}

beforeEach(() => {
  db = {
    tenants: structuredClone(SEED_TENANTS),
    users: structuredClone(SEED_USERS),
    properties: [],
    auditLogs: [],
    leads: [],
    externalSources: [],
    externalListings: [],
  };
  vi.mocked(getDb).mockReturnValue(db);
});

describe("Salvar a vitrine", () => {
  it("guarda textos, capa, cor e imóveis escondidos sem perder o resto da marca", async () => {
    const original = structuredClone(db.tenants[0]);
    const { tenant } = await salvar();
    expect(tenant.branding).toMatchObject({
      headline: valores.headline,
      tagline: valores.tagline,
      about: valores.about,
      coverImageUrl: valores.coverImageUrl,
      primaryColor: "#0F766E",
      logoText: "CP",
      hiddenPropertyIds: ["p1", "p2"],
      phone: original.branding.phone,
      email: original.branding.email,
      address: original.branding.address,
    });
    expect(tenant.name).toBe(original.name);
    expect(db.tenants[0]).toEqual(tenant);
  });

  it("aceita capa vazia e não mexe no WhatsApp guardado", async () => {
    const { tenant } = await salvar({ coverImageUrl: "" });
    expect(tenant.branding.coverImageUrl).toBe("");
    expect(tenant.branding.whatsapp).toBe(SEED_TENANTS[0].branding.whatsapp);
  });

  it.each([
    [{ primaryColor: "azul" }, "Escolha uma cor válida."],
    [{ coverImageUrl: "javascript:alert(1)" }, "Use um link de imagem"],
    [{ logoText: "ABCD" }, "A sigla deve ter até 3 letras."],
  ])("recusa dados inválidos (%o)", async (extra, mensagem) => {
    const erro = await salvar(extra).catch((e) => e);
    expect(erro).toBeInstanceOf(ZodError);
    expect((erro as ZodError).issues[0].message).toContain(mensagem);
    expect(db.tenants[0]).toEqual(SEED_TENANTS[0]);
  });

  it("não deixa um corretor alterar a vitrine", async () => {
    const corretor = db.users.findIndex(
      (u) => u.role === "BROKER" && u.tenantId === db.tenants[0].id,
    );
    const erro = await salvar({}, corretor).catch((e) => e);
    expect(erro).toBeInstanceOf(SettingsError);
    expect((erro as SettingsError).status).toBe(403);
    expect(db.tenants[0]).toEqual(SEED_TENANTS[0]);
  });
});

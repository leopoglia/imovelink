import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as list, POST as create } from "@/app/api/properties/route";
import {
  PATCH as update,
  DELETE as remove,
} from "@/app/api/properties/[id]/route";
import {
  GET as settings,
  PATCH as saveSettings,
} from "@/app/api/settings/route";
import { POST as search } from "@/app/api/search/ai/route";
import { authRepository } from "@/server/repositories/auth.repository";
import { tenantRepository } from "@/server/repositories/tenant.repository";
import { propertyService } from "@/server/services/property.service";
import { settingsService } from "@/server/services/settings.service";
import { aiSearchService } from "@/server/services/ai-search.service";
import { SESSION_COOKIE } from "@/server/services/auth.service";
import {
  SEED_USERS,
  SEED_TENANTS,
  SEED_PROPERTIES,
} from "@/server/seeds/seed-jaragua";

vi.mock("@/server/repositories/auth.repository", () => ({
  authRepository: { sessionUser: vi.fn() },
}));
vi.mock("@/server/repositories/tenant.repository", () => ({
  tenantRepository: { findUserById: vi.fn(), findTenantById: vi.fn() },
}));
vi.mock("@/server/services/property.service", () => ({
  propertyService: {
    listProperties: vi.fn(),
    listAuditLogs: vi.fn(),
    createProperty: vi.fn(),
    updateProperty: vi.fn(),
    deleteProperty: vi.fn(),
  },
}));
vi.mock("@/server/services/settings.service", async (original) => ({
  ...(await original<typeof import("@/server/services/settings.service")>()),
  settingsService: { getSettings: vi.fn(), updateSettings: vi.fn() },
}));
vi.mock("@/server/services/ai-search.service", () => ({
  aiSearchService: { searchWithAI: vi.fn() },
}));
const token = "a".repeat(43);
const propertyId = "70fa03e2-9d17-4017-b822-55fec72af326";
const ctx = { params: Promise.resolve({ id: propertyId }) };
let user = structuredClone(SEED_USERS[0]);
function req(
  path: string,
  method = "GET",
  body?: unknown,
  authenticated = true,
) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(authenticated ? { Cookie: `${SESSION_COOKIE}=${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  user = structuredClone(SEED_USERS[0]);
  vi.mocked(authRepository.sessionUser).mockResolvedValue(user.id);
  vi.mocked(tenantRepository.findUserById).mockImplementation(async () => user);
  vi.mocked(tenantRepository.findTenantById).mockResolvedValue(SEED_TENANTS[0]);
  vi.mocked(propertyService.listProperties).mockResolvedValue([]);
  vi.mocked(propertyService.listAuditLogs).mockResolvedValue([]);
  vi.mocked(propertyService.createProperty).mockResolvedValue(
    SEED_PROPERTIES[0],
  );
  vi.mocked(propertyService.updateProperty).mockResolvedValue(
    SEED_PROPERTIES[0],
  );
  vi.mocked(propertyService.deleteProperty).mockResolvedValue(false);
  vi.mocked(aiSearchService.searchWithAI).mockResolvedValue({
    query: {} as never,
    results: [],
    executionTimeMs: 0,
    totalCandidatesEvaluated: 0,
  });
});

describe("Autorização das APIs", () => {
  it("bloqueia todas as operações privadas sem cookie de sessão", async () => {
    const responses = await Promise.all([
      list(req("/api/properties", "GET", undefined, false)),
      create(req("/api/properties", "POST", {}, false)),
      update(req("/api/properties/id", "PATCH", {}, false), ctx),
      remove(req("/api/properties/id", "DELETE", undefined, false), ctx),
      settings(req("/api/settings", "GET", undefined, false)),
      saveSettings(req("/api/settings", "PATCH", {}, false)),
      search(req("/api/search/ai", "POST", { query: "Casa" }, false)),
    ]);
    expect(responses.map((r) => r.status)).toEqual(Array(7).fill(401));
    expect(propertyService.listProperties).not.toHaveBeenCalled();
    expect(propertyService.createProperty).not.toHaveBeenCalled();
  });
  it("lista apenas a imobiliária da sessão mesmo com tenantId forjado", async () => {
    const response = await list(
      req("/api/properties?tenantId=other&includeAudit=true"),
    );
    expect(response.status).toBe(200);
    expect(propertyService.listProperties).toHaveBeenCalledWith(
      SEED_TENANTS[0].id,
    );
    expect(propertyService.listAuditLogs).toHaveBeenCalledWith(
      SEED_TENANTS[0].id,
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("registra o autor real no cadastro e ignora a identidade enviada pelo cliente", async () => {
    const response = await create(
      req("/api/properties", "POST", {
        ...SEED_PROPERTIES[0],
        tenantId: "other",
        userId: "other-user",
        userName: "forged",
        userRole: "SUPER_ADMIN",
      }),
    );
    expect(response.status).toBe(201);
    expect(propertyService.createProperty).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: user.tenantId,
        userId: user.id,
        userRole: user.role,
        userName: user.name,
      }),
    );
  });
  it("impede que um corretor exclua imóvel enviando papel de gestor", async () => {
    user = structuredClone(SEED_USERS[1]);
    const response = await remove(
      req("/api/properties/id?userRole=SUPER_ADMIN", "DELETE"),
      ctx,
    );
    expect(response.status).toBe(403);
    expect(propertyService.deleteProperty).not.toHaveBeenCalled();
  });
  it("escopa edição e exclusão pelo tenant da sessão", async () => {
    expect(
      (
        await update(
          req("/api/properties/id", "PATCH", {
            tenantId: "other",
            updates: { title: "Título novo" },
          }),
          ctx,
        )
      ).status,
    ).toBe(200);
    expect(propertyService.updateProperty).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: user.tenantId,
        userId: user.id,
        propertyId,
      }),
    );
    expect(
      (await remove(req("/api/properties/id?tenantId=other", "DELETE"), ctx))
        .status,
    ).toBe(404);
    expect(propertyService.deleteProperty).toHaveBeenCalledWith(
      user.tenantId,
      propertyId,
      user.id,
      user.name,
      user.role,
    );
  });
  it("não permite reatribuir um imóvel ou alterar sua identidade no payload", async () => {
    const response = await update(
      req("/api/properties/id", "PATCH", {
        updates: { brokerId: "other", tenantId: "other" },
      }),
      ctx,
    );
    expect(response.status).toBe(400);
    expect(propertyService.updateProperty).not.toHaveBeenCalled();
  });
  it("consulta e altera apenas as configurações do usuário autenticado", async () => {
    await settings(req("/api/settings?tenantId=other&userId=other"));
    expect(settingsService.getSettings).toHaveBeenCalledWith(
      user.id,
      user.tenantId,
    );
    await saveSettings(
      req("/api/settings", "PATCH", {
        section: "profile",
        values: { name: "Novo" },
        userId: "other",
        tenantId: "other",
      }),
    );
    expect(settingsService.updateSettings).toHaveBeenCalledWith({
      section: "profile",
      values: { name: "Novo" },
      userId: user.id,
      tenantId: user.tenantId,
    });
  });
  it("limita a busca à imobiliária autenticada", async () => {
    expect(
      (
        await search(
          req("/api/search/ai", "POST", {
            query: "Casa com piscina",
            tenantId: "other",
          }),
        )
      ).status,
    ).toBe(200);
    expect(aiSearchService.searchWithAI).toHaveBeenCalledWith(
      user.tenantId,
      "Casa com piscina",
      true,
      expect.any(AbortSignal),
    );
  });
  it("nega acesso quando a sessão expirou ou foi revogada", async () => {
    vi.mocked(authRepository.sessionUser).mockResolvedValue(undefined);
    expect((await list(req("/api/properties"))).status).toBe(401);
    expect(propertyService.listProperties).not.toHaveBeenCalled();
  });
});

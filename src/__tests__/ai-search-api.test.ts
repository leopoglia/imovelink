import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/search/ai/route";
import { aiSearchService } from "@/server/services/ai-search.service";
import { requireSession } from "@/server/services/auth.service";
import { SEED_TENANTS, SEED_USERS } from "@/server/seeds/seed-jaragua";
vi.mock("@/server/services/auth.service", async (original) => ({
  ...(await original<typeof import("@/server/services/auth.service")>()),
  requireSession: vi.fn(),
}));

vi.mock("@/server/services/ai-search.service", () => ({
  aiSearchService: { searchWithAI: vi.fn() },
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireSession).mockResolvedValue({
    tenant: { ...SEED_TENANTS[0], id: "agency" },
    user: SEED_USERS[0],
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});
const request = (body: unknown) =>
  new NextRequest("http://localhost/api/search/ai", {
    method: "POST",
    body: JSON.stringify(body),
  });

describe("API da busca", () => {
  it.each(["", "ab", "a".repeat(1501)])(
    "rejeita consultas vazias, curtas ou extensas",
    async (query) => {
      const result = await POST(request({ tenantId: "agency", query }));
      expect(result.status).toBe(400);
      expect(aiSearchService.searchWithAI).not.toHaveBeenCalled();
    },
  );
  it("valida o corpo antes de chamar IA e não cria uma busca de demonstração", async () => {
    const result = await POST(
      new NextRequest("http://localhost/api/search/ai", {
        method: "POST",
        body: "not-json",
      }),
    );
    expect(result.status).toBe(400);
    expect(aiSearchService.searchWithAI).not.toHaveBeenCalled();
  });
  it("aguarda a interpretação e usa disponibilidade por padrão", async () => {
    vi.mocked(aiSearchService.searchWithAI).mockResolvedValue({
      query: {} as never,
      results: [],
      executionTimeMs: 0,
      totalCandidatesEvaluated: 0,
    });
    const result = await POST(
      request({ tenantId: "agency", query: " Casa com piscina " }),
    );
    expect(result.status).toBe(200);
    expect(aiSearchService.searchWithAI).toHaveBeenCalledWith(
      "agency",
      "Casa com piscina",
      true,
      expect.any(AbortSignal),
    );
  });
  it("não devolve mensagens internas de erro ao navegador", async () => {
    vi.mocked(aiSearchService.searchWithAI).mockRejectedValue(
      new Error("private backend details"),
    );
    const result = await POST(request({ tenantId: "agency", query: "Casa" }));
    expect(result.status).toBe(500);
    expect(JSON.stringify(await result.json())).not.toContain(
      "private backend details",
    );
  });
});

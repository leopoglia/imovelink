import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateGeminiJson, GeminiError } from "@/server/services/gemini.mjs";
import { interpretPropertyQuery } from "@/server/services/property-query-ai";
import { SEED_PROPERTIES } from "@/server/seeds/seed-jaragua";

const result = {
  intentSummary: "Casa com piscina até 950 mil",
  propertyTypes: ["HOUSE"],
  purpose: null,
  minPrice: null,
  maxPrice: 950000,
  minBedrooms: 3,
  minSuites: null,
  minParkingSpots: null,
  neighborhoods: ["Vila Nova"],
  mustHaveAmenities: ["piscina"],
  excludedAmenities: [],
  semanticKeywords: [],
  locationMode: "exact",
};
const input = {
  systemInstruction: "Extract filters",
  prompt: "Casa até 950 mil",
  schema: { type: "object" },
};
const envelope = (text = JSON.stringify(result), finishReason = "STOP") => ({
  candidates: [{ finishReason, content: { parts: [{ text }] } }],
});

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "private-test-key");
  vi.stubEnv("GOOGLE_API_KEY", "");
  vi.stubEnv("GEMINI_MODEL", "");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Integração Google Gemini", () => {
  it("envia a chave apenas no cabeçalho e pede JSON com schema, sem enviar imóveis ou corretores", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(envelope())));
    vi.stubGlobal("fetch", fetchMock);
    const response = await interpretPropertyQuery(
      "Casa com piscina até 950 mil",
      SEED_PROPERTIES,
    );
    expect(response).toMatchObject({
      maxPrice: 950000,
      minBedrooms: 3,
      aiModelUsed: "gemini-3.5-flash-lite",
    });
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
    );
    expect(url).not.toContain("private-test-key");
    expect(request.headers["x-goog-api-key"]).toBe("private-test-key");
    expect(request.signal).toBeInstanceOf(AbortSignal);
    expect(request.redirect).toBe("error");
    const payload = JSON.parse(request.body);
    expect(payload.generationConfig.responseMimeType).toBe("application/json");
    expect(payload.generationConfig.responseJsonSchema.required).toEqual(
      Object.keys(result),
    );
    const content = JSON.parse(payload.contents[0].parts[0].text);
    expect(Object.keys(content).sort()).toEqual([
      "bairrosNoPortfolio",
      "busca",
    ]);
    expect(content.bairrosNoPortfolio).toContain("Vila Nova");
    expect(request.body).not.toContain(SEED_PROPERTIES[0].id);
    expect(request.body).not.toContain(SEED_PROPERTIES[0].brokerId);
  });
  it("permite configurar o modelo e usar GOOGLE_API_KEY como alternativa", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("GOOGLE_API_KEY", "google-key");
    vi.stubEnv("GEMINI_MODEL", "gemini-3.6-flash");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(envelope())));
    vi.stubGlobal("fetch", fetchMock);
    expect((await generateGeminiJson(input)).model).toBe("gemini-3.6-flash");
    expect(fetchMock.mock.calls[0][1].headers["x-goog-api-key"]).toBe(
      "google-key",
    );
  });
  it("não faz requisições sem chave ou com um caminho de modelo inválido", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("GEMINI_API_KEY", "");
    await expect(generateGeminiJson(input)).rejects.toMatchObject({
      code: "NOT_CONFIGURED",
    });
    vi.stubEnv("GEMINI_API_KEY", "private-test-key");
    vi.stubEnv("GEMINI_MODEL", "../../other?key=secret");
    await expect(generateGeminiJson(input)).rejects.toMatchObject({
      code: "INVALID_MODEL",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([
    [429, "RATE_LIMITED"],
    [403, "AUTHENTICATION_FAILED"],
    [404, "MODEL_UNAVAILABLE"],
    [503, "PROVIDER_UNAVAILABLE"],
  ])(
    "trata HTTP %s sem expor mensagens ou credenciais",
    async (status, code) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            new Response("private-test-key upstream-secret", {
              status: Number(status),
            }),
          ),
      );
      await expect(generateGeminiJson(input)).rejects.toMatchObject({
        code,
        status,
      });
      try {
        await generateGeminiJson(input);
      } catch (error) {
        expect(String(error)).not.toContain("private-test-key");
        expect(String(error)).not.toContain("upstream-secret");
      }
    },
  );
  it.each(["MAX_TOKENS", "SAFETY", "RECITATION"])(
    "recusa uma resposta interrompida por %s",
    async (reason) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            new Response(
              JSON.stringify(envelope(JSON.stringify(result), reason)),
            ),
          ),
      );
      await expect(interpretPropertyQuery("Casa", [])).rejects.toMatchObject({
        code: "INCOMPLETE_RESPONSE",
      });
    },
  );
  it.each([
    {},
    { promptFeedback: { blockReason: "SAFETY" } },
    { candidates: [{ finishReason: "STOP", content: { parts: [] } }] },
  ])("recusa respostas vazias ou bloqueadas", async (response) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(response))),
    );
    await expect(generateGeminiJson(input)).rejects.toBeInstanceOf(GeminiError);
  });
  it.each([
    "not json",
    JSON.stringify({ ...result, tenantId: "other-agency" }),
    JSON.stringify({ ...result, minPrice: 1000000 }),
    JSON.stringify({ ...result, maxPrice: -1 }),
  ])("valida o conteúdo antes de usá-lo como filtro", async (text) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(envelope(text)))),
    );
    await expect(interpretPropertyQuery("Casa", [])).rejects.toThrow();
  });
  it("desconsidera blocos de pensamento e junta os blocos de texto da resposta", async () => {
    const text = JSON.stringify(result);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              candidates: [
                {
                  finishReason: "STOP",
                  content: {
                    parts: [
                      { thought: true, text: "internal thought" },
                      { text: text.slice(0, 40) },
                      { text: text.slice(40) },
                    ],
                  },
                },
              ],
            }),
          ),
        ),
    );
    expect((await interpretPropertyQuery("Casa", [])).maxPrice).toBe(950000);
  });
  it("limita o tempo a 15 segundos e transforma o vencimento em erro tratado", async () => {
    const deadline = new AbortController();
    const timeout = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValue(deadline.signal);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        deadline.abort();
        throw new Error("upstream details");
      }),
    );
    await expect(generateGeminiJson(input)).rejects.toMatchObject({
      code: "TIMEOUT",
    });
    expect(timeout).toHaveBeenCalledWith(15000);
  });
  it("respeita o cancelamento sem renovar a requisição", async () => {
    const controller = new AbortController();
    controller.abort(new Error("cancelled by caller"));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      generateGeminiJson({ ...input, signal: controller.signal }),
    ).rejects.toThrow("cancelled by caller");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

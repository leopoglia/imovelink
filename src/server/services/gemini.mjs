const DEFAULT_MODEL = "gemini-3.5-flash-lite";
export const geminiConfigured = () =>
  Boolean(
    process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim(),
  );

export class GeminiError extends Error {
  /** @param {string} code @param {number | undefined} [status] */
  constructor(code, status) {
    super("Não foi possível interpretar a busca com o Google Gemini.");
    this.code = code;
    this.status = status;
  }
}

/**
 * Server-only transport. The API key is sent in a header, never in a URL or error.
 * @param {{systemInstruction: string, prompt: string, schema: Record<string, unknown>, signal?: AbortSignal, timeoutMs?: number}} input
 * @returns {Promise<{text: string, model: string}>}
 */
export async function generateGeminiJson(input) {
  const key =
    process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
  if (!key) throw new GeminiError("NOT_CONFIGURED");
  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  if (!/^gemini-[a-zA-Z0-9.-]{1,100}$/.test(model))
    throw new GeminiError("INVALID_MODEL");
  // A busca do corretor é interativa e não pode travar; a descoberta de um
  // site novo é administrativa e roda uma vez, então pode esperar mais.
  const prazo = input.timeoutMs ?? 15_000;
  const signal = input.signal
    ? AbortSignal.any([input.signal, AbortSignal.timeout(prazo)])
    : AbortSignal.timeout(prazo);
  signal.throwIfAborted();
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        cache: "no-store",
        redirect: "error",
        signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: input.systemInstruction }] },
          contents: [{ role: "user", parts: [{ text: input.prompt }] }],
          generationConfig: {
            candidateCount: 1,
            maxOutputTokens: 4096,
            responseMimeType: "application/json",
            responseJsonSchema: input.schema,
          },
        }),
      },
    );
    if (!response.ok)
      throw new GeminiError(
        response.status === 429
          ? "RATE_LIMITED"
          : response.status === 401 || response.status === 403
            ? "AUTHENTICATION_FAILED"
            : response.status === 404
              ? "MODEL_UNAVAILABLE"
              : "PROVIDER_UNAVAILABLE",
        response.status,
      );
    const result = await response.json();
    const candidate = result?.candidates?.[0];
    if (
      result?.promptFeedback?.blockReason ||
      candidate?.finishReason !== "STOP"
    )
      throw new GeminiError("INCOMPLETE_RESPONSE");
    const parts = candidate?.content?.parts;
    if (!Array.isArray(parts)) throw new GeminiError("INVALID_RESPONSE");
    const text = parts
      .filter((part) => !part.thought && typeof part.text === "string")
      .map((part) => part.text)
      .join("");
    if (!text.trim() || text.length > 20_000)
      throw new GeminiError("INVALID_RESPONSE");
    return { text, model };
  } catch (error) {
    if (input.signal?.aborted) throw input.signal.reason;
    if (error instanceof GeminiError) throw error;
    throw new GeminiError(signal.aborted ? "TIMEOUT" : "PROVIDER_UNAVAILABLE");
  }
}

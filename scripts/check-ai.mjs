import {
  generateGeminiJson,
  GeminiError,
} from "../src/server/services/gemini.mjs";

try {
  const { text, model } = await generateGeminiJson({
    systemInstruction:
      "Extraia o teto de preço da descrição de um imóvel. Responda somente o JSON solicitado.",
    prompt: "Casa com piscina até 950 mil reais.",
    schema: {
      type: "object",
      properties: { maxPrice: { type: "number" } },
      required: ["maxPrice"],
      additionalProperties: false,
    },
  });
  if (JSON.parse(text).maxPrice !== 950000)
    throw new GeminiError("INVALID_RESPONSE");
  console.log(
    JSON.stringify({
      connected: true,
      provider: "Google Gemini",
      model,
      structuredOutputValidated: true,
    }),
  );
} catch (error) {
  const messages = {
    NOT_CONFIGURED:
      "Configure GEMINI_API_KEY no .env.local com uma chave do Google AI Studio.",
    INVALID_MODEL: "Confira GEMINI_MODEL no .env.local.",
    AUTHENTICATION_FAILED:
      "O Google recusou a chave. Confira a chave, as restrições e o acesso à Gemini API no projeto Google.",
    MODEL_UNAVAILABLE:
      "O modelo não está disponível para esta chave. Confira GEMINI_MODEL e os modelos liberados no Google AI Studio.",
    RATE_LIMITED:
      "O Google informou limite de uso ou cota indisponível. Confira as cotas e o faturamento no Google AI Studio.",
    TIMEOUT: "O Google não respondeu em 15 segundos. Tente novamente.",
  };
  console.error(
    error instanceof GeminiError
      ? messages[error.code] ||
          "O Google não retornou uma resposta válida. Tente novamente."
      : "Não foi possível verificar a integração com o Google.",
  );
  process.exitCode = 1;
}

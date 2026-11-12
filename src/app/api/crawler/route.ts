import { NextRequest, NextResponse } from "next/server";
import { ZodError, z } from "zod";
import {
  authErrorResponse,
  requireSession,
} from "@/server/services/auth.service";
import { CrawlerError, crawlerService } from "@/server/services/crawler.service";
import { extractionMapSchema } from "@/server/services/listing-extraction";

const schema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("ANALYZE"),
      listUrl: z.string().trim().url().max(2000),
    })
    .strict(),
  z
    .object({
      action: z.literal("SAVE"),
      name: z.string().trim().min(2).max(120),
      listUrl: z.string().trim().url().max(2000),
      extractionMap: extractionMapSchema,
      logoUrl: z.string().trim().url().max(2000).nullable().optional(),
      purpose: z.enum(["SALE", "RENT"]).nullable().optional(),
      paginationTemplate: z.string().trim().max(2100).nullable().optional(),
      maxPages: z.number().int().min(1).max(200).optional(),
    })
    .strict(),
  z
    .object({ action: z.literal("COLLECT"), sourceId: z.string().uuid() })
    .strict(),
  z
    .object({
      action: z.literal("SET_ACTIVE"),
      sourceId: z.string().uuid(),
      active: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal("SET_MAX_PAGES"),
      sourceId: z.string().uuid(),
      maxPages: z.number().int().min(1).max(200),
    })
    .strict(),
  z
    .object({ action: z.literal("REMOVE"), sourceId: z.string().uuid() })
    .strict(),
]);

/** Códigos técnicos viram explicações acionáveis para quem está na tela. */
const EXPLICACAO: Record<string, string> = {
  PAGE_HAS_NO_LISTINGS:
    "Esta página não traz os anúncios no HTML: eles são carregados por JavaScript depois que o navegador abre o site. O crawler não consegue lê-la.",
  MAP_MATCHED_NOTHING:
    "Não consegui identificar os anúncios nesta página. Tente o endereço da listagem completa, com os imóveis já visíveis.",
  BLOCKED_BY_ROBOTS: "O robots.txt deste site proíbe a leitura desta página.",
  PRIVATE_HOST: "Endereços internos não podem ser consultados.",
  UNSUPPORTED_SCHEME: "Informe um endereço http ou https.",
  INVALID_URL: "O endereço informado não é uma URL válida.",
  NOT_FOUND: "A página não foi encontrada no site de origem.",
  RATE_LIMITED_BY_SITE:
    "O site está limitando nossas requisições (HTTP 429). Ele pede que aguardemos antes de tentar de novo.",
  FORBIDDEN_BY_SITE:
    "O site recusou o acesso ao nosso coletor (HTTP 403). Ele não permite leitura automatizada desta página.",
  NOT_HTML: "O endereço não devolveu uma página HTML.",
  TIMEOUT: "O site demorou demais para responder.",
  AI_TIMEOUT:
    "A análise da página passou do tempo limite. Páginas muito grandes são mais difíceis de interpretar; tente a URL de uma listagem filtrada, com menos resultados por página.",
  NETWORK_ERROR: "Não foi possível conectar ao site. Tente novamente.",
  PROVIDER_UNAVAILABLE:
    "O serviço de IA está indisponível no momento. Tente novamente em instantes.",
  RATE_LIMITED: "Muitas análises seguidas. Aguarde um instante.",
};

function errorResponse(error: unknown) {
  const denied = authErrorResponse(error);
  if (denied) return denied;
  if (error instanceof CrawlerError)
    return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof ZodError)
    return NextResponse.json(
      { error: error.issues[0]?.message ?? "Confira os dados informados." },
      { status: 400 },
    );
  if (error instanceof SyntaxError)
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  // Erros do buscador e da descoberta trazem um código; a mensagem é genérica.
  if (error && typeof error === "object" && "code" in error) {
    const codigo = String((error as { code: unknown }).code);
    // O site pode dizer quanto tempo esperar; repassamos esse prazo.
    const espera = /^RATE_LIMITED_BY_SITE_(.+)$/.exec(codigo);
    if (espera)
      return NextResponse.json(
        {
          error: `${EXPLICACAO.RATE_LIMITED_BY_SITE} Ele pede ${espera[1]} segundos.`,
        },
        { status: 400 },
      );
    return NextResponse.json(
      {
        error:
          EXPLICACAO[codigo] ?? `Não foi possível analisar a página: ${codigo}.`,
      },
      { status: 400 },
    );
  }
  return NextResponse.json(
    { error: "Não foi possível concluir a operação." },
    { status: 500 },
  );
}

export async function GET(request: NextRequest) {
  try {
    const { user, tenant } = await requireSession(request);
    const sourceId = request.nextUrl.searchParams.get("sourceId") ?? undefined;
    const [sources, listings] = await Promise.all([
      crawlerService.listar(user.role, tenant.id),
      crawlerService.anuncios(user.role, tenant.id, sourceId),
    ]);
    return NextResponse.json(
      { sources, listings },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, tenant } = await requireSession(request);
    const body = schema.parse(await request.json());

    if (body.action === "ANALYZE")
      return NextResponse.json(
        await crawlerService.analisar(user.role, body.listUrl, request.signal),
      );

    if (body.action === "SAVE")
      return NextResponse.json(
        await crawlerService.salvar(user.role, tenant.id, {
          name: body.name,
          listUrl: body.listUrl,
          extractionMap: body.extractionMap,
          logoUrl: body.logoUrl ?? null,
          purpose: body.purpose ?? null,
          paginationTemplate: body.paginationTemplate ?? null,
          maxPages: body.maxPages,
        }),
        { status: 201 },
      );

    if (body.action === "COLLECT")
      return NextResponse.json(
        await crawlerService.coletar(
          user.role,
          tenant.id,
          body.sourceId,
          request.signal,
        ),
      );

    if (body.action === "SET_ACTIVE") {
      await crawlerService.alternarAtiva(
        user.role,
        tenant.id,
        body.sourceId,
        body.active,
      );
      return NextResponse.json({ ok: true });
    }

    if (body.action === "SET_MAX_PAGES") {
      await crawlerService.definirMaxPaginas(
        user.role,
        tenant.id,
        body.sourceId,
        body.maxPages,
      );
      return NextResponse.json({ ok: true });
    }

    await crawlerService.remover(user.role, tenant.id, body.sourceId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

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
    .object({ action: z.literal("REMOVE"), sourceId: z.string().uuid() })
    .strict(),
]);

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
  if (error && typeof error === "object" && "code" in error)
    return NextResponse.json(
      { error: `Não foi possível analisar a página: ${String((error as { code: unknown }).code)}.` },
      { status: 400 },
    );
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

    await crawlerService.remover(user.role, tenant.id, body.sourceId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

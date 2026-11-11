import { NextRequest, NextResponse } from "next/server";
import { aiSearchService } from "@/server/services/ai-search.service";
import { z } from "zod";
import {
  requireSession,
  authErrorResponse,
} from "@/server/services/auth.service";

const searchSchema = z.object({
  query: z.string().trim().min(3).max(1500),
  onlyAvailable: z.boolean().default(true),
});

export async function POST(req: NextRequest) {
  try {
    const { tenant } = await requireSession(req, "properties:view");
    const parsed = searchSchema.safeParse(await req.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: "Descreva o imóvel em 3 a 1.500 caracteres." },
        { status: 400 },
      );
    const { query, onlyAvailable } = parsed.data;

    const response = await aiSearchService.searchWithAI(
      tenant.id,
      query,
      onlyAvailable,
      req.signal,
    );

    return NextResponse.json(response);
  } catch (error) {
    const denied = authErrorResponse(error);
    if (denied) return denied;
    if (error instanceof SyntaxError)
      return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
    return NextResponse.json(
      { error: "Não foi possível buscar os imóveis. Tente novamente." },
      { status: 500 },
    );
  }
}

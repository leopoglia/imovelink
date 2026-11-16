import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { LEAD_STAGES } from "@/lib/lead-stages";
import { leadService } from "@/server/services/lead.service";
import {
  authErrorResponse,
  requireSession,
} from "@/server/services/auth.service";
import { observarRota } from "@/server/observability/metrics";
import type { LeadStage } from "@/types/domain";

const movimento = z.object({
  stage: z.enum(LEAD_STAGES as [LeadStage, ...LeadStage[]], {
    errorMap: () => ({ message: "Etapa inválida." }),
  }),
});

const naoEncontrado = () =>
  NextResponse.json({ error: "Contato não encontrado." }, { status: 404 });

async function handlePATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { tenant, user } = await requireSession(req, "leads:manage");
    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) return naoEncontrado();

    const parsed = movimento.safeParse(await req.json());
    if (!parsed.success)
      return NextResponse.json({ error: "Etapa inválida." }, { status: 400 });

    const lead = await leadService.moveLead({
      tenantId: tenant.id,
      leadId: id,
      userRole: user.role,
      stage: parsed.data.stage,
    });
    return lead ? NextResponse.json({ lead }) : naoEncontrado();
  } catch (error) {
    const denied = authErrorResponse(error);
    if (denied) return denied;
    if (error instanceof SyntaxError)
      return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
    return NextResponse.json(
      { error: "Não foi possível mover o contato." },
      { status: 500 },
    );
  }
}

// Cada chamada é contada e cronometrada para o Prometheus.
export const PATCH = (
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) => observarRota("/api/leads/[id]", "PATCH", () => handlePATCH(req, context));

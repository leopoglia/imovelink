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

const texto = (mensagem: string) =>
  z.string({ invalid_type_error: mensagem }).trim();

const DESCRICAO = "Descreva o imóvel em 3 a 1.500 caracteres.";

/** Todos os campos são opcionais, mas a requisição precisa alterar ao menos um. */
const alteracoes = z
  .object({
    name: texto("Informe o nome.")
      .min(2, "Informe o nome.")
      .max(120, "Informe o nome.")
      .optional(),
    phone: texto("Informe um telefone válido.")
      .max(30, "Informe um telefone válido.")
      .refine(
        (valor) => valor.replace(/\D/g, "").length >= 8,
        "Informe um telefone válido.",
      )
      .optional(),
    // E-mail vazio é aceito: limpa o campo.
    email: z
      .union([
        z.literal(""),
        texto("Informe um e-mail válido.")
          .email("Informe um e-mail válido.")
          .max(254, "Informe um e-mail válido."),
      ])
      .optional(),
    naturalSearchDesire: texto(DESCRICAO)
      .min(3, DESCRICAO)
      .max(1500, DESCRICAO)
      .optional(),
    stage: z
      .enum(LEAD_STAGES as [LeadStage, ...LeadStage[]], {
        errorMap: () => ({ message: "Etapa inválida." }),
      })
      .optional(),
  })
  .refine(
    (dados) => Object.values(dados).some((valor) => valor !== undefined),
    "Nada para alterar.",
  );

type Contexto = { params: Promise<{ id: string }> };

const naoEncontrado = () =>
  NextResponse.json({ error: "Contato não encontrado." }, { status: 404 });

const idValido = (id: string) => z.string().uuid().safeParse(id).success;

async function handlePATCH(req: NextRequest, context: Contexto) {
  try {
    const { tenant, user } = await requireSession(req, "leads:manage");
    const { id } = await context.params;
    if (!idValido(id)) return naoEncontrado();

    const parsed = alteracoes.safeParse(await req.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
        { status: 400 },
      );

    const lead = await leadService.updateLead({
      tenantId: tenant.id,
      leadId: id,
      userRole: user.role,
      changes: parsed.data,
    });
    return lead ? NextResponse.json({ lead }) : naoEncontrado();
  } catch (error) {
    const denied = authErrorResponse(error);
    if (denied) return denied;
    if (error instanceof SyntaxError)
      return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
    return NextResponse.json(
      { error: "Não foi possível alterar o contato." },
      { status: 500 },
    );
  }
}

async function handleDELETE(req: NextRequest, context: Contexto) {
  try {
    const { tenant, user } = await requireSession(req, "leads:delete");
    const { id } = await context.params;
    if (!idValido(id)) return naoEncontrado();

    const excluido = await leadService.deleteLead(tenant.id, id, user.role);
    return excluido ? NextResponse.json({ success: true }) : naoEncontrado();
  } catch (error) {
    const denied = authErrorResponse(error);
    if (denied) return denied;
    return NextResponse.json(
      { error: "Não foi possível excluir o contato." },
      { status: 500 },
    );
  }
}

// Cada chamada é contada e cronometrada para o Prometheus.
export const PATCH = (req: NextRequest, context: Contexto) =>
  observarRota("/api/leads/[id]", "PATCH", () => handlePATCH(req, context));

export const DELETE = (req: NextRequest, context: Contexto) =>
  observarRota("/api/leads/[id]", "DELETE", () => handleDELETE(req, context));

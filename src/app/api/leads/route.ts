import { NextRequest, NextResponse } from "next/server";
import { leadQualificationService } from "@/server/services/lead-qualification.service";
import { tenantRepository } from "@/server/repositories/tenant.repository";
import { z } from "zod";
import { observarRota } from "@/server/observability/metrics";

/** Texto obrigatório: ausente, de outro tipo ou vazio devolvem a mesma mensagem. */
const texto = (mensagem: string) =>
  z.string({ required_error: mensagem, invalid_type_error: mensagem }).trim();

const vazioComoAusente = (valor: unknown) =>
  valor === undefined || valor === null || valor === "" ? undefined : valor;

const orcamento = z.preprocess(
  (valor) => {
    const informado = vazioComoAusente(valor);
    return informado === undefined ? undefined : Number(informado);
  },
  z
    .number({ invalid_type_error: "Orçamento inválido." })
    .finite("Orçamento inválido.")
    .min(0, "Orçamento inválido.")
    .max(99999999999, "Orçamento inválido.")
    .optional(),
);

const DESCRICAO = "Descreva o imóvel em 3 a 1.500 caracteres.";

// A rota é pública: o formulário da vitrine exige os campos, mas quem chama a
// API direto não passa por ele. A etapa e o corretor não fazem parte do
// schema — são decididos no servidor, não por quem envia o contato.
const contatoSchema = z.object({
  tenantId: texto("Imobiliária inválida.").uuid("Imobiliária inválida."),
  name: texto("Informe seu nome.")
    .min(2, "Informe seu nome.")
    .max(120, "Informe seu nome."),
  phone: texto("Informe um telefone válido.")
    .max(30, "Informe um telefone válido.")
    .refine(
      (valor) => valor.replace(/\D/g, "").length >= 8,
      "Informe um telefone válido.",
    ),
  email: z.preprocess(
    vazioComoAusente,
    texto("Informe um e-mail válido.")
      .email("Informe um e-mail válido.")
      .max(254, "Informe um e-mail válido.")
      .optional(),
  ),
  naturalSearchDesire: texto(DESCRICAO).min(3, DESCRICAO).max(1500, DESCRICAO),
  originChannel: z
    .enum(["WHATSAPP", "PORTAL_B2B", "INSTAGRAM", "INDICACAO", "TELEFONE"], {
      errorMap: () => ({ message: "Canal de origem inválido." }),
    })
    .default("WHATSAPP"),
  budgetMin: orcamento,
  budgetMax: orcamento,
});

async function handlePOST(req: NextRequest) {
  try {
    const parsed = contatoSchema.safeParse(await req.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
        { status: 400 },
      );
    const contato = parsed.data;

    const broker = await tenantRepository.findFirstBroker(contato.tenantId);
    if (!broker)
      return NextResponse.json(
        { error: "Imobiliária sem responsável cadastrado." },
        { status: 400 },
      );

    const created = await leadQualificationService.createAndQualifyLead({
      tenantId: contato.tenantId,
      assignedBrokerId: broker.id,
      assignedBrokerName: broker.name,
      name: contato.name,
      email: contato.email ?? "contato@cliente.com.br",
      phone: contato.phone,
      originChannel: contato.originChannel,
      naturalSearchDesire: contato.naturalSearchDesire,
      budgetMin: contato.budgetMin,
      budgetMax: contato.budgetMax,
      stage: "NEW",
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError)
      return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
    // A mensagem interna (banco, serviço) não é repassada a um visitante anônimo.
    return NextResponse.json(
      { error: "Não foi possível registrar seu contato. Tente novamente." },
      { status: 500 },
    );
  }
}

// Cada chamada é contada e cronometrada para o Prometheus.
export const POST = (req: NextRequest) =>
  observarRota("/api/leads", "POST", () => handlePOST(req));

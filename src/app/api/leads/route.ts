import { NextRequest, NextResponse } from "next/server";
import { leadQualificationService } from "@/server/services/lead-qualification.service";
import { LeadChannel, LeadStage } from "@/types/domain";
import { tenantRepository } from "@/server/repositories/tenant.repository";
import { z } from "zod";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const destination = z.string().uuid().safeParse(body.tenantId);
    if (!destination.success)
      return NextResponse.json(
        { error: "Imobiliária inválida." },
        { status: 400 },
      );
    const tenantId = destination.data;
    const broker = await tenantRepository.findFirstBroker(tenantId);
    if (!broker)
      return NextResponse.json(
        { error: "Imobiliária sem responsável cadastrado." },
        { status: 400 },
      );
    const assignedBrokerId = broker.id;
    const assignedBrokerName = broker.name;

    const created = await leadQualificationService.createAndQualifyLead({
      tenantId,
      assignedBrokerId,
      assignedBrokerName,
      name: body.name,
      email: body.email || "contato@cliente.com.br",
      phone: body.phone || "(47) 99900-0000",
      originChannel: (body.originChannel as LeadChannel) || "WHATSAPP",
      naturalSearchDesire: body.naturalSearchDesire,
      budgetMin: body.budgetMin ? Number(body.budgetMin) : undefined,
      budgetMax: body.budgetMax ? Number(body.budgetMax) : undefined,
      stage: (body.stage as LeadStage) || "NEW",
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Erro ao qualificar e criar lead.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

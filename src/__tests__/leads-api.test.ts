import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/leads/route";
import { leadQualificationService } from "@/server/services/lead-qualification.service";
import { tenantRepository } from "@/server/repositories/tenant.repository";
import {
  SEED_LEADS,
  SEED_TENANTS,
  SEED_USERS,
} from "@/server/seeds/seed-jaragua";

vi.mock("@/server/services/lead-qualification.service", () => ({
  leadQualificationService: { createAndQualifyLead: vi.fn() },
}));

vi.mock("@/server/repositories/tenant.repository", () => ({
  tenantRepository: { findFirstBroker: vi.fn() },
}));

const TENANT_ID = SEED_TENANTS[0].id;
const corretor = SEED_USERS[1];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(tenantRepository.findFirstBroker).mockResolvedValue(corretor);
  vi.mocked(leadQualificationService.createAndQualifyLead).mockResolvedValue({
    lead: SEED_LEADS[0],
    matchedProperties: [],
  });
});

const request = (body: unknown) =>
  new NextRequest("http://localhost/api/leads", {
    method: "POST",
    body: JSON.stringify(body),
  });

describe("Captação de contato pela vitrine", () => {
  it("recusa uma imobiliária que não é um identificador válido", async () => {
    const response = await POST(request({ tenantId: "nao-e-uuid" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Imobiliária inválida.",
    });
    expect(
      leadQualificationService.createAndQualifyLead,
    ).not.toHaveBeenCalled();
  });

  it("recusa quando a imobiliária não tem responsável cadastrado", async () => {
    vi.mocked(tenantRepository.findFirstBroker).mockResolvedValue(undefined);
    const response = await POST(
      request({ tenantId: TENANT_ID, name: "Patrícia" }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Imobiliária sem responsável cadastrado.",
    });
    expect(
      leadQualificationService.createAndQualifyLead,
    ).not.toHaveBeenCalled();
  });

  it("cria o contato e atribui o responsável escolhido no servidor", async () => {
    const response = await POST(
      request({
        tenantId: TENANT_ID,
        name: "Patrícia Weiss",
        email: "patricia@example.com",
        phone: "(47) 98888-1111",
        originChannel: "SITE",
        naturalSearchDesire: "casa com quintal até 800 mil",
        budgetMin: "400000",
        budgetMax: "800000",
        stage: "CONTACTED",
      }),
    );
    expect(response.status).toBe(201);
    const entrada = vi.mocked(leadQualificationService.createAndQualifyLead)
      .mock.calls[0][0];
    expect(entrada).toMatchObject({
      tenantId: TENANT_ID,
      assignedBrokerId: corretor.id,
      assignedBrokerName: corretor.name,
      email: "patricia@example.com",
      originChannel: "SITE",
      stage: "CONTACTED",
      budgetMin: 400000,
      budgetMax: 800000,
    });
  });

  it("aplica os valores padrão quando o formulário envia só o essencial", async () => {
    const response = await POST(
      request({ tenantId: TENANT_ID, name: "Gabriel" }),
    );
    expect(response.status).toBe(201);
    const entrada = vi.mocked(leadQualificationService.createAndQualifyLead)
      .mock.calls[0][0];
    expect(entrada).toMatchObject({
      email: "contato@cliente.com.br",
      phone: "(47) 99900-0000",
      originChannel: "WHATSAPP",
      stage: "NEW",
    });
    expect(entrada.budgetMin).toBeUndefined();
    expect(entrada.budgetMax).toBeUndefined();
  });

  it("devolve a mensagem de erro quando a qualificação falha", async () => {
    vi.mocked(leadQualificationService.createAndQualifyLead).mockRejectedValue(
      new Error("Nome do contato é obrigatório."),
    );
    const response = await POST(request({ tenantId: TENANT_ID, name: " " }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Nome do contato é obrigatório.",
    });
  });

  it("não vaza detalhes quando a falha não é um Error", async () => {
    vi.mocked(leadQualificationService.createAndQualifyLead).mockRejectedValue(
      "falha inesperada",
    );
    const response = await POST(request({ tenantId: TENANT_ID, name: "Ana" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Erro ao qualificar e criar lead.",
    });
  });

  it("recusa um corpo que não é JSON válido", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/leads", {
        method: "POST",
        body: "{ isso não é json",
      }),
    );
    expect(response.status).toBe(400);
  });
});

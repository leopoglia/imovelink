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

const contato = {
  tenantId: TENANT_ID,
  name: "Patrícia Weiss",
  phone: "(47) 98888-1111",
  naturalSearchDesire: "casa com quintal até 800 mil",
};

const entradaDoServico = () =>
  vi.mocked(leadQualificationService.createAndQualifyLead).mock.calls[0][0];

describe("Captação de contato pela vitrine", () => {
  it("recusa uma imobiliária que não é um identificador válido", async () => {
    const response = await POST(
      request({ ...contato, tenantId: "nao-e-uuid" }),
    );
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
    const response = await POST(request(contato));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Imobiliária sem responsável cadastrado.",
    });
    expect(
      leadQualificationService.createAndQualifyLead,
    ).not.toHaveBeenCalled();
  });

  // A rota é pública: o formulário exige os campos, mas quem chama a API
  // direto não passa pelo formulário. A validação que vale é a do servidor.
  it.each([
    ["nome ausente", { name: undefined }, "Informe seu nome."],
    ["nome só com espaços", { name: "   " }, "Informe seu nome."],
    ["nome que não é texto", { name: 42 }, "Informe seu nome."],
    ["telefone ausente", { phone: undefined }, "Informe um telefone válido."],
    ["telefone sem dígitos", { phone: "abcdefgh" }, "Informe um telefone válido."],
    ["e-mail malformado", { email: "nao-e-email" }, "Informe um e-mail válido."],
    [
      "descrição ausente",
      { naturalSearchDesire: undefined },
      "Descreva o imóvel em 3 a 1.500 caracteres.",
    ],
    [
      "descrição longa demais",
      { naturalSearchDesire: "a".repeat(1501) },
      "Descreva o imóvel em 3 a 1.500 caracteres.",
    ],
    ["canal desconhecido", { originChannel: "SITE" }, "Canal de origem inválido."],
    ["orçamento negativo", { budgetMax: -1 }, "Orçamento inválido."],
    ["orçamento que não é número", { budgetMax: "muito" }, "Orçamento inválido."],
  ])("recusa %s sem gravar o contato", async (_caso, campos, mensagem) => {
    const response = await POST(request({ ...contato, ...campos }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: mensagem });
    expect(tenantRepository.findFirstBroker).not.toHaveBeenCalled();
    expect(
      leadQualificationService.createAndQualifyLead,
    ).not.toHaveBeenCalled();
  });

  it("cria o contato e atribui o responsável escolhido no servidor", async () => {
    const response = await POST(
      request({
        ...contato,
        name: "  Patrícia Weiss  ",
        email: "patricia@example.com",
        originChannel: "PORTAL_B2B",
        budgetMin: "400000",
        budgetMax: "800000",
      }),
    );
    expect(response.status).toBe(201);
    expect(entradaDoServico()).toMatchObject({
      tenantId: TENANT_ID,
      assignedBrokerId: corretor.id,
      assignedBrokerName: corretor.name,
      name: "Patrícia Weiss",
      email: "patricia@example.com",
      phone: "(47) 98888-1111",
      originChannel: "PORTAL_B2B",
      naturalSearchDesire: "casa com quintal até 800 mil",
      budgetMin: 400000,
      budgetMax: 800000,
    });
  });

  it("não deixa o visitante escolher a etapa nem o corretor do contato", async () => {
    const response = await POST(
      request({ ...contato, stage: "WON", assignedBrokerId: "outro" }),
    );
    expect(response.status).toBe(201);
    expect(entradaDoServico()).toMatchObject({
      stage: "NEW",
      assignedBrokerId: corretor.id,
    });
  });

  it("aplica os valores padrão quando o formulário envia só o essencial", async () => {
    const response = await POST(request({ ...contato, email: "" }));
    expect(response.status).toBe(201);
    const entrada = entradaDoServico();
    expect(entrada).toMatchObject({
      email: "contato@cliente.com.br",
      originChannel: "WHATSAPP",
      stage: "NEW",
    });
    expect(entrada.budgetMin).toBeUndefined();
    expect(entrada.budgetMax).toBeUndefined();
  });

  it("não repassa ao visitante a mensagem interna de uma falha", async () => {
    vi.mocked(leadQualificationService.createAndQualifyLead).mockRejectedValue(
      new Error('relation "imovelink.leads" does not exist'),
    );
    const response = await POST(request(contato));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Não foi possível registrar seu contato. Tente novamente.",
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
    await expect(response.json()).resolves.toEqual({
      error: "Dados inválidos.",
    });
  });
});

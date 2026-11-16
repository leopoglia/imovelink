import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as listar } from "@/app/api/leads/route";
import { PATCH as mover } from "@/app/api/leads/[id]/route";
import { authRepository } from "@/server/repositories/auth.repository";
import { tenantRepository } from "@/server/repositories/tenant.repository";
import { leadService } from "@/server/services/lead.service";
import { SESSION_COOKIE } from "@/server/services/auth.service";
import {
  SEED_LEADS,
  SEED_TENANTS,
  SEED_USERS,
} from "@/server/seeds/seed-jaragua";

vi.mock("@/server/repositories/auth.repository", () => ({
  authRepository: { sessionUser: vi.fn() },
}));
vi.mock("@/server/repositories/tenant.repository", () => ({
  tenantRepository: {
    findUserById: vi.fn(),
    findTenantById: vi.fn(),
    findFirstBroker: vi.fn(),
  },
}));
vi.mock("@/server/services/lead.service", () => ({
  leadService: { listLeads: vi.fn(), moveLead: vi.fn() },
}));
vi.mock("@/server/services/lead-qualification.service", () => ({
  leadQualificationService: { createAndQualifyLead: vi.fn() },
}));

const token = "a".repeat(43);
const leadId = "70fa03e2-9d17-4017-b822-55fec72af326";
const ctx = (id = leadId) => ({ params: Promise.resolve({ id }) });
const corretor = SEED_USERS[1];

function req(
  path: string,
  method = "GET",
  body?: unknown,
  opcoes: { autenticado?: boolean; origem?: string } = {},
) {
  const { autenticado = true, origem } = opcoes;
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(autenticado ? { Cookie: `${SESSION_COOKIE}=${token}` } : {}),
      ...(origem ? { Origin: origem } : {}),
    },
    ...(body === undefined
      ? {}
      : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(authRepository.sessionUser).mockResolvedValue(corretor.id);
  vi.mocked(tenantRepository.findUserById).mockResolvedValue(corretor);
  vi.mocked(tenantRepository.findTenantById).mockResolvedValue(SEED_TENANTS[0]);
  vi.mocked(leadService.listLeads).mockResolvedValue([SEED_LEADS[0]]);
  vi.mocked(leadService.moveLead).mockResolvedValue({
    ...SEED_LEADS[0],
    stage: "PROPOSAL",
  });
});

describe("Listagem de contatos do quadro", () => {
  it("exige sessão", async () => {
    const response = await listar(
      req("/api/leads", "GET", undefined, { autenticado: false }),
    );
    expect(response.status).toBe(401);
    expect(leadService.listLeads).not.toHaveBeenCalled();
  });

  it("lista os contatos da imobiliária da sessão", async () => {
    const response = await listar(req("/api/leads?tenantId=outra"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ leads: [SEED_LEADS[0]] });
    expect(leadService.listLeads).toHaveBeenCalledWith(
      SEED_TENANTS[0].id,
      corretor.role,
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("não expõe a mensagem interna quando a listagem falha", async () => {
    vi.mocked(leadService.listLeads).mockRejectedValue(
      new Error("relation imovelink.leads does not exist"),
    );
    const response = await listar(req("/api/leads"));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Não foi possível carregar os contatos.",
    });
  });
});

describe("Mudança de etapa de um contato", () => {
  it("exige sessão", async () => {
    const response = await mover(
      req(
        `/api/leads/${leadId}`,
        "PATCH",
        { stage: "PROPOSAL" },
        { autenticado: false },
      ),
      ctx(),
    );
    expect(response.status).toBe(401);
    expect(leadService.moveLead).not.toHaveBeenCalled();
  });

  it("recusa requisição vinda de outra origem", async () => {
    const response = await mover(
      req(
        `/api/leads/${leadId}`,
        "PATCH",
        { stage: "PROPOSAL" },
        { origem: "https://outro-site.example" },
      ),
      ctx(),
    );
    expect(response.status).toBe(403);
    expect(leadService.moveLead).not.toHaveBeenCalled();
  });

  it("move o contato usando a imobiliária e o papel da sessão", async () => {
    const response = await mover(
      req(`/api/leads/${leadId}`, "PATCH", {
        stage: "PROPOSAL",
        tenantId: "outra-imobiliaria",
        userRole: "SUPER_ADMIN",
      }),
      ctx(),
    );
    expect(response.status).toBe(200);
    const corpo = await response.json();
    expect(corpo.lead.stage).toBe("PROPOSAL");
    expect(leadService.moveLead).toHaveBeenCalledWith({
      tenantId: SEED_TENANTS[0].id,
      leadId,
      userRole: corretor.role,
      stage: "PROPOSAL",
    });
  });

  it.each([
    ["etapa desconhecida", { stage: "ARQUIVADO" }],
    ["etapa ausente", {}],
    ["etapa de outro tipo", { stage: 3 }],
  ])("recusa %s", async (_caso, corpo) => {
    const response = await mover(
      req(`/api/leads/${leadId}`, "PATCH", corpo),
      ctx(),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Etapa inválida.",
    });
    expect(leadService.moveLead).not.toHaveBeenCalled();
  });

  it("responde 404 para um identificador que não é UUID", async () => {
    const response = await mover(
      req("/api/leads/abc", "PATCH", { stage: "PROPOSAL" }),
      ctx("abc"),
    );
    expect(response.status).toBe(404);
    expect(leadService.moveLead).not.toHaveBeenCalled();
  });

  it("responde 404 quando o contato não existe na imobiliária", async () => {
    vi.mocked(leadService.moveLead).mockResolvedValue(null);
    const response = await mover(
      req(`/api/leads/${leadId}`, "PATCH", { stage: "WON" }),
      ctx(),
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Contato não encontrado.",
    });
  });

  it("responde 400 para JSON inválido", async () => {
    const response = await mover(
      req(`/api/leads/${leadId}`, "PATCH", "{stage"),
      ctx(),
    );
    expect(response.status).toBe(400);
  });

  it("não expõe a mensagem interna quando a gravação falha", async () => {
    vi.mocked(leadService.moveLead).mockRejectedValue(
      new Error("deadlock detected"),
    );
    const response = await mover(
      req(`/api/leads/${leadId}`, "PATCH", { stage: "WON" }),
      ctx(),
    );
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Não foi possível mover o contato.",
    });
  });
});

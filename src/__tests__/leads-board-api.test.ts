import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as listar } from "@/app/api/leads/route";
import {
  DELETE as excluir,
  PATCH as alterar,
} from "@/app/api/leads/[id]/route";
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
  leadService: {
    listLeads: vi.fn(),
    updateLead: vi.fn(),
    deleteLead: vi.fn(),
  },
}));
vi.mock("@/server/services/lead-qualification.service", () => ({
  leadQualificationService: { createAndQualifyLead: vi.fn() },
}));

const token = "a".repeat(43);
const leadId = "70fa03e2-9d17-4017-b822-55fec72af326";
const ctx = (id = leadId) => ({ params: Promise.resolve({ id }) });
const gestor = SEED_USERS[0];
const corretor = SEED_USERS[1];
let usuario = corretor;

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
  usuario = corretor;
  vi.mocked(authRepository.sessionUser).mockImplementation(
    async () => usuario.id,
  );
  vi.mocked(tenantRepository.findUserById).mockImplementation(
    async () => usuario,
  );
  vi.mocked(tenantRepository.findTenantById).mockResolvedValue(SEED_TENANTS[0]);
  vi.mocked(leadService.listLeads).mockResolvedValue([SEED_LEADS[0]]);
  vi.mocked(leadService.updateLead).mockResolvedValue({
    ...SEED_LEADS[0],
    stage: "PROPOSAL",
  });
  vi.mocked(leadService.deleteLead).mockResolvedValue(true);
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


describe("Alteração de um contato", () => {
  it("exige sessão", async () => {
    const response = await alterar(
      req(
        `/api/leads/${leadId}`,
        "PATCH",
        { stage: "PROPOSAL" },
        { autenticado: false },
      ),
      ctx(),
    );
    expect(response.status).toBe(401);
    expect(leadService.updateLead).not.toHaveBeenCalled();
  });

  it("recusa requisição vinda de outra origem", async () => {
    const response = await alterar(
      req(
        `/api/leads/${leadId}`,
        "PATCH",
        { stage: "PROPOSAL" },
        { origem: "https://outro-site.example" },
      ),
      ctx(),
    );
    expect(response.status).toBe(403);
    expect(leadService.updateLead).not.toHaveBeenCalled();
  });

  it("move o contato usando a imobiliária e o papel da sessão", async () => {
    const response = await alterar(
      req(`/api/leads/${leadId}`, "PATCH", {
        stage: "PROPOSAL",
        tenantId: "outra-imobiliaria",
        userRole: "SUPER_ADMIN",
        aiScore: 100,
      }),
      ctx(),
    );
    expect(response.status).toBe(200);
    const corpo = await response.json();
    expect(corpo.lead.stage).toBe("PROPOSAL");
    // Campos que o cliente não pode definir são descartados pela validação.
    expect(leadService.updateLead).toHaveBeenCalledWith({
      tenantId: SEED_TENANTS[0].id,
      leadId,
      userRole: corretor.role,
      changes: { stage: "PROPOSAL" },
    });
  });

  it("altera os dados do contato, aparando espaços", async () => {
    const response = await alterar(
      req(`/api/leads/${leadId}`, "PATCH", {
        name: "  Patrícia Weiss  ",
        phone: " (47) 98888-1111 ",
        email: "",
        naturalSearchDesire: "  casa com quintal até 800 mil  ",
      }),
      ctx(),
    );
    expect(response.status).toBe(200);
    expect(
      vi.mocked(leadService.updateLead).mock.calls[0][0].changes,
    ).toEqual({
      name: "Patrícia Weiss",
      phone: "(47) 98888-1111",
      email: "",
      naturalSearchDesire: "casa com quintal até 800 mil",
    });
  });

  it.each([
    ["etapa desconhecida", { stage: "ARQUIVADO" }, "Etapa inválida."],
    ["etapa de outro tipo", { stage: 3 }, "Etapa inválida."],
    ["nenhum campo", {}, "Nada para alterar."],
    ["só campos não editáveis", { aiScore: 100 }, "Nada para alterar."],
    ["nome em branco", { name: "   " }, "Informe o nome."],
    ["nome de outro tipo", { name: 7 }, "Informe o nome."],
    ["telefone sem dígitos", { phone: "abc" }, "Informe um telefone válido."],
    ["e-mail malformado", { email: "sem-arroba" }, "Informe um e-mail válido."],
    [
      "pedido curto demais",
      { naturalSearchDesire: "ab" },
      "Descreva o imóvel em 3 a 1.500 caracteres.",
    ],
    [
      "pedido longo demais",
      { naturalSearchDesire: "x".repeat(1501) },
      "Descreva o imóvel em 3 a 1.500 caracteres.",
    ],
  ])("recusa %s", async (_caso, corpo, mensagem) => {
    const response = await alterar(
      req(`/api/leads/${leadId}`, "PATCH", corpo),
      ctx(),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: mensagem });
    expect(leadService.updateLead).not.toHaveBeenCalled();
  });

  it("responde 404 para um identificador que não é UUID", async () => {
    const response = await alterar(
      req("/api/leads/abc", "PATCH", { stage: "PROPOSAL" }),
      ctx("abc"),
    );
    expect(response.status).toBe(404);
    expect(leadService.updateLead).not.toHaveBeenCalled();
  });

  it("responde 404 quando o contato não existe na imobiliária", async () => {
    vi.mocked(leadService.updateLead).mockResolvedValue(null);
    const response = await alterar(
      req(`/api/leads/${leadId}`, "PATCH", { stage: "WON" }),
      ctx(),
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Contato não encontrado.",
    });
  });

  it("responde 400 para JSON inválido", async () => {
    const response = await alterar(
      req(`/api/leads/${leadId}`, "PATCH", "{stage"),
      ctx(),
    );
    expect(response.status).toBe(400);
  });

  it("não expõe a mensagem interna quando a gravação falha", async () => {
    vi.mocked(leadService.updateLead).mockRejectedValue(
      new Error("deadlock detected"),
    );
    const response = await alterar(
      req(`/api/leads/${leadId}`, "PATCH", { stage: "WON" }),
      ctx(),
    );
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Não foi possível alterar o contato.",
    });
  });
});

describe("Exclusão de um contato", () => {
  it("exige sessão", async () => {
    const response = await excluir(
      req(`/api/leads/${leadId}`, "DELETE", undefined, { autenticado: false }),
      ctx(),
    );
    expect(response.status).toBe(401);
    expect(leadService.deleteLead).not.toHaveBeenCalled();
  });

  it("recusa o corretor, que não tem permissão para excluir", async () => {
    const response = await excluir(req(`/api/leads/${leadId}`, "DELETE"), ctx());
    expect(response.status).toBe(403);
    expect(leadService.deleteLead).not.toHaveBeenCalled();
  });

  it("o gestor exclui um contato da imobiliária da sessão", async () => {
    usuario = gestor;
    const response = await excluir(req(`/api/leads/${leadId}`, "DELETE"), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(leadService.deleteLead).toHaveBeenCalledWith(
      SEED_TENANTS[0].id,
      leadId,
      gestor.role,
    );
  });

  it("recusa requisição vinda de outra origem", async () => {
    usuario = gestor;
    const response = await excluir(
      req(`/api/leads/${leadId}`, "DELETE", undefined, {
        origem: "https://outro-site.example",
      }),
      ctx(),
    );
    expect(response.status).toBe(403);
    expect(leadService.deleteLead).not.toHaveBeenCalled();
  });

  it("responde 404 para identificador inválido ou contato inexistente", async () => {
    usuario = gestor;
    const invalido = await excluir(req("/api/leads/abc", "DELETE"), ctx("abc"));
    expect(invalido.status).toBe(404);
    expect(leadService.deleteLead).not.toHaveBeenCalled();

    vi.mocked(leadService.deleteLead).mockResolvedValue(false);
    const inexistente = await excluir(
      req(`/api/leads/${leadId}`, "DELETE"),
      ctx(),
    );
    expect(inexistente.status).toBe(404);
  });

  it("não expõe a mensagem interna quando a exclusão falha", async () => {
    usuario = gestor;
    vi.mocked(leadService.deleteLead).mockRejectedValue(
      new Error("violates foreign key constraint"),
    );
    const response = await excluir(req(`/api/leads/${leadId}`, "DELETE"), ctx());
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Não foi possível excluir o contato.",
    });
  });
});

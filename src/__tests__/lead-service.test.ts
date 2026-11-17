import { beforeEach, describe, expect, it, vi } from "vitest";
import { leadService } from "@/server/services/lead.service";
import { getDb } from "@/server/repositories/memory-store";
import { hasPermission } from "@/lib/auth/rbac";
import {
  LEAD_STAGES,
  LEAD_STAGE_LABELS,
  isLeadStage,
} from "@/lib/lead-stages";
import {
  SEED_AUDIT_LOGS,
  SEED_LEADS,
  SEED_PROPERTIES,
  SEED_TENANTS,
  SEED_USERS,
} from "@/server/seeds/seed-jaragua";
import type { Lead } from "@/types/domain";

vi.mock("@/server/repositories/memory-store", () => ({ getDb: vi.fn() }));

const TENANT_ID = SEED_TENANTS[0].id;
const OUTRA_IMOBILIARIA = "99999999-9999-4999-8999-999999999999";
const ANTIGO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const RECENTE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DE_OUTRA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const INEXISTENTE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const contato = (extra: Partial<Lead>): Lead => ({
  ...structuredClone(SEED_LEADS[0]),
  ...extra,
});

let leads: Lead[];

beforeEach(() => {
  vi.clearAllMocks();
  leads = [
    contato({
      id: ANTIGO,
      name: "Antigo",
      stage: "NEW",
      aiScore: 40,
      aiTemperature: "COLD",
      naturalSearchDesire: "Quero um imóvel.",
      createdAt: "2026-11-01T10:00:00.000Z",
      updatedAt: "2026-11-01T10:00:00.000Z",
    }),
    contato({
      id: RECENTE,
      name: "Recente",
      stage: "QUALIFYING",
      createdAt: "2026-11-10T10:00:00.000Z",
      updatedAt: "2026-11-10T10:00:00.000Z",
    }),
    contato({
      id: DE_OUTRA,
      tenantId: OUTRA_IMOBILIARIA,
      name: "De outra imobiliária",
      stage: "NEW",
    }),
  ];
  vi.mocked(getDb).mockReturnValue({
    tenants: structuredClone(SEED_TENANTS),
    users: structuredClone(SEED_USERS),
    properties: structuredClone(SEED_PROPERTIES),
    leads,
    auditLogs: structuredClone(SEED_AUDIT_LOGS),
    externalSources: [],
    externalListings: [],
  });
});

describe("Etapas do funil", () => {
  it("tem um rótulo para cada etapa, na ordem do quadro", () => {
    expect(LEAD_STAGES).toEqual([
      "NEW",
      "QUALIFYING",
      "VISIT_SCHEDULED",
      "PROPOSAL",
      "WON",
      "LOST",
    ]);
    for (const etapa of LEAD_STAGES)
      expect(LEAD_STAGE_LABELS[etapa]).toBeTruthy();
  });

  it("reconhece apenas etapas conhecidas", () => {
    expect(isLeadStage("PROPOSAL")).toBe(true);
    expect(isLeadStage("ARQUIVADO")).toBe(false);
    expect(isLeadStage(undefined)).toBe(false);
  });
});

describe("Permissões do quadro de contatos", () => {
  it("permite que corretor e gestor vejam e alterem contatos", () => {
    for (const papel of ["BROKER", "AGENCY_ADMIN", "SUPER_ADMIN"] as const) {
      expect(hasPermission(papel, "leads:view")).toBe(true);
      expect(hasPermission(papel, "leads:manage")).toBe(true);
    }
  });

  it("reserva a exclusão de contatos ao gestor", () => {
    expect(hasPermission("BROKER", "leads:delete")).toBe(false);
    expect(hasPermission("AGENCY_ADMIN", "leads:delete")).toBe(true);
    expect(hasPermission("SUPER_ADMIN", "leads:delete")).toBe(true);
  });
});

describe("Quadro de contatos", () => {
  it("lista só os contatos da imobiliária, do mais recente para o mais antigo", async () => {
    const lista = await leadService.listLeads(TENANT_ID, "BROKER");
    expect(lista.map((lead) => lead.name)).toEqual(["Recente", "Antigo"]);
  });

  it("move o contato de etapa e registra o momento da mudança", async () => {
    const movido = await leadService.updateLead({
      tenantId: TENANT_ID,
      leadId: ANTIGO,
      userRole: "BROKER",
      changes: { stage: "VISIT_SCHEDULED" },
    });
    expect(movido?.stage).toBe("VISIT_SCHEDULED");
    expect(movido?.updatedAt).not.toBe("2026-11-01T10:00:00.000Z");
    // Mudar só a etapa não mexe na pontuação.
    expect(movido?.aiScore).toBe(40);
  });

  it("altera nome, telefone e e-mail sem recalcular a pontuação", async () => {
    const alterado = await leadService.updateLead({
      tenantId: TENANT_ID,
      leadId: ANTIGO,
      userRole: "BROKER",
      changes: {
        name: "Antigo Corrigido",
        phone: "(47) 98888-7777",
        email: "",
      },
    });
    expect(alterado).toMatchObject({
      name: "Antigo Corrigido",
      phone: "(47) 98888-7777",
      email: "",
      aiScore: 40,
      aiTemperature: "COLD",
      naturalSearchDesire: "Quero um imóvel.",
    });
  });

  it("recalcula pontuação e perfil quando o pedido do contato muda", async () => {
    const pedido =
      "Urgente: apartamento no Czerniewicz com 3 quartos até 800 mil.";
    const alterado = await leadService.updateLead({
      tenantId: TENANT_ID,
      leadId: ANTIGO,
      userRole: "BROKER",
      changes: { naturalSearchDesire: pedido },
    });
    expect(alterado?.naturalSearchDesire).toBe(pedido);
    expect(alterado?.aiScore).toBeGreaterThan(40);
    expect(alterado?.budgetMax).toBe(800000);
    expect(alterado?.aiExtractedProfile.preferredNeighborhoods).toContain(
      "Czerniewicz",
    );
    expect(alterado?.aiExtractedProfile.urgencyLevel).toBe("IMMEDIATE");
  });

  it("não recalcula quando o pedido enviado é igual ao atual", async () => {
    const alterado = await leadService.updateLead({
      tenantId: TENANT_ID,
      leadId: ANTIGO,
      userRole: "BROKER",
      changes: { naturalSearchDesire: "Quero um imóvel." },
    });
    expect(alterado?.aiScore).toBe(40);
  });

  it("não altera um contato de outra imobiliária", async () => {
    await expect(
      leadService.updateLead({
        tenantId: TENANT_ID,
        leadId: DE_OUTRA,
        userRole: "AGENCY_ADMIN",
        changes: { stage: "WON" },
      }),
    ).resolves.toBeNull();
    await expect(
      leadService.updateLead({
        tenantId: TENANT_ID,
        leadId: DE_OUTRA,
        userRole: "AGENCY_ADMIN",
        changes: { naturalSearchDesire: "Casa no Centro" },
      }),
    ).resolves.toBeNull();
    expect(leads[2]).toMatchObject({ stage: "NEW", name: "De outra imobiliária" });
  });

  it("devolve nulo quando o contato não existe", async () => {
    await expect(
      leadService.updateLead({
        tenantId: TENANT_ID,
        leadId: INEXISTENTE,
        userRole: "BROKER",
        changes: { stage: "LOST" },
      }),
    ).resolves.toBeNull();
  });

  it("ignora campos que a edição não pode alterar", async () => {
    const alterado = await leadService.updateLead({
      tenantId: TENANT_ID,
      leadId: ANTIGO,
      userRole: "BROKER",
      changes: {
        name: "Outro nome",
        tenantId: OUTRA_IMOBILIARIA,
        id: INEXISTENTE,
      } as never,
    });
    expect(alterado).toMatchObject({ id: ANTIGO, tenantId: TENANT_ID });
  });
});

describe("Exclusão de contatos", () => {
  it("o gestor exclui um contato da própria imobiliária", async () => {
    await expect(
      leadService.deleteLead(TENANT_ID, ANTIGO, "AGENCY_ADMIN"),
    ).resolves.toBe(true);
    const lista = await leadService.listLeads(TENANT_ID, "AGENCY_ADMIN");
    expect(lista.map((lead) => lead.id)).toEqual([RECENTE]);
  });

  it("o corretor não pode excluir", async () => {
    await expect(
      leadService.deleteLead(TENANT_ID, ANTIGO, "BROKER"),
    ).rejects.toThrow("leads:delete");
    expect(leads).toHaveLength(3);
  });

  it("não exclui contato de outra imobiliária nem inexistente", async () => {
    await expect(
      leadService.deleteLead(TENANT_ID, DE_OUTRA, "AGENCY_ADMIN"),
    ).resolves.toBe(false);
    await expect(
      leadService.deleteLead(TENANT_ID, INEXISTENTE, "AGENCY_ADMIN"),
    ).resolves.toBe(false);
    expect(leads).toHaveLength(3);
  });
});

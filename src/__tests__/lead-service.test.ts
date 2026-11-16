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

describe("Quadro de contatos", () => {
  it("permite que corretor e gestor vejam e movam contatos", () => {
    for (const papel of ["BROKER", "AGENCY_ADMIN", "SUPER_ADMIN"] as const) {
      expect(hasPermission(papel, "leads:view")).toBe(true);
      expect(hasPermission(papel, "leads:manage")).toBe(true);
    }
  });

  it("lista só os contatos da imobiliária, do mais recente para o mais antigo", async () => {
    const lista = await leadService.listLeads(TENANT_ID, "BROKER");
    expect(lista.map((lead) => lead.name)).toEqual(["Recente", "Antigo"]);
  });

  it("move o contato de etapa e registra o momento da mudança", async () => {
    const movido = await leadService.moveLead({
      tenantId: TENANT_ID,
      leadId: ANTIGO,
      userRole: "BROKER",
      stage: "VISIT_SCHEDULED",
    });
    expect(movido?.stage).toBe("VISIT_SCHEDULED");
    expect(movido?.updatedAt).not.toBe("2026-11-01T10:00:00.000Z");
    const lista = await leadService.listLeads(TENANT_ID, "BROKER");
    expect(lista.find((lead) => lead.id === ANTIGO)?.stage).toBe(
      "VISIT_SCHEDULED",
    );
  });

  it("não move um contato de outra imobiliária", async () => {
    const movido = await leadService.moveLead({
      tenantId: TENANT_ID,
      leadId: DE_OUTRA,
      userRole: "AGENCY_ADMIN",
      stage: "WON",
    });
    expect(movido).toBeNull();
    expect(leads[2].stage).toBe("NEW");
  });

  it("devolve nulo quando o contato não existe", async () => {
    await expect(
      leadService.moveLead({
        tenantId: TENANT_ID,
        leadId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        userRole: "BROKER",
        stage: "LOST",
      }),
    ).resolves.toBeNull();
  });
});

import type { Lead, LeadStage, UserRole } from "@/types/domain";
import { assertPermission } from "@/lib/auth/rbac";
import { leadRepository } from "@/server/repositories/lead.repository";

export interface MoveLeadInput {
  tenantId: string;
  leadId: string;
  userRole: UserRole;
  stage: LeadStage;
}

/** Regras do quadro de contatos: quem pode ver e quem pode mover de etapa. */
export class LeadService {
  async listLeads(tenantId: string, userRole: UserRole): Promise<Lead[]> {
    assertPermission(userRole, "leads:view");
    return leadRepository.findAllByTenant(tenantId);
  }

  /** Devolve o contato atualizado, ou null se ele não existe nesta imobiliária. */
  async moveLead(input: MoveLeadInput): Promise<Lead | null> {
    assertPermission(input.userRole, "leads:manage");
    return leadRepository.updateStage(
      input.tenantId,
      input.leadId,
      input.stage,
    );
  }
}

export const leadService = new LeadService();

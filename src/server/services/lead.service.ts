import type { Lead, LeadStage, UserRole } from "@/types/domain";
import { assertPermission } from "@/lib/auth/rbac";
import {
  leadRepository,
  type LeadUpdates,
} from "@/server/repositories/lead.repository";
import { leadQualificationService } from "./lead-qualification.service";

/** O que o usuário pode alterar em um contato pelo quadro. */
export interface LeadChanges {
  name?: string;
  phone?: string;
  email?: string;
  naturalSearchDesire?: string;
  stage?: LeadStage;
}

export interface UpdateLeadInput {
  tenantId: string;
  leadId: string;
  userRole: UserRole;
  changes: LeadChanges;
}

/** Regras do quadro de contatos: quem pode ver, alterar e excluir. */
export class LeadService {
  async listLeads(tenantId: string, userRole: UserRole): Promise<Lead[]> {
    assertPermission(userRole, "leads:view");
    return leadRepository.findAllByTenant(tenantId);
  }

  /**
   * Altera dados ou etapa de um contato. Quando o pedido do contato muda, a
   * pontuação e o perfil são recalculados, para não ficarem falando de um
   * texto que não existe mais.
   * Devolve o contato atualizado, ou null se ele não existe nesta imobiliária.
   */
  async updateLead(input: UpdateLeadInput): Promise<Lead | null> {
    assertPermission(input.userRole, "leads:manage");
    const { tenantId, leadId, changes } = input;
    const updates: LeadUpdates = { ...changes };

    if (changes.naturalSearchDesire !== undefined) {
      const atual = await leadRepository.findById(tenantId, leadId);
      if (!atual) return null;
      if (changes.naturalSearchDesire !== atual.naturalSearchDesire) {
        const qualificacao = await leadQualificationService.qualifyLeadDesire(
          tenantId,
          changes.name ?? atual.name,
          changes.naturalSearchDesire,
        );
        updates.aiScore = qualificacao.aiScore;
        updates.aiTemperature = qualificacao.aiTemperature;
        updates.aiExtractedProfile = qualificacao.profile;
        updates.budgetMin = qualificacao.budgetMin;
        updates.budgetMax = qualificacao.budgetMax;
      }
    }

    return leadRepository.update(tenantId, leadId, updates);
  }

  /** Devolve false se o contato não existe nesta imobiliária. */
  async deleteLead(
    tenantId: string,
    leadId: string,
    userRole: UserRole,
  ): Promise<boolean> {
    assertPermission(userRole, "leads:delete");
    return leadRepository.delete(tenantId, leadId);
  }
}

export const leadService = new LeadService();

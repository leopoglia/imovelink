import {
  AIExtractedLeadProfile,
  HybridSearchResultItem,
  Lead,
  LeadChannel,
  LeadStage,
  LeadTemperature,
} from "@/types/domain";
import { normalizarTexto } from "@/lib/geo";
import { leadRepository } from "@/server/repositories/lead.repository";
import { aiSearchService } from "./ai-search.service";

export interface CreateAndQualifyLeadInput {
  tenantId: string;
  assignedBrokerId: string;
  assignedBrokerName: string;
  name: string;
  email: string;
  phone: string;
  originChannel: LeadChannel;
  naturalSearchDesire: string;
  budgetMin?: number;
  budgetMax?: number;
  stage?: LeadStage;
}

export interface LeadWithMatchedProperties {
  lead: Lead;
  matchedProperties: HybridSearchResultItem[];
}

export class LeadQualificationService {
  /**
   * Qualifica o lead pontuando urgência, orçamento e compatibilidade com o estoque
   */
  async qualifyLeadDesire(
    tenantId: string,
    name: string,
    naturalSearchDesire: string,
    explicitBudgetMax?: number,
  ): Promise<{
    aiScore: number;
    aiTemperature: LeadTemperature;
    budgetMin: number;
    budgetMax: number;
    profile: AIExtractedLeadProfile;
    topMatches: HybridSearchResultItem[];
  }> {
    const filtros = aiSearchService.extractStructuredQuery(naturalSearchDesire);
    const resultadoBusca = await aiSearchService.searchHybrid(
      tenantId,
      naturalSearchDesire,
      false,
    );
    const topMatches = resultadoBusca.results.slice(0, 3);

    const texto = normalizarTexto(naturalSearchDesire);
    const fatores: string[] = [];
    let score = 50;

    const tetoOrcamento = explicitBudgetMax || filtros.maxPrice || 750000;
    const pisoOrcamento = Math.round(tetoOrcamento * 0.8);

    // 1. Orçamento definido (+20)
    if (filtros.maxPrice || explicitBudgetMax) {
      score += 20;
      fatores.push(
        `Orçamento definido (R$ ${tetoOrcamento.toLocaleString("pt-BR")})`,
      );
    }

    // 2. Bairro específico (+15)
    if (filtros.neighborhoods.length > 0) {
      score += 15;
      fatores.push(`Região de interesse: ${filtros.neighborhoods.join(", ")}`);
    }

    // 3. Match com imóvel no portfólio (+15)
    if (topMatches[0] && topMatches[0].hybridScore >= 75) {
      score += 15;
      fatores.push(
        `Imóvel compatível em estoque (${topMatches[0].property.code})`,
      );
    }

    // 4. Urgência
    let urgencia: AIExtractedLeadProfile["urgencyLevel"] = "SHORT_TERM";
    if (/\b(urgente|imediato|logo|mudar|essa semana)\b/.test(texto)) {
      urgencia = "IMMEDIATE";
      score += 10;
      fatores.push("Urgência na compra / mudança");
    }

    let decisor = `${name}`;
    if (/\b(esposa|marido|casal|filhos|familia)\b/.test(texto)) {
      decisor = `Família (${name} e cônjuge)`;
    }

    const precisaFinanciamento =
      /\b(financiamento|fgts|banco|caixa|parcela)\b/.test(texto);

    const scoreFinal = Math.min(98, Math.max(30, score));
    const temperatura: LeadTemperature =
      scoreFinal >= 80 ? "HOT" : scoreFinal >= 55 ? "WARM" : "COLD";

    const primeiroNome = name.split(" ")[0];
    const imovelSugerido = topMatches[0]
      ? `o imóvel ${topMatches[0].property.code} (${topMatches[0].property.title}) no bairro ${topMatches[0].property.addressNeighborhood}`
      : "opções selecionadas em nosso catálogo";

    const recommendedWhatsAppPitch = `Olá ${primeiroNome}, tudo bem? Aqui é da imobiliária! Vi seu interesse por ${filtros.intentSummary} e separei ${imovelSugerido}. Gostaria de agendar uma visita sem compromisso?`;

    const profile: AIExtractedLeadProfile = {
      summary: `Lead ${temperatura === "HOT" ? "Prioritário" : "Qualificado"} buscando ${filtros.propertyTypes.join("/") || "imóvel"} em ${filtros.neighborhoods.join(", ") || "Jaraguá do Sul"} até R$ ${tetoOrcamento.toLocaleString("pt-BR")}.`,
      preferredTypes:
        filtros.propertyTypes.length > 0
          ? filtros.propertyTypes
          : ["HOUSE", "APARTMENT"],
      preferredNeighborhoods: filtros.neighborhoods,
      mustHaveAmenities: filtros.mustHaveAmenities,
      minBedrooms: filtros.minBedrooms ?? 2,
      urgencyLevel: urgencia,
      decisionMaker: decisor,
      financingNeed: precisaFinanciamento,
      recommendedWhatsAppPitch,
      scoringRationale: fatores,
    };

    return {
      aiScore: scoreFinal,
      aiTemperature: temperatura,
      budgetMin: pisoOrcamento,
      budgetMax: tetoOrcamento,
      profile,
      topMatches,
    };
  }

  async createAndQualifyLead(
    input: CreateAndQualifyLeadInput,
  ): Promise<LeadWithMatchedProperties> {
    const qual = await this.qualifyLeadDesire(
      input.tenantId,
      input.name,
      input.naturalSearchDesire,
      input.budgetMax,
    );

    const now = new Date().toISOString();
    const newLead: Lead = {
      id: crypto.randomUUID(),
      tenantId: input.tenantId,
      assignedBrokerId: input.assignedBrokerId,
      assignedBrokerName: input.assignedBrokerName,
      name: input.name,
      email: input.email,
      phone: input.phone,
      originChannel: input.originChannel,
      stage: input.stage ?? "NEW",
      aiScore: qual.aiScore,
      aiTemperature: qual.aiTemperature,
      naturalSearchDesire: input.naturalSearchDesire,
      aiExtractedProfile: qual.profile,
      budgetMin: input.budgetMin ?? qual.budgetMin,
      budgetMax: qual.budgetMax,
      lgpdConsent: true,
      lastContactAt: now,
      createdAt: now,
      updatedAt: now,
    };

    await leadRepository.create(newLead);

    return {
      lead: newLead,
      matchedProperties: qual.topMatches,
    };
  }
}

export const leadQualificationService = new LeadQualificationService();

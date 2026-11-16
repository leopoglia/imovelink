import type { LeadStage } from "@/types/domain";

/** Etapas do funil, na ordem em que aparecem no quadro. */
export const LEAD_STAGES: readonly LeadStage[] = [
  "NEW",
  "QUALIFYING",
  "VISIT_SCHEDULED",
  "PROPOSAL",
  "WON",
  "LOST",
];

export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  NEW: "Novo",
  QUALIFYING: "Em contato",
  VISIT_SCHEDULED: "Visita agendada",
  PROPOSAL: "Proposta",
  WON: "Fechado",
  LOST: "Perdido",
};

export function isLeadStage(value: unknown): value is LeadStage {
  return (
    typeof value === "string" && LEAD_STAGES.includes(value as LeadStage)
  );
}

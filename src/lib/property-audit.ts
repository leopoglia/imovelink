import type { AuditAction, Property, PropertyAuditLog } from "@/types/domain";

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  CREATED: "Cadastro",
  PRICE_UPDATED: "Preço alterado",
  STATUS_CHANGED: "Status alterado",
  EDITED: "Edição",
  DELETED: "Exclusão",
};

const STATUS_LABELS: Record<Property["status"], string> = {
  AVAILABLE: "Disponível",
  RESERVED: "Reservado",
  SOLD: "Vendido",
  INACTIVE: "Inativo",
};

// These are the fields captured in the existing audit snapshots.
const AUDIT_FIELDS = [
  ["price", "Preço"],
  ["status", "Status"],
  ["title", "Título"],
  ["addressNeighborhood", "Bairro"],
] as const;

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

function formatValue(field: string, value: unknown): string {
  if (value === undefined) return "Não registrado";
  if (value === null || value === "") return "Não informado";
  if (field === "price" && typeof value === "number")
    return currency.format(value);
  if (field === "status")
    return STATUS_LABELS[value as Property["status"]] ?? String(value);
  return String(value);
}

interface AuditChange {
  field: string;
  label: string;
  before: string | null;
  after: string | null;
}

export function getAuditChanges(log: PropertyAuditLog): AuditChange[] {
  return AUDIT_FIELDS.flatMap<AuditChange>(([field, label]) => {
    const before = log.beforeState?.[field];
    const after = log.afterState?.[field];
    if (before === undefined && after === undefined) return [];
    if (log.action === "CREATED") {
      return after === undefined
        ? []
        : [{ field, label, before: null, after: formatValue(field, after) }];
    }
    if (log.action === "DELETED") {
      return before === undefined
        ? []
        : [{ field, label, before: formatValue(field, before), after: null }];
    }
    if (before === after) return [];
    return [
      {
        field,
        label,
        before: formatValue(field, before),
        after: formatValue(field, after),
      },
    ];
  });
}

export function formatAuditDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    return { date: "Data não registrada", time: "" };
  return {
    date: date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }),
    time: date.toLocaleTimeString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

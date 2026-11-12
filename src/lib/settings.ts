import { AccountSettings } from "@/types/domain";
import { apiFetch } from "./api";

export const settingsQueryKey = (tenantId: string, userId: string) =>
  ["settings", tenantId, userId] as const;

/**
 * A identidade vem da sessão no servidor; a chave de cache ainda usa
 * imobiliária e usuário para separar os dados de cada um no navegador.
 */
export async function fetchSettings(): Promise<AccountSettings> {
  const response = await apiFetch("/api/settings", { cache: "no-store" });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      data.error ?? "Não foi possível carregar as configurações.",
    );
  return data;
}

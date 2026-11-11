import { AccountSettings } from "@/types/domain";
import { apiFetch } from "./api";

export const settingsQueryKey = (tenantId: string, userId: string) =>
  ["settings", tenantId, userId] as const;

export async function fetchSettings(
  tenantId: string,
  userId: string,
): Promise<AccountSettings> {
  const response = await apiFetch("/api/settings", { cache: "no-store" });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      data.error ?? "Não foi possível carregar as configurações.",
    );
  return data;
}

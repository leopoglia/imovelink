import { z } from "zod";
import { hasPermission } from "@/lib/auth/rbac";
import { tenantRepository } from "@/server/repositories/tenant.repository";
import { AccountSettings } from "@/types/domain";

const name = z
  .string()
  .trim()
  .min(2, "Informe um nome com pelo menos 2 caracteres.")
  .max(120, "O nome deve ter até 120 caracteres.");
const email = z
  .string()
  .trim()
  .email("Informe um e-mail válido.")
  .max(254)
  .transform((value) => value.toLowerCase());
const phone = z
  .string()
  .trim()
  .max(30, "O telefone deve ter até 30 caracteres.");
const creci = z.string().trim().max(40, "O CRECI deve ter até 40 caracteres.");
const identity = { userId: z.string().min(1), tenantId: z.string().min(1) };

const updateSchema = z.discriminatedUnion("section", [
  z
    .object({
      ...identity,
      section: z.literal("profile"),
      values: z.object({ name, email, phone, creci }).strict(),
    })
    .strict(),
  z
    .object({
      ...identity,
      section: z.literal("agency"),
      values: z
        .object({
          name,
          creci,
          city: z.string().trim().min(2, "Informe a cidade.").max(100),
          state: z.enum(
            [
              "AC",
              "AL",
              "AP",
              "AM",
              "BA",
              "CE",
              "DF",
              "ES",
              "GO",
              "MA",
              "MT",
              "MS",
              "MG",
              "PA",
              "PB",
              "PR",
              "PE",
              "PI",
              "RJ",
              "RN",
              "RS",
              "RO",
              "RR",
              "SC",
              "SP",
              "SE",
              "TO",
            ],
            { errorMap: () => ({ message: "Selecione um estado válido." }) },
          ),
          phone,
          email,
          address: z
            .string()
            .trim()
            .max(240, "O endereço deve ter até 240 caracteres."),
        })
        .strict(),
    })
    .strict(),
]);

export class SettingsError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export const settingsService = {
  async getSettings(
    userId: string,
    tenantId: string,
  ): Promise<AccountSettings> {
    const user = await tenantRepository.findUserById(userId);
    if (
      !user ||
      !user.active ||
      (user.tenantId !== tenantId && user.role !== "SUPER_ADMIN")
    ) {
      throw new SettingsError("Não foi possível acessar este perfil.", 403);
    }
    const tenant = await tenantRepository.findTenantById(tenantId);
    if (!tenant) throw new SettingsError("Imobiliária não encontrada.", 404);
    return { user, tenant };
  },

  async updateSettings(input: unknown): Promise<AccountSettings> {
    const payload = updateSchema.parse(input);
    const { user, tenant } = await this.getSettings(
      payload.userId,
      payload.tenantId,
    );

    if (payload.section === "profile") {
      const existing = await tenantRepository.findUserByEmail(
        payload.values.email,
      );
      if (existing && existing.id !== user.id) {
        throw new SettingsError("Este e-mail já está em uso.", 409);
      }
      const updated = await tenantRepository.updateUser(
        user.id,
        payload.values,
      );
      if (!updated) throw new SettingsError("Perfil não encontrado.", 404);
      return { user: updated, tenant };
    }

    if (!hasPermission(user.role, "whitelabel:configure")) {
      throw new SettingsError(
        "Apenas gestores podem alterar os dados da imobiliária.",
        403,
      );
    }
    const { name, creci, city, state, phone, email, address } = payload.values;
    const updated = await tenantRepository.updateTenant(tenant.id, {
      name,
      creci,
      city,
      state,
      branding: { ...tenant.branding, phone, email, address },
    });
    if (!updated) throw new SettingsError("Imobiliária não encontrada.", 404);
    return { user, tenant: updated };
  },
};

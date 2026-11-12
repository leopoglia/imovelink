"use client";
import { apiFetch } from "@/lib/api";

import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { hasPermission, getRoleLabel } from "@/lib/auth/rbac";
import { fetchSettings, settingsQueryKey } from "@/lib/settings";
import { useTenantStore } from "@/store/tenant-store";
import { AccountSettings } from "@/types/domain";
import { Select } from "@/components/ui/select";

type Section = "profile" | "agency";
type FormValues = Record<string, string>;
type Field = {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  maxLength: number;
  autoComplete?: string;
  full?: boolean;
};
const STATES = [
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
];
const PROFILE_FIELDS: Field[] = [
  {
    name: "name",
    label: "Nome",
    required: true,
    maxLength: 120,
    autoComplete: "name",
  },
  {
    name: "email",
    label: "E-mail",
    type: "email",
    required: true,
    maxLength: 254,
    autoComplete: "email",
  },
  {
    name: "phone",
    label: "Telefone",
    type: "tel",
    maxLength: 30,
    autoComplete: "tel",
  },
  { name: "creci", label: "CRECI", maxLength: 40 },
];
const AGENCY_FIELDS: Field[] = [
  {
    name: "name",
    label: "Nome da imobiliária",
    required: true,
    maxLength: 120,
    autoComplete: "organization",
    full: true,
  },
  { name: "creci", label: "CRECI", maxLength: 40 },
  {
    name: "phone",
    label: "Telefone",
    type: "tel",
    maxLength: 30,
    autoComplete: "tel",
  },
  {
    name: "email",
    label: "E-mail de contato",
    type: "email",
    required: true,
    maxLength: 254,
    autoComplete: "email",
    full: true,
  },
  {
    name: "address",
    label: "Endereço",
    maxLength: 240,
    autoComplete: "street-address",
    full: true,
  },
  {
    name: "city",
    label: "Cidade",
    required: true,
    maxLength: 100,
    autoComplete: "address-level2",
  },
  {
    name: "state",
    label: "Estado",
    required: true,
    maxLength: 2,
    autoComplete: "address-level1",
  },
];

function getFormValues(
  section: Section,
  { user, tenant }: AccountSettings,
): FormValues {
  return section === "profile"
    ? {
        name: user.name,
        email: user.email,
        phone: user.phone,
        creci: user.creci,
      }
    : {
        name: tenant.name,
        creci: tenant.creci,
        phone: tenant.branding.phone,
        email: tenant.branding.email,
        address: tenant.branding.address,
        city: tenant.city,
        state: tenant.state,
      };
}

function SettingsForm({
  section,
  data,
}: {
  section: Section;
  data: AccountSettings;
}) {
  const queryClient = useQueryClient();
  const syncSession = useTenantStore((state) => state.syncSession);
  const [values, setValues] = useState(() => getFormValues(section, data));
  const canEdit =
    section === "profile" ||
    hasPermission(data.user.role, "whitelabel:configure");
  const dirty =
    JSON.stringify(values) !== JSON.stringify(getFormValues(section, data));
  const fields = section === "profile" ? PROFILE_FIELDS : AGENCY_FIELDS;

  const mutation = useMutation({
    mutationFn: async (): Promise<AccountSettings> => {
      const response = await apiFetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section,
          values,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error ?? "Não foi possível salvar as alterações.",
        );
      return result;
    },
    onSuccess: (result) => {
      setValues(getFormValues(section, result));
      syncSession(result.user, result.tenant);
      queryClient.setQueryData(
        settingsQueryKey(result.tenant.id, result.user.id),
        result,
      );
    },
  });

  return (
    <form
      className="settings-form"
      aria-label={
        section === "profile" ? "Dados do perfil" : "Dados da imobiliária"
      }
      onSubmit={(event) => {
        event.preventDefault();
        if (canEdit && dirty && !mutation.isPending) mutation.mutate();
      }}
    >
      <fieldset className="settings-fields" disabled={mutation.isPending}>
        {fields.map((field) => (
          <div
            key={field.name}
            className={`settings-field${field.full ? " settings-field-full" : ""}`}
          >
            <label htmlFor={`${section}-${field.name}`}>{field.label}</label>
            {field.name === "state" ? (
              <Select
                id={`${section}-${field.name}`}
                autoComplete={field.autoComplete}
                value={values[field.name]}
                disabled={!canEdit}
                required
                onValueChange={(value) => {
                  setValues({ ...values, [field.name]: value });
                  mutation.reset();
                }}
                name={field.name}
                options={STATES.map((state) => ({
                  value: state,
                  label: state,
                }))}
              />
            ) : (
              <input
                id={`${section}-${field.name}`}
                name={field.name}
                type={field.type ?? "text"}
                autoComplete={field.autoComplete}
                required={field.required}
                minLength={
                  field.name === "name" || field.name === "city" ? 2 : undefined
                }
                maxLength={field.maxLength}
                readOnly={!canEdit}
                value={values[field.name]}
                onChange={(event) => {
                  setValues({ ...values, [field.name]: event.target.value });
                  mutation.reset();
                }}
                className="field-control"
              />
            )}
          </div>
        ))}
      </fieldset>
      {section === "profile" && (
        <p className="settings-role">Perfil: {getRoleLabel(data.user.role)}</p>
      )}
      {!canEdit && (
        <p className="settings-role">
          Somente gestores podem editar estes dados.
        </p>
      )}
      {canEdit && (
        <div className="settings-form-footer">
          <div
            className={`settings-message${mutation.isError ? " is-error" : ""}`}
            role={mutation.isError ? "alert" : "status"}
          >
            {mutation.isError
              ? mutation.error.message
              : mutation.isSuccess
                ? "Alterações salvas."
                : ""}
          </div>
          <div className="settings-actions">
            <button
              type="button"
              className="button-secondary"
              disabled={!dirty || mutation.isPending}
              onClick={() => {
                setValues(getFormValues(section, data));
                mutation.reset();
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="button-primary"
              disabled={!dirty || mutation.isPending}
            >
              {mutation.isPending ? "Salvando…" : "Salvar alterações"}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}

export default function ConfiguracoesPage() {
  const { currentUser, currentTenant, isAuthenticated } = useTenantStore();
  const [section, setSection] = useState<Section>("profile");
  const query = useQuery({
    queryKey: settingsQueryKey(currentTenant.id, currentUser.id),
    queryFn: () => fetchSettings(),
    enabled: isAuthenticated,
    retry: false,
  });

  return (
    <div className="settings-page">
      <div className="page-heading">
        <h1>Configurações</h1>
      </div>
      <nav className="settings-tabs" aria-label="Seções de configurações">
        <button
          type="button"
          className={section === "profile" ? "is-active" : ""}
          aria-pressed={section === "profile"}
          onClick={() => setSection("profile")}
        >
          Meu perfil
        </button>
        <button
          type="button"
          className={section === "agency" ? "is-active" : ""}
          aria-pressed={section === "agency"}
          onClick={() => setSection("agency")}
        >
          Imobiliária
        </button>
      </nav>
      {query.isPending ? (
        <p className="settings-role" role="status">
          Carregando configurações…
        </p>
      ) : query.isError ? (
        <div className="settings-load-error">
          <p role="alert">{query.error.message}</p>
          <button
            type="button"
            className="button-secondary"
            onClick={() => query.refetch()}
          >
            Tentar novamente
          </button>
        </div>
      ) : (
        <SettingsForm
          key={`${section}-${query.data.user.id}-${query.data.tenant.id}`}
          section={section}
          data={query.data}
        />
      )}
    </div>
  );
}

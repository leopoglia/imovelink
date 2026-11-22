"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, OpenNewWindow } from "iconoir-react";
import { apiFetch } from "@/lib/api";
import { hasPermission } from "@/lib/auth/rbac";
import { fetchSettings, settingsQueryKey } from "@/lib/settings";
import {
  conteudoDaVitrine,
  podeAparecerNaVitrine,
  type ConteudoDaVitrine,
} from "@/lib/vitrine";
import { useTenantStore } from "@/store/tenant-store";
import type { AccountSettings, Property } from "@/types/domain";

function preco(valor: number) {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

/** Esconder e mostrar de novo o mesmo imóvel não conta como alteração. */
function chaveDoConteudo(valores: ConteudoDaVitrine) {
  return JSON.stringify({
    ...valores,
    hiddenPropertyIds: [...valores.hiddenPropertyIds].sort((a, b) =>
      a.localeCompare(b),
    ),
  });
}

function AcoesDaVitrine({ slug }: { slug: string }) {
  const caminho = `/vitrine/${slug}`;
  const [copiado, setCopiado] = useState(false);

  return (
    <div className="vitrine-editor-acoes">
      <button
        type="button"
        className="button-secondary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(
              `${window.location.origin}${caminho}`,
            );
            setCopiado(true);
            window.setTimeout(() => setCopiado(false), 2000);
          } catch {
            setCopiado(false);
          }
        }}
      >
        <Copy aria-hidden="true" width={16} height={16} />
        {copiado ? "Link copiado" : "Copiar link"}
      </button>
      <a
        href={caminho}
        target="_blank"
        rel="noopener noreferrer"
        className="button-primary"
      >
        <OpenNewWindow aria-hidden="true" width={16} height={16} />
        Abrir vitrine
      </a>
    </div>
  );
}

function EditorDaVitrine({
  data,
  imoveis,
}: {
  data: AccountSettings;
  imoveis: Property[];
}) {
  const queryClient = useQueryClient();
  const syncSession = useTenantStore((state) => state.syncSession);
  const inicial = useMemo(() => conteudoDaVitrine(data.tenant), [data.tenant]);
  const [valores, setValores] = useState(inicial);
  const canEdit = hasPermission(data.user.role, "whitelabel:configure");
  const dirty = chaveDoConteudo(valores) !== chaveDoConteudo(inicial);
  const publicaveis = imoveis.filter(podeAparecerNaVitrine);
  const escondidos = new Set(valores.hiddenPropertyIds);
  const aparecem = publicaveis.filter((imovel) => !escondidos.has(imovel.id));

  const mutation = useMutation({
    mutationFn: async (): Promise<AccountSettings> => {
      const response = await apiFetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: "vitrine", values: valores }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Não foi possível salvar a vitrine.");
      return result;
    },
    onSuccess: (result) => {
      setValores(conteudoDaVitrine(result.tenant));
      syncSession(result.user, result.tenant);
      queryClient.setQueryData(
        settingsQueryKey(result.tenant.id, result.user.id),
        result,
      );
    },
  });

  const alterar = <K extends keyof ConteudoDaVitrine>(
    campo: K,
    valor: ConteudoDaVitrine[K],
  ) => {
    setValores((atual) => ({ ...atual, [campo]: valor }));
    mutation.reset();
  };

  const alternarImovel = (id: string, mostrar: boolean) =>
    alterar(
      "hiddenPropertyIds",
      mostrar
        ? valores.hiddenPropertyIds.filter((item) => item !== id)
        : [...valores.hiddenPropertyIds, id],
    );

  return (
    <form
      className="vitrine-editor"
      aria-label="Conteúdo da vitrine"
      onSubmit={(event) => {
        event.preventDefault();
        if (canEdit && dirty && !mutation.isPending) mutation.mutate();
      }}
    >
      <fieldset
        className="vitrine-editor-campos"
        disabled={!canEdit || mutation.isPending}
      >
        <div className="vitrine-editor-bloco">
          <h2>Apresentação</h2>
          <div className="settings-field settings-field-full">
            <label htmlFor="vitrine-headline">Título</label>
            <input
              id="vitrine-headline"
              className="field-control"
              maxLength={90}
              placeholder={`Imóveis à venda em ${data.tenant.city}`}
              value={valores.headline}
              onChange={(e) => alterar("headline", e.target.value)}
            />
          </div>
          <div className="settings-field settings-field-full">
            <label htmlFor="vitrine-tagline">Subtítulo</label>
            <input
              id="vitrine-tagline"
              className="field-control"
              maxLength={160}
              value={valores.tagline}
              onChange={(e) => alterar("tagline", e.target.value)}
            />
          </div>
          <div className="settings-field settings-field-full">
            <label htmlFor="vitrine-about">Sobre a imobiliária</label>
            <textarea
              id="vitrine-about"
              className="field-control"
              rows={4}
              maxLength={800}
              placeholder="Conte há quanto tempo atuam, em que bairros e como atendem."
              value={valores.about}
              onChange={(e) => alterar("about", e.target.value)}
            />
          </div>
          <div className="settings-field settings-field-full">
            <label htmlFor="vitrine-capa">Link da foto de capa</label>
            <input
              id="vitrine-capa"
              type="url"
              className="field-control"
              maxLength={1000}
              placeholder="https://"
              value={valores.coverImageUrl}
              onChange={(e) => alterar("coverImageUrl", e.target.value)}
            />
            <p className="field-hint">
              Sem foto, a capa usa a cor da imobiliária.
            </p>
          </div>
        </div>

        <div className="vitrine-editor-bloco">
          <h2>Marca</h2>
          <div className="vitrine-editor-linha">
            <div className="settings-field">
              <label htmlFor="vitrine-sigla">Sigla</label>
              <input
                id="vitrine-sigla"
                className="field-control"
                maxLength={3}
                value={valores.logoText}
                onChange={(e) =>
                  alterar("logoText", e.target.value.toUpperCase())
                }
              />
            </div>
            <div className="settings-field">
              <label htmlFor="vitrine-cor">Cor principal</label>
              <div className="vitrine-editor-cor">
                <input
                  id="vitrine-cor"
                  type="color"
                  value={valores.primaryColor}
                  onChange={(e) =>
                    alterar("primaryColor", e.target.value.toUpperCase())
                  }
                />
                <span>{valores.primaryColor}</span>
              </div>
            </div>
          </div>
          <p className="field-hint">
            Telefone, e-mail e endereço ficam em{" "}
            <Link href="/configuracoes">Configurações</Link>.
          </p>
        </div>

        <div className="vitrine-editor-bloco">
          <div className="vitrine-editor-bloco-topo">
            <h2>Imóveis na vitrine</h2>
            <span>
              {aparecem.length} de {publicaveis.length} aparecem
            </span>
          </div>
          <p className="field-hint">
            Só imóveis disponíveis ou reservados podem aparecer. Vendidos e
            inativos saem sozinhos.
          </p>
          {publicaveis.length === 0 ? (
            <p className="settings-role">
              Nenhum imóvel disponível. Cadastre em{" "}
              <Link href="/imoveis">Imóveis</Link>.
            </p>
          ) : (
            <ul className="vitrine-editor-imoveis">
              {publicaveis.map((imovel) => {
                const mostrar = !escondidos.has(imovel.id);
                return (
                  <li key={imovel.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={mostrar}
                        onChange={(e) =>
                          alternarImovel(imovel.id, e.target.checked)
                        }
                      />
                      {imovel.images[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={imovel.images[0]} alt="" />
                      ) : (
                        <span className="vitrine-editor-sem-foto" />
                      )}
                      <span className="vitrine-editor-imovel-texto">
                        <strong>{imovel.title}</strong>
                        <span>
                          {imovel.code} · {imovel.addressNeighborhood} ·{" "}
                          {preco(imovel.price)}
                          {imovel.status === "RESERVED" && " · Reservado"}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </fieldset>


      {!canEdit && (
        <p className="settings-role">Somente gestores podem editar a vitrine.</p>
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
                ? "Vitrine atualizada."
                : ""}
          </div>
          <div className="settings-actions">
            <button
              type="button"
              className="button-secondary"
              disabled={!dirty || mutation.isPending}
              onClick={() => {
                setValores(inicial);
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
              {mutation.isPending ? "Salvando…" : "Salvar vitrine"}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}

export default function MinhaVitrinePage() {
  const { currentUser, currentTenant, isAuthenticated } = useTenantStore();
  const configuracoes = useQuery({
    queryKey: settingsQueryKey(currentTenant.id, currentUser.id),
    queryFn: () => fetchSettings(),
    enabled: isAuthenticated,
    retry: false,
  });
  const imoveis = useQuery<{ properties: Property[] }>({
    queryKey: ["properties", currentTenant.id, "vitrine"],
    queryFn: async () => {
      const res = await apiFetch("/api/properties");
      if (!res.ok) throw new Error("Não foi possível carregar os imóveis.");
      return res.json();
    },
    enabled: isAuthenticated,
  });
  const erro = configuracoes.error ?? imoveis.error;

  return (
    <div className="vitrine-editor-pagina">
      <div className="page-heading">
        <h1>Vitrine</h1>
        {currentTenant.slug && <AcoesDaVitrine slug={currentTenant.slug} />}
      </div>
      {configuracoes.isPending || imoveis.isPending ? (
        <p className="settings-role" role="status">
          Carregando a vitrine…
        </p>
      ) : erro ? (
        <div className="settings-load-error">
          <p role="alert">{erro.message}</p>
          <button
            type="button"
            className="button-secondary"
            onClick={() => {
              void configuracoes.refetch();
              void imoveis.refetch();
            }}
          >
            Tentar novamente
          </button>
        </div>
      ) : (
        <EditorDaVitrine
          key={configuracoes.data!.tenant.id}
          data={configuracoes.data!}
          imoveis={imoveis.data!.properties}
        />
      )}
    </div>
  );
}

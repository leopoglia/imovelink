"use client";

import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Filter,
  Internet,
  JournalPage,
  MapPin,
  Plus,
  ShieldAlert,
  Trash,
  WarningTriangle,
} from "iconoir-react";
import { useTenantStore } from "@/store/tenant-store";
import { apiFetch } from "@/lib/api";
import { hasPermission } from "@/lib/auth/rbac";
import { PropertyAudit } from "@/components/property-audit";
import { Select, PROPERTY_STATUS_OPTIONS } from "@/components/ui/select";
import {
  ModoDoFormulario,
  PropertyFormDialog,
} from "@/components/property-form-dialog";
import { BAIRROS_JARAGUA } from "@/lib/geo";
import { ehLinkHttp } from "@/lib/safe-url";
import { PropertyFiltersDialog } from "@/components/property-filters-dialog";
import {
  FILTROS_PADRAO,
  FiltrosDeImoveis,
  bairrosDisponiveis,
  contarFiltrosAtivos,
  filtrarImoveis,
} from "@/lib/property-filters";
import {
  ExternalListing,
  Property,
  PropertyAuditLog,
  PropertyStatus,
} from "@/types/domain";

export default function ImoveisPortfolioPage() {
  const { currentTenant, currentUser } = useTenantStore();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"PORTFOLIO" | "AUDIT">(
    "PORTFOLIO",
  );
  const [formulario, setFormulario] = useState<ModoDoFormulario | null>(null);
  const [rbacFeedback, setRbacFeedback] = useState<string | null>(null);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [filtros, setFiltros] = useState<FiltrosDeImoveis>(FILTROS_PADRAO);

  const { data, isPending, isError, refetch } = useQuery<{
    properties: Property[];
    auditLogs: PropertyAuditLog[];
    externalListings?: ExternalListing[];
    externalSources?: { id: string; name: string; logoUrl: string | null }[];
  }>({
    queryKey: ["properties", currentTenant.id],
    queryFn: async () => {
      const res = await apiFetch(
        "/api/properties?includeAudit=true&includeExternal=true",
      );
      if (!res.ok) throw new Error("Não foi possível carregar os imóveis.");
      return res.json();
    },
  });

  const properties = data?.properties ?? [];
  const auditLogs = data?.auditLogs ?? [];
  const externalListings = data?.externalListings ?? [];
  // Sugestões do campo de bairro: os bairros conhecidos e os já usados na carteira.
  const bairros = [
    ...new Set([
      ...Object.values(BAIRROS_JARAGUA).map((item) => item.bairro),
      ...properties.map((prop) => prop.addressNeighborhood),
    ]),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const visiveis = filtrarImoveis(properties, externalListings, filtros);
  const filtrosAtivos = contarFiltrosAtivos(filtros);
  const totalImoveis = properties.length + externalListings.length;
  const totalVisivel = visiveis.imoveis.length + visiveis.anuncios.length;
  const fontePorId = new Map(
    (data?.externalSources ?? []).map((fonte) => [fonte.id, fonte]),
  );

  const updatePropertyMutation = useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Property>;
    }) => {
      const res = await apiFetch(`/api/properties/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updates,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Não foi possível atualizar o imóvel.");
      }
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["properties", currentTenant.id],
      });
    },
  });

  const deletePropertyMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(
        `/api/properties/${id}`,
        { method: "DELETE", headers: { "Content-Type": "application/json" } },
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["properties", currentTenant.id],
      });
    },
    onError: (err) => {
      setRbacFeedback(
        err instanceof Error ? err.message : "Permissão RBAC negada.",
      );
      setTimeout(() => setRbacFeedback(null), 4000);
    },
  });

  const canDelete = hasPermission(currentUser.role, "properties:delete");
  const canEdit = hasPermission(currentUser.role, "properties:edit");
  const canCreate = hasPermission(currentUser.role, "properties:create");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Imóveis</h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="segmented-control">
            <button
              type="button"
              onClick={() => setActiveTab("PORTFOLIO")}
              aria-pressed={activeTab === "PORTFOLIO"}
              className={`segmented-option ${activeTab === "PORTFOLIO" ? "is-active" : ""}`}
            >
              Imóveis ({properties.length + externalListings.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("AUDIT")}
              aria-pressed={activeTab === "AUDIT"}
              className={`segmented-option ${activeTab === "AUDIT" ? "is-active" : ""}`}
            >
              <JournalPage aria-hidden="true" className="w-3.5 h-3.5" />
              Auditoria ({auditLogs.length})
            </button>
          </div>

          {activeTab === "PORTFOLIO" && (
            <button
              type="button"
              onClick={() => setMostrarFiltros((aberto) => !aberto)}
              aria-haspopup="dialog"
              className="button-secondary"
            >
              <Filter aria-hidden="true" className="w-4 h-4" />
              Filtros
              {filtrosAtivos > 0 && (
                <span
                  className="filter-count"
                  aria-label={`${filtrosAtivos} filtros ativos`}
                >
                  {filtrosAtivos}
                </span>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => setFormulario({ tipo: "novo" })}
            className="button-primary"
          >
            <Plus aria-hidden="true" className="w-4 h-4" />
            Novo Imóvel
          </button>
        </div>
      </div>

      {rbacFeedback && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
          <ShieldAlert
            aria-hidden="true"
            className="w-4 h-4 text-rose-600 shrink-0"
          />
          <span>{rbacFeedback}</span>
        </div>
      )}

      {activeTab === "PORTFOLIO" && (
        <>
          {filtrosAtivos > 0 ? (
            <p className="text-xs text-slate-500" role="status">
              Mostrando <strong>{totalVisivel}</strong> de{" "}
              <strong>{totalImoveis}</strong> imóveis.
            </p>
          ) : (
            externalListings.length > 0 && (
              <p className="text-xs text-slate-500">
                <strong>{properties.length}</strong> da sua carteira ·{" "}
                <strong>{externalListings.length}</strong> de outros sites,
                com link para a origem.
              </p>
            )
          )}
          {filtrosAtivos > 0 && totalVisivel === 0 && (
            <div className="property-filters-empty">
              <p>Nenhum imóvel encontrado com esses filtros.</p>
              <button
                type="button"
                className="button-secondary button-compact"
                onClick={() => setFiltros(FILTROS_PADRAO)}
              >
                Limpar filtros
              </button>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {visiveis.imoveis.map((prop) => (
            <div
              key={prop.id}
              className={`rounded-2xl bg-white border border-slate-200/80 overflow-hidden flex flex-col justify-between hover:border-slate-300 transition ${canEdit ? "cursor-pointer" : ""}`}
              // Clicar no card abre a edição. O status, a exclusão e o menu do
              // status (que é renderizado fora do card) mantêm a própria ação.
              onClick={(event) => {
                const alvo = event.target as HTMLElement;
                if (!canEdit || !event.currentTarget.contains(alvo)) return;
                if (alvo.closest("a, button, [role=option]")) return;
                if (window.getSelection()?.toString()) return;
                setFormulario({ tipo: "editar", imovel: prop });
              }}
            >
              <div>
                <div className="relative h-44 bg-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={prop.images[0]}
                    alt={prop.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-3 left-3 flex items-center gap-1.5">
                    <span className="px-2.5 py-1 rounded-lg bg-white/95 text-xs font-semibold text-slate-800">
                      {prop.code}
                    </span>
                    <span className="px-2 py-1 rounded-lg bg-white/90 text-[10px] font-medium text-slate-600">
                      {
                        {
                          HOUSE: "Casa",
                          APARTMENT: "Apartamento",
                          PENTHOUSE: "Cobertura",
                          COMMERCIAL: "Comercial",
                          LAND: "Terreno",
                        }[prop.type]
                      }
                    </span>
                  </div>
                  <div className="absolute top-3 right-3">
                    <Select
                      aria-label={`Status de ${prop.code}`}
                      value={prop.status}
                      onValueChange={(value) =>
                        updatePropertyMutation.mutate({
                          id: prop.id,
                          updates: {
                            status: value as PropertyStatus,
                          },
                        })
                      }
                      variant="status"
                      options={PROPERTY_STATUS_OPTIONS}
                    />
                  </div>
                </div>

                <div className="p-4 space-y-3">
                  <div>
                    <p className="text-xs text-slate-500 flex items-center gap-1">
                      <MapPin
                        aria-hidden="true"
                        className="w-3.5 h-3.5 text-brand-600"
                      />
                      {[prop.addressNeighborhood, prop.addressStreet]
                        .filter(Boolean)
                        .join(" • ")}
                    </p>
                    <h3 className="text-sm font-semibold text-slate-900 mt-1 line-clamp-1">
                      {canEdit ? (
                        // Pelo teclado, o título é o botão que abre a edição.
                        <button
                          type="button"
                          className="property-card-open"
                          aria-label={`Editar ${prop.code}`}
                          onClick={() =>
                            setFormulario({ tipo: "editar", imovel: prop })
                          }
                        >
                          {prop.title}
                        </button>
                      ) : (
                        prop.title
                      )}
                    </h3>
                  </div>

                  {prop.sourceListingRemoved &&
                    (prop.status === "AVAILABLE" ||
                      prop.status === "RESERVED") && (
                      <p className="property-origin-alert" role="note">
                        <WarningTriangle
                          aria-hidden="true"
                          width={15}
                          height={15}
                        />
                        <span>
                          Saiu do site de origem. Confira se foi vendido.
                          {prop.sourceListingUrl && (
                            <>
                              {" "}
                              <a
                                href={prop.sourceListingUrl}
                                target="_blank"
                                rel="noopener noreferrer nofollow"
                              >
                                Ver anúncio
                              </a>
                            </>
                          )}
                        </span>
                      </p>
                    )}

                  <p className="text-xs text-slate-500 line-clamp-2">
                    {prop.description}
                  </p>

                  <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
                    <span>
                      {prop.bedrooms} dorms ({prop.suites} suítes)
                    </span>
                    <span>{prop.parkingSpots} vagas</span>
                    <span>{prop.areaBuilt} m²</span>
                  </div>
                </div>
              </div>

              <div className="px-4 py-3.5 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between gap-2">
                <div>
                  <span className="text-[10px] text-slate-400 block">
                    Valor de Venda
                  </span>
                  <span className="text-base font-semibold text-slate-900">
                    R$ {prop.price.toLocaleString("pt-BR")}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => deletePropertyMutation.mutate(prop.id)}
                    title={
                      canDelete
                        ? "Excluir imóvel"
                        : "Restrito a Gestor/Admin (RBAC)"
                    }
                    className={`button-icon ${canDelete ? "button-danger" : "button-secondary"}`}
                  >
                    <Trash aria-hidden="true" className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {visiveis.anuncios.map((anuncio) => (
            <div
              key={anuncio.id}
              className="rounded-2xl bg-white border border-dashed border-slate-300 overflow-hidden flex flex-col justify-between hover:border-slate-400 transition"
            >
              <div>
                <div className="relative h-44 bg-slate-100 flex items-center justify-center">
                  {anuncio.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={anuncio.imageUrl}
                      alt={anuncio.title}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Internet
                      aria-hidden="true"
                      className="w-7 h-7 text-slate-400"
                    />
                  )}
                  <div className="absolute top-3 left-3">
                    <span className="px-2.5 py-1 rounded-lg bg-white/95 text-[10px] font-semibold text-slate-700 flex items-center gap-1.5">
                      {ehLinkHttp(fontePorId.get(anuncio.sourceId)?.logoUrl) && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={fontePorId.get(anuncio.sourceId)!.logoUrl!}
                          alt=""
                          className="crawler-logo-preview"
                        />
                      )}
                      {fontePorId.get(anuncio.sourceId)?.name ??
                        "Outro site"}
                    </span>
                  </div>
                </div>

                <div className="p-4 space-y-2">
                  <div>
                    <p className="text-[11px] text-slate-500 flex items-center gap-1">
                      <MapPin
                        aria-hidden="true"
                        className="w-3.5 h-3.5 text-brand-600"
                      />
                      {[anuncio.neighborhood, anuncio.city]
                        .filter(Boolean)
                        .join(" • ") || "Local não informado"}
                    </p>
                    <h3 className="text-sm font-semibold text-slate-900 mt-1 line-clamp-2">
                      {anuncio.title}
                    </h3>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
                    <span>{anuncio.bedrooms ?? "—"} dorms</span>
                    <span>{anuncio.parkingSpots ?? "—"} vagas</span>
                    <span>
                      {anuncio.areaTotal ? `${anuncio.areaTotal} m²` : "—"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="px-4 py-3.5 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between gap-2">
                <div>
                  <span className="text-[10px] text-slate-400 block">
                    {anuncio.purpose === "RENT"
                      ? "Locação em outro site"
                      : "Anunciado por terceiro"}
                  </span>
                  <span className="text-base font-semibold text-slate-900">
                    {anuncio.price === null
                      ? "Consulte"
                      : `R$ ${anuncio.price.toLocaleString("pt-BR")}`}
                    {anuncio.purpose === "RENT" && (
                      <small className="text-xs font-normal">/mês</small>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {canCreate && (
                    <button
                      type="button"
                      className="button-secondary button-compact"
                      aria-label={`Trazer ${anuncio.title} para a carteira`}
                      onClick={() =>
                        setFormulario({
                          tipo: "importar",
                          anuncio,
                          fonte: fontePorId.get(anuncio.sourceId)?.name,
                        })
                      }
                    >
                      Trazer para a carteira
                    </button>
                  )}
                  <a
                    href={anuncio.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="button-secondary button-compact"
                  >
                    Ver na origem
                  </a>
                </div>
              </div>
            </div>
          ))}
          </div>
        </>
      )}

      {activeTab === "AUDIT" && (
        <PropertyAudit
          logs={auditLogs}
          isLoading={isPending}
          isError={isError}
          onRetry={() => void refetch()}
        />
      )}

      {mostrarFiltros && (
        <PropertyFiltersDialog
          filtros={filtros}
          bairros={bairrosDisponiveis(properties, externalListings)}
          resultado={totalVisivel}
          onChange={setFiltros}
          onClose={() => setMostrarFiltros(false)}
        />
      )}

      {formulario && (
        <PropertyFormDialog
          modo={formulario}
          bairros={bairros}
          onClose={() => setFormulario(null)}
          onSaved={() => {
            setFormulario(null);
            void queryClient.invalidateQueries({
              queryKey: ["properties", currentTenant.id],
            });
          }}
        />
      )}
    </div>
  );
}

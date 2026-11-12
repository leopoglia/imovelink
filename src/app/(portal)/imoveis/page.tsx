"use client";

import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Internet,
  JournalPage,
  MapPin,
  Plus,
  ShieldAlert,
  Trash,
  Xmark,
} from "iconoir-react";
import { useTenantStore } from "@/store/tenant-store";
import { apiFetch } from "@/lib/api";
import { hasPermission } from "@/lib/auth/rbac";
import { PropertyAudit } from "@/components/property-audit";
import { Select, PROPERTY_STATUS_OPTIONS } from "@/components/ui/select";
import {
  ExternalListing,
  Property,
  PropertyAuditLog,
  PropertyStatus,
  PropertyType,
} from "@/types/domain";

export default function ImoveisPortfolioPage() {
  const { currentTenant, currentUser } = useTenantStore();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"PORTFOLIO" | "AUDIT">(
    "PORTFOLIO",
  );
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [rbacFeedback, setRbacFeedback] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [type, setType] = useState<PropertyType>("HOUSE");
  const [price, setPrice] = useState("890000");
  const [neighborhood, setNeighborhood] = useState("Vila Nova");
  const [street, setStreet] = useState("Rua 25 de Julho, 810");
  const [bedrooms, setBedrooms] = useState("3");
  const [suites, setSuites] = useState("2");
  const [parkingSpots, setParkingSpots] = useState("2");
  const [areaBuilt, setAreaBuilt] = useState("185");
  const [amenitiesText, setAmenitiesText] = useState(
    "quintal arborizado, piscina, espaco gourmet, churrasqueira",
  );
  const [description, setDescription] = useState(
    "Excelente residência com quintal arborizado, iluminação natural e área gourmet integrada em localização privilegiada de Jaraguá do Sul.",
  );

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
  const fontePorId = new Map(
    (data?.externalSources ?? []).map((fonte) => [fonte.id, fonte]),
  );

  const createPropertyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/api/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title:
            title ||
            "Residência Jardim Europeu com Espaço Gourmet e Quintal Amplo",
          description,
          type,
          purpose: "SALE",
          price: Number(price),
          bedrooms: Number(bedrooms),
          suites: Number(suites),
          bathrooms: Number(suites) + 1,
          parkingSpots: Number(parkingSpots),
          areaTotal: Number(areaBuilt) * 1.5,
          areaBuilt: Number(areaBuilt),
          addressStreet: street,
          addressNeighborhood: neighborhood,
          amenities: amenitiesText
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          featured: true,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Falha ao cadastrar imóvel");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["properties", currentTenant.id],
      });
      setShowCreateModal(false);
      setTitle("");
    },
  });

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
      queryClient.invalidateQueries({
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
      queryClient.invalidateQueries({
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

          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
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
          {externalListings.length > 0 && (
            <p className="text-xs text-slate-500">
              <strong>{properties.length}</strong> da sua carteira ·{" "}
              <strong>{externalListings.length}</strong> de outros sites
              (somente leitura, com link para a origem).
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {properties.map((prop) => (
            <div
              key={prop.id}
              className="rounded-2xl bg-white border border-slate-200/80 overflow-hidden flex flex-col justify-between hover:border-slate-300 transition"
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
                      {prop.addressNeighborhood} • {prop.addressStreet}
                    </p>
                    <h3 className="text-sm font-semibold text-slate-900 mt-1 line-clamp-1">
                      {prop.title}
                    </h3>
                  </div>

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
          {externalListings.map((anuncio) => (
            <a
              key={anuncio.id}
              href={anuncio.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
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
                      {fontePorId.get(anuncio.sourceId)?.logoUrl && (
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
                <span className="button-secondary button-compact">
                  Ver na origem
                </span>
              </div>
            </a>
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


      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-semibold text-slate-900">
                Cadastrar Novo Imóvel
              </h2>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                aria-label="Fechar cadastro de imóvel"
                className="icon-button"
              >
                <Xmark aria-hidden="true" className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="sm:col-span-2">
                <label className="field-label">Título do Imóvel *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Casa com Quintal Arborizado na Vila Nova"
                  className="field-control"
                />
              </div>

              <div>
                <label className="field-label" htmlFor="property-type">
                  Tipo
                </label>
                <Select
                  id="property-type"
                  value={type}
                  onValueChange={(value) => setType(value as PropertyType)}
                  options={[
                    { value: "HOUSE", label: "Casa / Sobrado" },
                    { value: "APARTMENT", label: "Apartamento / Studio" },
                    { value: "PENTHOUSE", label: "Cobertura Duplex" },
                    { value: "COMMERCIAL", label: "Comercial" },
                    { value: "LAND", label: "Terreno" },
                  ]}
                />
              </div>

              <div>
                <label className="field-label">Valor de Venda (R$)</label>
                <input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="field-control"
                />
              </div>

              <div>
                <label className="field-label" htmlFor="property-neighborhood">
                  Bairro
                </label>
                <Select
                  id="property-neighborhood"
                  value={neighborhood}
                  onValueChange={setNeighborhood}
                  options={[
                    "Centro",
                    "Vila Nova",
                    "Czerniewicz",
                    "Baependi",
                    "Barra do Rio Cerro",
                    "Rau",
                    "Ilha da Figueira",
                    "Água Verde",
                  ].map((value) => ({ value, label: value }))}
                />
              </div>

              <div>
                <label className="field-label">Rua e Número</label>
                <input
                  type="text"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  className="field-control"
                />
              </div>

              <div className="grid grid-cols-4 gap-2 sm:col-span-2">
                <div>
                  <label className="field-label">Quartos</label>
                  <input
                    type="number"
                    value={bedrooms}
                    onChange={(e) => setBedrooms(e.target.value)}
                    className="field-control"
                  />
                </div>
                <div>
                  <label className="field-label">Suítes</label>
                  <input
                    type="number"
                    value={suites}
                    onChange={(e) => setSuites(e.target.value)}
                    className="field-control"
                  />
                </div>
                <div>
                  <label className="field-label">Vagas</label>
                  <input
                    type="number"
                    value={parkingSpots}
                    onChange={(e) => setParkingSpots(e.target.value)}
                    className="field-control"
                  />
                </div>
                <div>
                  <label className="field-label">Área (m²)</label>
                  <input
                    type="number"
                    value={areaBuilt}
                    onChange={(e) => setAreaBuilt(e.target.value)}
                    className="field-control"
                  />
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="field-label">
                  Comodidades (separadas por vírgula)
                </label>
                <input
                  type="text"
                  value={amenitiesText}
                  onChange={(e) => setAmenitiesText(e.target.value)}
                  className="field-control"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="field-label">Descrição</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="field-control"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="button-secondary"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={createPropertyMutation.isPending}
                onClick={() => createPropertyMutation.mutate()}
                className="button-primary"
              >
                {createPropertyMutation.isPending
                  ? "Salvando..."
                  : "Salvar Imóvel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

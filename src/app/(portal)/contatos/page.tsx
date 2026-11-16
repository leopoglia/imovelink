"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AreaSearch, Phone, RefreshDouble } from "iconoir-react";
import { apiFetch } from "@/lib/api";
import { LEAD_STAGES, LEAD_STAGE_LABELS } from "@/lib/lead-stages";
import { formatPropertyPrice } from "@/lib/property-search";
import { useTenantStore } from "@/store/tenant-store";
import type {
  HybridSearchResponse,
  Lead,
  LeadStage,
  LeadTemperature,
} from "@/types/domain";

const TEMPERATURE_LABELS: Record<LeadTemperature, string> = {
  HOT: "Quente",
  WARM: "Morno",
  COLD: "Frio",
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));

type Sugestoes =
  | { estado: "carregando" }
  | { estado: "erro"; mensagem: string }
  | { estado: "pronto"; imoveis: HybridSearchResponse["results"] };

export default function ContatosPage() {
  const { currentTenant } = useTenantStore();
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<LeadStage | null>(null);
  const [sugestoes, setSugestoes] = useState<Record<string, Sugestoes>>({});

  const carregar = useCallback(async () => {
    setLoadError(null);
    try {
      const response = await apiFetch("/api/leads");
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Não foi possível carregar os contatos.");
      setLeads(data.leads);
    } catch (cause) {
      setLeads(null);
      setLoadError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível carregar os contatos.",
      );
    }
  }, []);

  useEffect(() => {
    setLeads(null);
    setSugestoes({});
    setMoveError(null);
    void carregar();
  }, [currentTenant.id, carregar]);

  /**
   * Move o cartão na tela antes da resposta do servidor. Se o servidor recusar,
   * o cartão volta para a etapa em que estava e o motivo é exibido.
   */
  async function mover(lead: Lead, stage: LeadStage) {
    if (lead.stage === stage || moving) return;
    const anterior = lead.stage;
    const aplicar = (etapa: LeadStage, atualizado?: Lead) =>
      setLeads(
        (atual) =>
          atual?.map((item) =>
            item.id === lead.id
              ? { ...item, ...atualizado, stage: etapa }
              : item,
          ) ?? null,
      );
    aplicar(stage);
    setMoving(lead.id);
    setMoveError(null);
    try {
      const response = await apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Não foi possível mover o contato.");
      aplicar(stage, data.lead);
    } catch (cause) {
      aplicar(anterior);
      setMoveError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível mover o contato.",
      );
    } finally {
      setMoving(null);
    }
  }

  /** Usa a busca inteligente com o texto que o próprio contato escreveu. */
  async function sugerirImoveis(lead: Lead) {
    setSugestoes((atual) => ({ ...atual, [lead.id]: { estado: "carregando" } }));
    try {
      const response = await apiFetch("/api/search/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: lead.naturalSearchDesire,
          onlyAvailable: true,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Não foi possível buscar os imóveis.");
      setSugestoes((atual) => ({
        ...atual,
        [lead.id]: {
          estado: "pronto",
          imoveis: (data as HybridSearchResponse).results.slice(0, 3),
        },
      }));
    } catch (cause) {
      setSugestoes((atual) => ({
        ...atual,
        [lead.id]: {
          estado: "erro",
          mensagem:
            cause instanceof Error
              ? cause.message
              : "Não foi possível buscar os imóveis.",
        },
      }));
    }
  }

  return (
    <div className="lead-page">
      <header className="lead-heading">
        <div>
          <h1>Contatos</h1>
          <p>
            Quem entrou em contato pela vitrine, organizado por etapa da
            negociação.
          </p>
        </div>
        {leads && (
          <span className="lead-total">
            {leads.length} {leads.length === 1 ? "contato" : "contatos"}
          </span>
        )}
      </header>

      {moveError && (
        <p className="lead-alert" role="alert">
          {moveError}
        </p>
      )}

      {loadError ? (
        <div className="lead-empty" role="alert">
          <p>{loadError}</p>
          <button
            type="button"
            className="button-secondary button-compact"
            onClick={() => void carregar()}
          >
            Tentar novamente
          </button>
        </div>
      ) : !leads ? (
        <div className="lead-loading" role="status">
          <RefreshDouble
            width={22}
            height={22}
            className="ai-search-spinner"
            aria-hidden="true"
          />
          Carregando contatos…
        </div>
      ) : leads.length === 0 ? (
        <div className="lead-empty">
          <h2>Nenhum contato ainda.</h2>
          <p>
            Os contatos enviados pelo formulário da vitrine aparecem aqui, na
            etapa Novo.
          </p>
        </div>
      ) : (
        <div className="lead-board">
          {LEAD_STAGES.map((stage) => {
            const daEtapa = leads.filter((lead) => lead.stage === stage);
            return (
              <section
                key={stage}
                className="lead-column"
                aria-label={LEAD_STAGE_LABELS[stage]}
                data-drag-over={dragOver === stage || undefined}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOver(stage);
                }}
                onDragLeave={() => setDragOver(null)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragOver(null);
                  const id = event.dataTransfer.getData("text/plain");
                  const lead = leads.find((item) => item.id === id);
                  if (lead) void mover(lead, stage);
                }}
              >
                <header className="lead-column-heading">
                  <h2>{LEAD_STAGE_LABELS[stage]}</h2>
                  <span aria-label={`${daEtapa.length} nesta etapa`}>
                    {daEtapa.length}
                  </span>
                </header>
                {daEtapa.length === 0 ? (
                  <p className="lead-column-empty">Nenhum contato.</p>
                ) : (
                  <ul className="lead-cards">
                    {daEtapa.map((lead) => {
                      const sugestao = sugestoes[lead.id];
                      return (
                        <li key={lead.id}>
                          <article
                            className="lead-card"
                            aria-label={lead.name}
                            draggable
                            onDragStart={(event) =>
                              event.dataTransfer.setData("text/plain", lead.id)
                            }
                          >
                            <div className="lead-card-top">
                              <h3>{lead.name}</h3>
                              <span
                                className="lead-score"
                                data-temperature={lead.aiTemperature}
                                title="Pontuação calculada a partir do que o contato escreveu"
                              >
                                {TEMPERATURE_LABELS[lead.aiTemperature]} ·{" "}
                                {lead.aiScore}
                              </span>
                            </div>
                            <a
                              className="lead-phone"
                              href={`tel:${lead.phone.replace(/[^\d+]/g, "")}`}
                            >
                              <Phone width={14} height={14} aria-hidden="true" />
                              {lead.phone}
                            </a>
                            <p className="lead-desire">
                              {lead.naturalSearchDesire}
                            </p>
                            <p className="lead-meta">
                              Recebido em {formatDate(lead.createdAt)}
                            </p>
                            <label className="lead-move">
                              <span>Etapa</span>
                              <select
                                value={lead.stage}
                                disabled={moving === lead.id}
                                aria-label={`Etapa de ${lead.name}`}
                                onChange={(event) =>
                                  void mover(
                                    lead,
                                    event.target.value as LeadStage,
                                  )
                                }
                              >
                                {LEAD_STAGES.map((option) => (
                                  <option key={option} value={option}>
                                    {LEAD_STAGE_LABELS[option]}
                                  </option>
                                ))}
                              </select>
                            </label>
                            {sugestao?.estado !== "pronto" && (
                              <button
                                type="button"
                                className="button-secondary button-compact"
                                disabled={sugestao?.estado === "carregando"}
                                onClick={() => void sugerirImoveis(lead)}
                              >
                                <AreaSearch
                                  width={16}
                                  height={16}
                                  aria-hidden="true"
                                />
                                {sugestao?.estado === "carregando"
                                  ? "Buscando…"
                                  : "Sugerir imóveis"}
                              </button>
                            )}
                            {sugestao?.estado === "erro" && (
                              <p className="lead-suggestion-error" role="alert">
                                {sugestao.mensagem}
                              </p>
                            )}
                            {sugestao?.estado === "pronto" &&
                              (sugestao.imoveis.length === 0 ? (
                                <p className="lead-column-empty">
                                  Nenhum imóvel disponível atende a esse pedido.
                                </p>
                              ) : (
                                <ul
                                  className="lead-suggestions"
                                  aria-label={`Imóveis sugeridos para ${lead.name}`}
                                >
                                  {sugestao.imoveis.map(({ property }) => (
                                    <li key={property.id}>
                                      <strong>{property.code}</strong>
                                      <span>{property.title}</span>
                                      <span>
                                        {property.addressNeighborhood} ·{" "}
                                        {formatPropertyPrice(property.price)}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              ))}
                          </article>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

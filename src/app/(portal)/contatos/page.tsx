"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { AreaSearch, EditPencil, Phone, RefreshDouble } from "iconoir-react";
import { apiFetch } from "@/lib/api";
import { hasPermission } from "@/lib/auth/rbac";
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

/** Negociação encerrada: não faz sentido sugerir imóveis. */
const ETAPAS_ENCERRADAS: readonly LeadStage[] = ["WON", "LOST"];

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

/** Os campos que o diálogo de edição permite alterar. */
type Formulario = Pick<
  Lead,
  "name" | "phone" | "email" | "naturalSearchDesire" | "stage"
>;
const CAMPOS: readonly (keyof Formulario)[] = [
  "name",
  "phone",
  "email",
  "naturalSearchDesire",
  "stage",
];

const mensagemDe = (causa: unknown, padrao: string) =>
  causa instanceof Error ? causa.message : padrao;

export default function ContatosPage() {
  const { currentTenant, currentUser } = useTenantStore();
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<LeadStage | null>(null);
  const [sugestoes, setSugestoes] = useState<Record<string, Sugestoes>>({});
  const [editando, setEditando] = useState<Lead | null>(null);
  const [formulario, setFormulario] = useState<Formulario | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erroDoFormulario, setErroDoFormulario] = useState<string | null>(null);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const dialogo = useRef<HTMLDialogElement>(null);
  const podeExcluir = hasPermission(currentUser.role, "leads:delete");

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
      setLoadError(mensagemDe(cause, "Não foi possível carregar os contatos."));
    }
  }, []);

  useEffect(() => {
    setLeads(null);
    setSugestoes({});
    setMoveError(null);
    setEditando(null);
    void carregar();
  }, [currentTenant.id, carregar]);

  // showModal dá foco preso e fechamento por Escape sem código extra.
  useEffect(() => {
    const caixa = dialogo.current;
    if (!caixa) return;
    if (editando && !caixa.open) caixa.showModal();
    if (!editando && caixa.open) caixa.close();
  }, [editando]);

  const substituir = (atualizado: Lead) =>
    setLeads(
      (atual) =>
        atual?.map((item) => (item.id === atualizado.id ? atualizado : item)) ??
        null,
    );

  /**
   * Move o cartão na tela antes da resposta do servidor. Se o servidor recusar,
   * o cartão volta para a etapa em que estava e o motivo é exibido.
   */
  async function mover(lead: Lead, stage: LeadStage) {
    if (lead.stage === stage || moving) return;
    substituir({ ...lead, stage });
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
      substituir(data.lead);
    } catch (cause) {
      substituir(lead);
      setMoveError(mensagemDe(cause, "Não foi possível mover o contato."));
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
          mensagem: mensagemDe(cause, "Não foi possível buscar os imóveis."),
        },
      }));
    }
  }

  function abrirEdicao(lead: Lead) {
    setFormulario({
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      naturalSearchDesire: lead.naturalSearchDesire,
      stage: lead.stage,
    });
    setErroDoFormulario(null);
    setConfirmandoExclusao(false);
    setEditando(lead);
  }

  const alterar = <Campo extends keyof Formulario>(
    campo: Campo,
    valor: Formulario[Campo],
  ) => setFormulario((atual) => (atual ? { ...atual, [campo]: valor } : atual));

  /** Envia só os campos que mudaram; sem mudança, apenas fecha. */
  async function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!editando || !formulario || salvando) return;
    const mudancas = Object.fromEntries(
      CAMPOS.filter(
        (campo) => formulario[campo].trim() !== editando[campo],
      ).map((campo) => [campo, formulario[campo].trim()]),
    );
    if (Object.keys(mudancas).length === 0) {
      setEditando(null);
      return;
    }
    setSalvando(true);
    setErroDoFormulario(null);
    try {
      const response = await apiFetch(`/api/leads/${editando.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mudancas),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Não foi possível alterar o contato.");
      substituir(data.lead);
      // O pedido mudou: as sugestões antigas não valem mais.
      if ("naturalSearchDesire" in mudancas)
        setSugestoes((atual) => {
          const { [editando.id]: _descartada, ...resto } = atual;
          return resto;
        });
      setEditando(null);
    } catch (cause) {
      setErroDoFormulario(
        mensagemDe(cause, "Não foi possível alterar o contato."),
      );
    } finally {
      setSalvando(false);
    }
  }

  async function excluir() {
    if (!editando || salvando) return;
    setSalvando(true);
    setErroDoFormulario(null);
    try {
      const response = await apiFetch(`/api/leads/${editando.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Não foi possível excluir o contato.");
      setLeads(
        (atual) => atual?.filter((item) => item.id !== editando.id) ?? null,
      );
      setEditando(null);
    } catch (cause) {
      setErroDoFormulario(
        mensagemDe(cause, "Não foi possível excluir o contato."),
      );
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="lead-page">
      <header className="lead-heading">
        <div>
          <h1>Contatos</h1>
          <p>
            Quem entrou em contato pela vitrine, organizado por etapa da
            negociação. Arraste um cartão para mudar a etapa.
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
                      const encerrado = ETAPAS_ENCERRADAS.includes(lead.stage);
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
                            <div className="lead-actions">
                              <button
                                type="button"
                                className="button-secondary button-compact"
                                aria-label={`Editar ${lead.name}`}
                                onClick={() => abrirEdicao(lead)}
                              >
                                <EditPencil
                                  width={16}
                                  height={16}
                                  aria-hidden="true"
                                />
                                Editar
                              </button>
                              {!encerrado && sugestao?.estado !== "pronto" && (
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
                            </div>
                            {!encerrado && sugestao?.estado === "erro" && (
                              <p className="lead-suggestion-error" role="alert">
                                {sugestao.mensagem}
                              </p>
                            )}
                            {!encerrado &&
                              sugestao?.estado === "pronto" &&
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

      <dialog
        ref={dialogo}
        className="lead-dialog"
        aria-labelledby="dialogo-contato"
        onClose={() => setEditando(null)}
        // Clicar fora da caixa fecha, como se espera de um modal.
        onClick={(evento) => {
          if (evento.target === dialogo.current) dialogo.current?.close();
        }}
      >
        {editando && formulario && (
          <form className="lead-form" onSubmit={(evento) => void salvar(evento)}>
            <h2 id="dialogo-contato">Editar contato</h2>
            <label>
              <span className="field-label">Nome</span>
              <input
                className="field-control"
                value={formulario.name}
                onChange={(evento) => alterar("name", evento.target.value)}
                required
                minLength={2}
                maxLength={120}
              />
            </label>
            <label>
              <span className="field-label">Telefone</span>
              <input
                className="field-control"
                type="tel"
                value={formulario.phone}
                onChange={(evento) => alterar("phone", evento.target.value)}
                required
                maxLength={30}
              />
            </label>
            <label>
              <span className="field-label">E-mail (opcional)</span>
              <input
                className="field-control"
                type="email"
                value={formulario.email}
                onChange={(evento) => alterar("email", evento.target.value)}
                maxLength={254}
              />
            </label>
            <label>
              <span className="field-label">O que procura</span>
              <textarea
                className="field-control lead-form-text"
                value={formulario.naturalSearchDesire}
                onChange={(evento) =>
                  alterar("naturalSearchDesire", evento.target.value)
                }
                required
                minLength={3}
                maxLength={1500}
                rows={4}
              />
              <small className="lead-form-hint">
                Ao mudar este texto, a pontuação do contato é recalculada.
              </small>
            </label>
            <label>
              <span className="field-label">Etapa</span>
              <select
                className="field-control"
                value={formulario.stage}
                onChange={(evento) =>
                  alterar("stage", evento.target.value as LeadStage)
                }
              >
                {LEAD_STAGES.map((option) => (
                  <option key={option} value={option}>
                    {LEAD_STAGE_LABELS[option]}
                  </option>
                ))}
              </select>
            </label>

            {erroDoFormulario && (
              <p className="lead-alert" role="alert">
                {erroDoFormulario}
              </p>
            )}

            <div className="lead-form-actions">
              {podeExcluir &&
                (confirmandoExclusao ? (
                  <button
                    type="button"
                    className="button-danger button-compact"
                    disabled={salvando}
                    onClick={() => void excluir()}
                  >
                    Confirmar exclusão
                  </button>
                ) : (
                  <button
                    type="button"
                    className="button-danger button-compact"
                    disabled={salvando}
                    onClick={() => setConfirmandoExclusao(true)}
                  >
                    Excluir contato
                  </button>
                ))}
              <span className="lead-form-spacer" />
              <button
                type="button"
                className="button-secondary button-compact"
                disabled={salvando}
                onClick={() => setEditando(null)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="button-primary button-compact"
                disabled={salvando}
              >
                {salvando ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </div>
  );
}

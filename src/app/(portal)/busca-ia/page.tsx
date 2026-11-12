"use client";
import { apiFetch } from "@/lib/api";

import React, { useEffect, useRef, useState } from "react";
import {
  AreaSearch,
  Check,
  Copy,
  Internet,
  MapPin,
  NavArrowDown,
  RefreshDouble,
} from "iconoir-react";
import { useTenantStore } from "@/store/tenant-store";
import {
  formatPropertyPrice,
  getSearchCriteria,
  PROPERTY_STATUS_LABELS,
} from "@/lib/property-search";
import type {
  ExternalResultItem,
  HybridSearchResponse,
  Property,
} from "@/types/domain";

const SUGGESTIONS = [
  {
    label: "Casa com piscina",
    query: "Casa com piscina na Vila Nova até 950 mil",
  },
  {
    label: "Apartamento até R$ 800 mil",
    query: "Apartamento com 3 quartos até 800 mil",
  },
  {
    label: "Perto da Católica",
    query: "Studio mobiliado perto da Católica até 390 mil",
  },
];

/** Junta imóveis próprios e anúncios externos numa lista só, por relevância. */
function misturarResultados(resposta: HybridSearchResponse) {
  const proprios = resposta.results.map((item) => ({
    ordem: item.hybridScore,
    proprio: item,
    externo: null as ExternalResultItem | null,
  }));
  const externos = (resposta.externalResults ?? []).map((item) => ({
    ordem: item.score,
    proprio: null as (typeof resposta.results)[number] | null,
    externo: item,
  }));
  return [...proprios, ...externos].sort((a, b) => b.ordem - a.ordem) as Array<
    | { ordem: number; proprio: (typeof resposta.results)[number]; externo: null }
    | { ordem: number; proprio: null; externo: ExternalResultItem }
  >;
}

export default function BuscaIAPage() {
  const { currentTenant } = useTenantStore();
  const [queryText, setQueryText] = useState("");
  const [onlyAvailable, setOnlyAvailable] = useState(true);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<HybridSearchResponse | null>(null);
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<{
    id: string;
    error: boolean;
  } | null>(null);
  const request = useRef<AbortController | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    request.current?.abort();
    request.current = null;
    setQueryText("");
    setSubmittedQuery("");
    setResponse(null);
    setError(null);
    setCopyFeedback(null);
    setLoading(false);
    return () => {
      request.current?.abort();
      request.current = null;
    };
  }, [currentTenant.id]);

  async function executeSearch(text = queryText, available = onlyAvailable) {
    const query = text.trim();
    if (query.length < 3) {
      setError("Descreva o imóvel em pelo menos 3 caracteres.");
      return;
    }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setQueryText(text);
    setSubmittedQuery(query);
    setLoading(true);
    setError(null);
    setCopyFeedback(null);
    try {
      const result = await apiFetch("/api/search/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          query,
          onlyAvailable: available,
        }),
      });
      const data = await result.json();
      if (!result.ok)
        throw new Error(data.error || "Não foi possível buscar os imóveis.");
      if (request.current === controller) setResponse(data);
    } catch (cause) {
      if (request.current !== controller || controller.signal.aborted) return;
      setResponse(null);
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível buscar os imóveis. Tente novamente.",
      );
    } finally {
      if (request.current === controller) setLoading(false);
    }
  }

  function clearSearch() {
    request.current?.abort();
    request.current = null;
    setQueryText("");
    setSubmittedQuery("");
    setResponse(null);
    setError(null);
    setLoading(false);
    setCopyFeedback(null);
    input.current?.focus();
  }

  async function copyProperty(property: Property) {
    try {
      if (!navigator.clipboard)
        throw new Error("Área de transferência indisponível.");
      await navigator.clipboard.writeText(
        `${property.code} · ${property.title}\n${formatPropertyPrice(property.price)}${property.purpose === "RENT" ? "/mês" : ""}\n${property.addressNeighborhood}, ${property.addressCity}\n${property.bedrooms} quartos · ${property.parkingSpots} vagas · ${property.areaBuilt} m²`,
      );
      setCopyFeedback({ id: property.id, error: false });
    } catch {
      setCopyFeedback({ id: property.id, error: true });
    }
  }

  const criteria = response ? getSearchCriteria(response.query) : [];
  const totalDeResultados =
    (response?.results.length ?? 0) + (response?.externalResults?.length ?? 0);
  return (
    <div className="ai-search-page">
      <div className="ai-search-composer">
        <header className="ai-search-heading">
          <h1>Busca inteligente</h1>
          <p>Descreva o que seu cliente procura.</p>
        </header>
        <form
          className="ai-search-box"
          onSubmit={(event) => {
            event.preventDefault();
            void executeSearch();
          }}
        >
          <label className="sr-only" htmlFor="property-search">
            Descreva o imóvel que procura
          </label>
          <textarea
            ref={input}
            id="property-search"
            value={queryText}
            onChange={(event) => setQueryText(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                if (!loading) void executeSearch();
              }
            }}
            maxLength={1500}
            rows={3}
            placeholder="Casa com 3 quartos, piscina e quintal na Vila Nova até R$ 950 mil"
            className="ai-query-input"
          />
          <div className="ai-search-controls">
            <label className="ai-available-filter">
              <input
                type="checkbox"
                checked={onlyAvailable}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setOnlyAvailable(checked);
                  if (submittedQuery)
                    void executeSearch(submittedQuery, checked);
                }}
              />
              Só disponíveis
            </label>
            <button
              type="submit"
              className="button-primary"
              disabled={loading || queryText.trim().length < 3}
            >
              {loading ? (
                <RefreshDouble
                  className="ai-search-spinner"
                  width={18}
                  height={18}
                  aria-hidden="true"
                />
              ) : (
                <AreaSearch width={18} height={18} aria-hidden="true" />
              )}
              {loading ? "Buscando…" : "Buscar imóveis"}
            </button>
          </div>
        </form>
        {!response && !loading && (
          <div className="ai-suggestions" aria-label="Sugestões de busca">
            {SUGGESTIONS.map((suggestion) => (
              <button
                type="button"
                key={suggestion.label}
                onClick={() => void executeSearch(suggestion.query)}
              >
                {suggestion.label}
              </button>
            ))}
          </div>
        )}
        {error && (
          <p className="ai-search-error" role="alert">
            {error}
          </p>
        )}
      </div>

      {loading ? (
        <div className="ai-search-loading" role="status">
          <RefreshDouble
            width={22}
            height={22}
            className="ai-search-spinner"
            aria-hidden="true"
          />
          Buscando imóveis…
        </div>
      ) : (
        response && (
          <section className="ai-results" aria-label="Resultados da busca">
            <div className="ai-results-heading">
              <h2>
                {totalDeResultados}{" "}
                {totalDeResultados === 1
                  ? "imóvel encontrado"
                  : "imóveis encontrados"}
              </h2>
              {totalDeResultados > 1 && <span>Mais relevantes primeiro</span>}
            </div>
            {queryText.trim() !== submittedQuery && (
              <p className="ai-search-note">
                Resultados da última busca. Busque novamente para aplicar o
                texto editado.
              </p>
            )}
            {criteria.length > 0 && (
              <ul className="ai-criteria" aria-label="Critérios da busca">
                {criteria.map((criterion) => (
                  <li key={criterion}>{criterion}</li>
                ))}
              </ul>
            )}
            {response.interpretation?.mode === "local" && (
              <p className="ai-search-note" role="status">
                {response.interpretation.reason === "unavailable"
                  ? "IA indisponível no momento. Exibindo resultados da busca local."
                  : "Busca local · IA ainda não configurada."}
              </p>
            )}
            {response.interpretation?.mode === "ai" && (
              <p className="ai-search-note">Busca interpretada com IA</p>
            )}
            {response.results.length === 0 ? (
              <div className="ai-search-empty">
                <AreaSearch width={28} height={28} aria-hidden="true" />
                <h3>Nenhum imóvel atende a essa busca.</h3>
                <p>Tente ampliar o valor ou mudar a região.</p>
                <button
                  type="button"
                  className="button-secondary button-compact"
                  onClick={clearSearch}
                >
                  Limpar busca
                </button>
              </div>
            ) : (
              <div className="ai-result-list">
                {misturarResultados(response).map((linha) => {
                  if (linha.externo) {
                    const externo = linha.externo;
                    return (
                      <article
                        className="ai-result is-external"
                        key={externo.id}
                      >
                        <div className="ai-result-image">
                          {externo.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={externo.imageUrl} alt="" loading="lazy" />
                          ) : (
                            <Internet
                              width={26}
                              height={26}
                              aria-hidden="true"
                            />
                          )}
                        </div>
                        <div className="ai-result-body">
                          <div className="ai-result-top">
                            <div>
                              <span className="ai-result-external-badge">
                                {externo.sourceLogoUrl && (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={externo.sourceLogoUrl}
                                    alt=""
                                    className="crawler-logo-preview"
                                  />
                                )}
                                {externo.sourceName}
                              </span>
                            </div>
                            <strong>
                              {externo.price === null
                                ? "Consulte"
                                : formatPropertyPrice(externo.price)}
                              {externo.purpose === "RENT" && <small>/mês</small>}
                            </strong>
                          </div>
                          <h3>{externo.title}</h3>
                          <p className="ai-result-location">
                            <MapPin width={14} height={14} aria-hidden="true" />
                            {[externo.neighborhood, externo.city]
                              .filter(Boolean)
                              .join(", ") || "Local não informado"}
                          </p>
                          <p className="ai-result-specs">
                            {externo.bedrooms ?? "—"} quartos<span>·</span>
                            {externo.parkingSpots ?? "—"} vagas<span>·</span>
                            {externo.areaTotal ?? "—"} m²
                          </p>
                          <ul
                            className="ai-match-reasons"
                            aria-label="Destaques do anúncio externo"
                          >
                            {externo.matchReasons.slice(0, 3).map((motivo) => (
                              <li key={motivo}>
                                <Check
                                  width={14}
                                  height={14}
                                  aria-hidden="true"
                                />
                                {motivo}
                              </li>
                            ))}
                          </ul>
                          <div className="ai-result-actions">
                            <a
                              className="button-secondary button-compact"
                              href={externo.url}
                              target="_blank"
                              rel="noopener noreferrer nofollow"
                            >
                              Ver no site de origem
                            </a>
                          </div>
                        </div>
                      </article>
                    );
                  }
                  const { property, matchReasons } = linha.proprio;
                  return (
                  <article className="ai-result" key={property.id}>
                    <div className="ai-result-image">
                      {property.images[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={property.images[0]} alt="" loading="lazy" />
                      ) : (
                        <AreaSearch width={28} height={28} aria-hidden="true" />
                      )}
                    </div>
                    <div className="ai-result-body">
                      <div className="ai-result-top">
                        <div>
                          <span className="ai-result-code">
                            {property.code}
                          </span>
                          <span
                            className="ai-result-status"
                            data-status={property.status}
                          >
                            {PROPERTY_STATUS_LABELS[property.status]}
                          </span>
                        </div>
                        <strong>
                          {formatPropertyPrice(property.price)}
                          {property.purpose === "RENT" && <small>/mês</small>}
                        </strong>
                      </div>
                      <h3>{property.title}</h3>
                      <p className="ai-result-location">
                        <MapPin width={14} height={14} aria-hidden="true" />
                        {property.addressNeighborhood}, {property.addressCity}
                      </p>
                      <p className="ai-result-specs">
                        {property.bedrooms} quartos<span>·</span>
                        {property.parkingSpots} vagas<span>·</span>
                        {property.areaBuilt} m²
                      </p>
                      <ul
                        className="ai-match-reasons"
                        aria-label={`Destaques de ${property.code}`}
                      >
                        {matchReasons.slice(0, 3).map((reason) => (
                          <li key={reason}>
                            <Check width={14} height={14} aria-hidden="true" />
                            {reason}
                          </li>
                        ))}
                      </ul>
                      <div className="ai-result-actions">
                        <details className="ai-result-details">
                          <summary>
                            Ver detalhes
                            <NavArrowDown
                              width={14}
                              height={14}
                              aria-hidden="true"
                            />
                          </summary>
                          <div>
                            <p>{property.description}</p>
                            {property.amenities.length > 0 && (
                              <p>{property.amenities.join(" · ")}</p>
                            )}
                            {property.brokerName && (
                              <p>Responsável: {property.brokerName}</p>
                            )}
                          </div>
                        </details>
                        <button
                          type="button"
                          className="button-secondary button-compact"
                          aria-label={`Copiar imóvel ${property.code}`}
                          onClick={() => void copyProperty(property)}
                        >
                          <Copy width={15} height={15} aria-hidden="true" />
                          {copyFeedback?.id === property.id &&
                          !copyFeedback.error
                            ? "Copiado"
                            : "Copiar imóvel"}
                        </button>
                      </div>
                      {copyFeedback?.id === property.id &&
                        copyFeedback.error && (
                          <p className="ai-search-error" role="alert">
                            Não foi possível copiar. Tente novamente.
                          </p>
                        )}
                    </div>
                  </article>
                  );
                })}
              </div>
            )}
          </section>
        )
      )}
    </div>
  );
}

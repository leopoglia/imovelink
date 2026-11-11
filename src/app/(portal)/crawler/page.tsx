"use client";

import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Globe,
  Internet,
  Refresh,
  RefreshDouble,
  Trash,
} from "iconoir-react";
import { useTenantStore } from "@/store/tenant-store";
import { apiFetch } from "@/lib/api";
import { hasPermission } from "@/lib/auth/rbac";
import type { ExternalListing, ExternalSource } from "@/types/domain";
import type {
  ExtractedListing,
  ExtractionMap,
} from "@/server/services/listing-extraction";

const moeda = (valor: number | null) =>
  valor === null
    ? "—"
    : valor.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 0,
      });

interface Analise {
  listUrl: string;
  extractionMap: ExtractionMap;
  sample: ExtractedListing[];
  total: number;
  paginationTemplate: string | null;
  paginationReason: string | null;
}

async function enviar(body: unknown) {
  const res = await apiFetch("/api/crawler", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const dados = await res.json();
  if (!res.ok) throw new Error(dados.error ?? "Não foi possível concluir.");
  return dados;
}

export default function CrawlerPage() {
  const { currentUser, currentTenant } = useTenantStore();
  const queryClient = useQueryClient();
  const [listUrl, setListUrl] = useState("");
  const [nome, setNome] = useState("");
  const [analise, setAnalise] = useState<Analise | null>(null);
  const [maxPages, setMaxPages] = useState(5);
  const [erro, setErro] = useState("");

  const podeGerenciar = hasPermission(currentUser.role, "crawler:manage");
  const chave = ["crawler", currentTenant.id];

  const { data } = useQuery<{
    sources: ExternalSource[];
    listings: ExternalListing[];
  }>({
    queryKey: chave,
    enabled: podeGerenciar,
    queryFn: async () => {
      const res = await apiFetch("/api/crawler");
      if (!res.ok) throw new Error("Não foi possível carregar as fontes.");
      return res.json();
    },
  });

  const invalidar = () => queryClient.invalidateQueries({ queryKey: chave });
  const falhar = (e: unknown) =>
    setErro(e instanceof Error ? e.message : "Falha inesperada.");

  const analisar = useMutation({
    mutationFn: async () => enviar({ action: "ANALYZE", listUrl }),
    onMutate: () => {
      setErro("");
      setAnalise(null);
    },
    onSuccess: (resultado: Analise) => {
      setAnalise(resultado);
      if (!nome) setNome(new URL(resultado.listUrl).hostname);
    },
    onError: falhar,
  });

  const salvar = useMutation({
    mutationFn: async () =>
      enviar({
        action: "SAVE",
        name: nome,
        listUrl: analise!.listUrl,
        extractionMap: analise!.extractionMap,
        paginationTemplate: analise!.paginationTemplate,
        maxPages,
      }),
    onSuccess: () => {
      setAnalise(null);
      setListUrl("");
      setNome("");
      invalidar();
    },
    onError: falhar,
  });

  const acao = useMutation({
    mutationFn: async (body: {
      action: string;
      sourceId: string;
      active?: boolean;
    }) => enviar(body),
    onMutate: () => setErro(""),
    onSuccess: invalidar,
    onError: falhar,
  });

  // Uma única mutação atende todas as fontes; as variáveis em voo dizem qual
  // delas está processando, para o carregamento não contaminar as outras.
  const emAcao = acao.isPending ? acao.variables : null;
  const ocupada = (id: string) => emAcao?.sourceId === id;
  const rotuloDaAcao = (id: string) =>
    !ocupada(id)
      ? null
      : emAcao?.action === "COLLECT"
        ? "Coletando anúncios…"
        : emAcao?.action === "REMOVE"
          ? "Removendo…"
          : "Atualizando…";

  if (!podeGerenciar)
    return (
      <div className="dashboard">
        <div className="page-heading">
          <h1>Crawler</h1>
        </div>
        <p className="ai-search-note">
          Apenas gestores e administradores podem cadastrar fontes externas.
        </p>
      </div>
    );

  const fontes = data?.sources ?? [];
  const anuncios = data?.listings ?? [];

  return (
    <div className="dashboard">
      <div className="page-heading">
        <div>
          <h1>Crawler</h1>
          <p className="ai-search-note">
            Indexe anúncios de outros sites. O Imovelink guarda apenas os dados
            e o link: fotos e descrição permanecem na origem.
          </p>
        </div>
      </div>

      <section className="ai-search-box" aria-labelledby="nova-fonte">
        <h2 id="nova-fonte" className="stat-label">
          Nova fonte
        </h2>
        <form
          onSubmit={(evento) => {
            evento.preventDefault();
            if (listUrl.trim() && !analisar.isPending) analisar.mutate();
          }}
          className="crawler-form"
        >
          <input
            type="url"
            value={listUrl}
            onChange={(evento) => setListUrl(evento.target.value)}
            placeholder="https://www.exemplo.com/imoveis"
            aria-label="Endereço da página de listagem"
            required
          />
          <button
            type="submit"
            className="button-primary"
            disabled={analisar.isPending}
          >
            <Internet aria-hidden="true" width={15} height={15} />
            {analisar.isPending ? "Analisando…" : "Analisar"}
          </button>
        </form>

        {erro && <p className="ai-search-error">{erro}</p>}

        {analise && (
          <div className="crawler-preview">
            <p className="ai-search-note">
              Encontrei <strong>{analise.total}</strong> anúncios nesta página.
              Confira a amostra antes de salvar.
            </p>
            <p className="ai-search-note">
              {analise.paginationTemplate ? (
                <>
                  Paginação detectada:{" "}
                  <code>{analise.paginationTemplate}</code>. A coleta vai
                  percorrer até o limite de páginas definido abaixo.
                </>
              ) : (
                "Não encontrei paginação: a coleta vai ler apenas esta página."
              )}
            </p>
            <div className="crawler-table-scroll">
              <table className="crawler-table">
                <caption className="sr-only">Amostra dos anúncios lidos</caption>
                <thead>
                  <tr>
                    <th scope="col">Título</th>
                    <th scope="col">Preço</th>
                    <th scope="col">Local</th>
                    <th scope="col">Quartos</th>
                    <th scope="col">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {analise.sample.map((anuncio) => (
                    <tr key={anuncio.url}>
                      <td>{anuncio.title}</td>
                      <td>{moeda(anuncio.price ?? null)}</td>
                      <td>
                        {[anuncio.neighborhood, anuncio.city]
                          .filter(Boolean)
                          .join(", ") || "—"}
                      </td>
                      <td>{anuncio.bedrooms ?? "—"}</td>
                      <td>
                        <a
                          href={anuncio.url}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                        >
                          abrir
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="crawler-form">
              <input
                value={nome}
                onChange={(evento) => setNome(evento.target.value)}
                aria-label="Nome da fonte"
                placeholder="Nome da fonte"
                maxLength={120}
              />
              {analise.paginationTemplate && (
                <label className="crawler-max-pages">
                  Máximo de páginas
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={maxPages}
                    onChange={(evento) =>
                      setMaxPages(Number(evento.target.value) || 1)
                    }
                  />
                </label>
              )}
              <button
                type="button"
                className="button-primary"
                onClick={() => salvar.mutate()}
                disabled={salvar.isPending || nome.trim().length < 2}
              >
                {salvar.isPending ? "Salvando…" : "Salvar fonte"}
              </button>
              <button
                type="button"
                className="button-secondary"
                onClick={() => setAnalise(null)}
              >
                Descartar
              </button>
            </div>
          </div>
        )}
      </section>

      <section aria-labelledby="fontes">
        <div className="section-heading">
          <h2 id="fontes">Fontes cadastradas</h2>
          <span className="ai-search-note">
            {anuncios.length} anúncios indexados
          </span>
        </div>
        {!fontes.length && (
          <p className="ai-search-note">
            Nenhuma fonte ainda. Analise uma página acima para começar.
          </p>
        )}
        <ul className="crawler-sources">
          {fontes.map((fonte) => (
            <li
              key={fonte.id}
              className={`crawler-source${ocupada(fonte.id) ? " is-busy" : ""}`}
              aria-busy={ocupada(fonte.id)}
            >
              <div>
                <strong>
                  <Globe aria-hidden="true" width={14} height={14} />{" "}
                  {fonte.name}
                </strong>
                <a
                  href={fonte.listUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="crawler-source-url"
                >
                  {fonte.listUrl}
                </a>
                <span className="ai-search-note">
                  {anuncios.filter((a) => a.sourceId === fonte.id).length}{" "}
                  anúncios ·{" "}
                  {fonte.lastCrawledAt
                    ? `coletado em ${new Date(fonte.lastCrawledAt).toLocaleString("pt-BR")}`
                    : "nunca coletado"}
                  {fonte.paginationTemplate
                    ? ` · até ${fonte.maxPages} páginas`
                    : " · página única"}
                  {!fonte.active && " · pausada"}
                </span>
                {rotuloDaAcao(fonte.id) && (
                  <span className="crawler-progress" role="status">
                    <RefreshDouble
                      aria-hidden="true"
                      width={13}
                      height={13}
                      className="ai-search-spinner"
                    />
                    {rotuloDaAcao(fonte.id)}
                  </span>
                )}
                {fonte.lastError && !ocupada(fonte.id) && (
                  <span className="ai-search-error">
                    Última falha: {fonte.lastError}
                  </span>
                )}
              </div>
              <div className="crawler-source-actions">
                <button
                  type="button"
                  className="button-secondary"
                  disabled={acao.isPending}
                  onClick={() =>
                    acao.mutate({ action: "COLLECT", sourceId: fonte.id })
                  }
                >
                  <Refresh aria-hidden="true" width={14} height={14} />
                  {ocupada(fonte.id) && emAcao?.action === "COLLECT"
                    ? "Coletando…"
                    : "Coletar"}
                </button>
                <button
                  type="button"
                  className="button-secondary"
                  disabled={acao.isPending}
                  onClick={() =>
                    acao.mutate({
                      action: "SET_ACTIVE",
                      sourceId: fonte.id,
                      active: !fonte.active,
                    })
                  }
                >
                  {fonte.active ? "Pausar" : "Retomar"}
                </button>
                <button
                  type="button"
                  className="button-danger"
                  disabled={acao.isPending}
                  onClick={() =>
                    acao.mutate({ action: "REMOVE", sourceId: fonte.id })
                  }
                >
                  <Trash aria-hidden="true" width={14} height={14} />
                  Remover
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

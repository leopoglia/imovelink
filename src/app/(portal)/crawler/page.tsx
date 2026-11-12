"use client";

import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Globe,
  Internet,
  Refresh,
  NavArrowDown,
  RefreshDouble,
  Trash,
  Xmark,
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
  logoUrl: string | null;
  purpose: "SALE" | "RENT" | null;
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
  const [logoUrl, setLogoUrl] = useState("");
  const [finalidade, setFinalidade] = useState<"SALE" | "RENT" | "">("");
  const [fonteAberta, setFonteAberta] = useState<string | null>(null);
  const dialogo = useRef<HTMLDialogElement>(null);
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

  // invalidateQueries devolve promise; nada depende do fim dela, mas uma
  // rejeição solta não pode ficar sem tratamento.
  const invalidar = () => {
    void queryClient.invalidateQueries({ queryKey: chave });
  };
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
      setLogoUrl(resultado.logoUrl ?? "");
      setFinalidade(resultado.purpose ?? "");
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
        logoUrl: logoUrl.trim() || null,
        purpose: finalidade || null,
        paginationTemplate: analise!.paginationTemplate,
        maxPages,
      }),
    onSuccess: () => {
      setAnalise(null);
      setListUrl("");
      setNome("");
      setLogoUrl("");
      setFinalidade("");
      invalidar();
    },
    onError: falhar,
  });

  const acao = useMutation({
    mutationFn: async (body: {
      action: string;
      sourceId: string;
      active?: boolean;
      maxPages?: number;
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

  // showModal dá foco preso e fechamento por Escape sem código extra.
  useEffect(() => {
    const caixa = dialogo.current;
    if (!caixa) return;
    if (fonteAberta && !caixa.open) caixa.showModal();
    if (!fonteAberta && caixa.open) caixa.close();
  }, [fonteAberta]);

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
  const fonteDetalhada = fontes.find((fonte) => fonte.id === fonteAberta);
  const anunciosDaFonte = anuncios.filter(
    (anuncio) => anuncio.sourceId === fonteAberta,
  );

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
              {logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt=""
                  className="crawler-logo-preview"
                  onError={() => setLogoUrl("")}
                />
              )}
              <input
                value={nome}
                onChange={(evento) => setNome(evento.target.value)}
                aria-label="Nome da fonte"
                placeholder="Nome da fonte"
                maxLength={120}
              />
              <label className="crawler-max-pages">
                Finalidade
                <select
                  value={finalidade}
                  onChange={(evento) =>
                    setFinalidade(evento.target.value as "SALE" | "RENT" | "")
                  }
                >
                  <option value="">Não definida</option>
                  <option value="SALE">Venda</option>
                  <option value="RENT">Locação</option>
                </select>
              </label>
              <input
                type="url"
                value={logoUrl}
                onChange={(evento) => setLogoUrl(evento.target.value)}
                aria-label="Endereço do logo da imobiliária"
                placeholder="Logo (detectado automaticamente)"
                maxLength={2000}
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
                <button
                  type="button"
                  className="crawler-source-toggle"
                  aria-expanded={fonteAberta === fonte.id}
                  onClick={() =>
                    setFonteAberta(fonteAberta === fonte.id ? null : fonte.id)
                  }
                >
                  {fonte.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={fonte.logoUrl}
                      alt=""
                      className="crawler-logo-preview"
                    />
                  ) : (
                    <Globe aria-hidden="true" width={14} height={14} />
                  )}
                  <strong>{fonte.name}</strong>
                  <NavArrowDown
                    aria-hidden="true"
                    width={14}
                    height={14}
                    className={
                      fonteAberta === fonte.id ? "is-open" : undefined
                    }
                  />
                </button>
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
                  {fonte.purpose === "SALE"
                    ? " · venda"
                    : fonte.purpose === "RENT"
                      ? " · locação"
                      : " · finalidade não definida"}
                  {!fonte.paginationTemplate && " · página única"}
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
                {fonte.paginationTemplate && (
                  <label className="crawler-max-pages">
                    Páginas
                    <input
                      type="number"
                      min={1}
                      max={200}
                      defaultValue={fonte.maxPages}
                      disabled={acao.isPending}
                      aria-label={"Máximo de páginas de " + fonte.name}
                      onBlur={(evento) => {
                        const valor = Number(evento.target.value);
                        if (
                          Number.isInteger(valor) &&
                          valor >= 1 &&
                          valor <= 200 &&
                          valor !== fonte.maxPages
                        )
                          acao.mutate({
                            action: "SET_MAX_PAGES",
                            sourceId: fonte.id,
                            maxPages: valor,
                          });
                      }}
                    />
                  </label>
                )}
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
                    : fonte.lastCrawledAt
                      ? "Atualizar"
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

      <dialog
        ref={dialogo}
        className="crawler-dialog"
        aria-labelledby="dialogo-fonte"
        onClose={() => setFonteAberta(null)}
        // Clicar fora da caixa fecha, como se espera de um modal.
        onClick={(evento) => {
          if (evento.target === dialogo.current) dialogo.current?.close();
        }}
      >
        {fonteDetalhada && (
          <>
            <header className="crawler-dialog-header">
              <div>
                <h2 id="dialogo-fonte">{fonteDetalhada.name}</h2>
                <a
                  href={fonteDetalhada.listUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="crawler-source-url"
                >
                  {fonteDetalhada.listUrl}
                </a>
              </div>
              <button
                type="button"
                className="button-secondary button-compact"
                onClick={() => dialogo.current?.close()}
              >
                <Xmark aria-hidden="true" width={15} height={15} />
                Fechar
              </button>
            </header>

            <p className="ai-search-note">
              {anunciosDaFonte.length} anúncios indexados ·{" "}
              {fonteDetalhada.lastCrawledAt
                ? `última coleta em ${new Date(fonteDetalhada.lastCrawledAt).toLocaleString("pt-BR")}`
                : "nunca coletado"}
            </p>

            {!anunciosDaFonte.length ? (
              <p className="ai-search-note">
                Nada coletado ainda nesta fonte.
              </p>
            ) : (
              <div className="crawler-table-scroll">
                <table className="crawler-table">
                  <caption className="sr-only">
                    Anúncios indexados desta fonte
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Título</th>
                      <th scope="col">Preço</th>
                      <th scope="col">Local</th>
                      <th scope="col">Quartos</th>
                      <th scope="col">Vagas</th>
                      <th scope="col">Área</th>
                      <th scope="col">Visto em</th>
                      <th scope="col">Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {anunciosDaFonte.map((anuncio) => (
                      <tr key={anuncio.id}>
                        <td>{anuncio.title}</td>
                        <td>{moeda(anuncio.price)}</td>
                        <td>
                          {[anuncio.neighborhood, anuncio.city]
                            .filter(Boolean)
                            .join(", ") || "—"}
                        </td>
                        <td>{anuncio.bedrooms ?? "—"}</td>
                        <td>{anuncio.parkingSpots ?? "—"}</td>
                        <td>
                          {anuncio.areaTotal ? `${anuncio.areaTotal} m²` : "—"}
                        </td>
                        <td>
                          {new Date(anuncio.lastSeenAt).toLocaleDateString(
                            "pt-BR",
                          )}
                        </td>
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
            )}
          </>
        )}
      </dialog>
    </div>
  );
}

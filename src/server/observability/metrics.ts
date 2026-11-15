import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from "prom-client";

/**
 * Métricas no formato que o Prometheus lê.
 *
 * O registro vive no escopo global porque o Next recria módulos a cada
 * recompilação em desenvolvimento; sem isso, cada reload tentaria registrar as
 * mesmas métricas de novo e os contadores voltariam a zero.
 */

declare global {
  var __IMOVELINK_METRICS__: Metricas | undefined;
}

export interface Metricas {
  registry: Registry;
  requisicoes: Counter<"rota" | "metodo" | "status">;
  duracao: Histogram<"rota" | "metodo">;
  bancoDisponivel: Gauge<string>;
  anunciosExternos: Gauge<"fonte">;
  coletas: Counter<"resultado">;
}

function criar(): Metricas {
  const registry = new Registry();
  registry.setDefaultLabels({ aplicacao: "imovelink" });
  // Memória, uso de CPU, atraso do event loop e coleta de lixo do Node.
  collectDefaultMetrics({ register: registry, prefix: "imovelink_" });

  const requisicoes = new Counter({
    name: "imovelink_http_requisicoes_total",
    help: "Requisições atendidas pelas rotas de API, por rota, método e status",
    labelNames: ["rota", "metodo", "status"] as const,
    registers: [registry],
  });

  const duracao = new Histogram({
    name: "imovelink_http_duracao_segundos",
    help: "Tempo de resposta das rotas de API",
    labelNames: ["rota", "metodo"] as const,
    // Faixas escolhidas para o perfil real: a busca com IA passa de 1s.
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [registry],
  });

  const bancoDisponivel = new Gauge({
    name: "imovelink_banco_disponivel",
    help: "1 quando o PostgreSQL respondeu à última verificação, 0 quando não",
    registers: [registry],
  });

  const anunciosExternos = new Gauge({
    name: "imovelink_anuncios_externos",
    help: "Anúncios indexados pelo crawler, por fonte",
    labelNames: ["fonte"] as const,
    registers: [registry],
  });

  const coletas = new Counter({
    name: "imovelink_coletas_total",
    help: "Coletas do crawler concluídas, por resultado",
    labelNames: ["resultado"] as const,
    registers: [registry],
  });

  return {
    registry,
    requisicoes,
    duracao,
    bancoDisponivel,
    anunciosExternos,
    coletas,
  };
}

export function metricas(): Metricas {
  globalThis.__IMOVELINK_METRICS__ ??= criar();
  return globalThis.__IMOVELINK_METRICS__;
}

/**
 * Envolve o tratamento de uma rota para contar chamadas e medir o tempo.
 * A rota é informada pelo chamador, e não lida da URL, para não criar uma
 * série nova a cada identificador — o que inflaria a base do Prometheus.
 */
export async function observarRota<T extends { status: number }>(
  rota: string,
  metodo: string,
  executar: () => Promise<T>,
): Promise<T> {
  const m = metricas();
  const fim = m.duracao.startTimer({ rota, metodo });
  let status = 500;
  try {
    const resposta = await executar();
    status = resposta.status;
    return resposta;
  } finally {
    fim();
    m.requisicoes.inc({ rota, metodo, status: String(status) });
  }
}

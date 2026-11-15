import { beforeEach, describe, expect, it } from "vitest";
import { metricas, observarRota } from "@/server/observability/metrics";

beforeEach(() => {
  metricas().registry.resetMetrics();
});

describe("Registro de métricas", () => {
  it("é o mesmo entre chamadas, para os contadores não zerarem", () => {
    // O Next recria módulos a cada recompilação; o registro vive no global.
    expect(metricas()).toBe(metricas());
  });

  it("expõe as métricas padrão do Node junto das do projeto", async () => {
    const texto = await metricas().registry.metrics();
    expect(texto).toContain("imovelink_process_cpu_seconds_total");
    expect(texto).toContain("imovelink_http_requisicoes_total");
  });

  it("marca todas as séries com o nome da aplicação", async () => {
    metricas().bancoDisponivel.set(1);
    expect(await metricas().registry.metrics()).toContain(
      'aplicacao="imovelink"',
    );
  });
});

describe("Observação de uma rota", () => {
  it("conta a chamada com rota, método e status", async () => {
    await observarRota("/api/properties", "GET", async () => ({ status: 200 }));
    const texto = await metricas().registry.metrics();
    expect(texto).toContain(
      'imovelink_http_requisicoes_total{rota="/api/properties",metodo="GET",status="200",aplicacao="imovelink"} 1',
    );
  });

  it("devolve a resposta original sem alterá-la", async () => {
    const resposta = await observarRota("/api/x", "POST", async () => ({
      status: 201,
      corpo: "ok",
    }));
    expect(resposta).toEqual({ status: 201, corpo: "ok" });
  });

  it("registra status 500 e propaga quando a rota lança", async () => {
    await expect(
      observarRota("/api/x", "GET", async () => {
        throw new Error("falhou");
      }),
    ).rejects.toThrow("falhou");
    const texto = await metricas().registry.metrics();
    expect(texto).toContain('status="500"');
  });

  it("mede o tempo de resposta no histograma", async () => {
    await observarRota("/api/x", "GET", async () => ({ status: 200 }));
    const texto = await metricas().registry.metrics();
    expect(texto).toContain("imovelink_http_duracao_segundos_count");
    expect(texto).toContain("imovelink_http_duracao_segundos_bucket");
  });

  it("acumula chamadas da mesma rota em vez de criar séries novas", async () => {
    for (let i = 0; i < 3; i++)
      await observarRota("/api/properties", "GET", async () => ({
        status: 200,
      }));
    const texto = await metricas().registry.metrics();
    expect(texto).toContain(
      'imovelink_http_requisicoes_total{rota="/api/properties",metodo="GET",status="200",aplicacao="imovelink"} 3',
    );
  });
});

describe("Medidas de estado", () => {
  it("representa banco fora do ar como zero", async () => {
    metricas().bancoDisponivel.set(0);
    expect(await metricas().registry.metrics()).toContain(
      'imovelink_banco_disponivel{aplicacao="imovelink"} 0',
    );
  });

  it("conta anúncios externos por fonte", async () => {
    metricas().anunciosExternos.set({ fonte: "fonte-a" }, 120);
    metricas().anunciosExternos.set({ fonte: "fonte-b" }, 18);
    const texto = await metricas().registry.metrics();
    expect(texto).toContain('fonte="fonte-a",aplicacao="imovelink"} 120');
    expect(texto).toContain('fonte="fonte-b",aplicacao="imovelink"} 18');
  });

  it("separa coletas bem-sucedidas das que falharam", async () => {
    metricas().coletas.inc({ resultado: "sucesso" });
    metricas().coletas.inc({ resultado: "falha" });
    metricas().coletas.inc({ resultado: "sucesso" });
    const texto = await metricas().registry.metrics();
    expect(texto).toContain('resultado="sucesso",aplicacao="imovelink"} 2');
    expect(texto).toContain('resultado="falha",aplicacao="imovelink"} 1');
  });
});

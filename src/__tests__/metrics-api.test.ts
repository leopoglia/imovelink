import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/metrics/route";
import { metricas } from "@/server/observability/metrics";
import { externalSourceRepository } from "@/server/repositories/external-source.repository";
import {
  getPostgres,
  isPostgresConfigured,
} from "@/server/database/postgres";
import type { ExternalListing } from "@/types/domain";

vi.mock("@/server/repositories/external-source.repository", () => ({
  externalSourceRepository: { listAllListings: vi.fn(async () => []) },
}));
vi.mock("@/server/database/postgres", () => ({
  isPostgresConfigured: vi.fn(() => false),
  getPostgres: vi.fn(),
}));

const anuncio = (sourceId: string): ExternalListing =>
  ({ id: Math.random().toString(), sourceId }) as ExternalListing;

beforeEach(() => {
  vi.clearAllMocks();
  metricas().registry.resetMetrics();
  vi.mocked(isPostgresConfigured).mockReturnValue(false);
  vi.mocked(externalSourceRepository.listAllListings).mockResolvedValue([]);
});

describe("Endpoint de métricas", () => {
  it("responde no formato que o Prometheus lê", async () => {
    const resposta = await GET();
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("Content-Type")).toContain("text/plain");
    expect(resposta.headers.get("Cache-Control")).toBe("no-store");
  });

  it("inclui as métricas do processo e da aplicação", async () => {
    const texto = await (await GET()).text();
    expect(texto).toContain("imovelink_process_cpu_seconds_total");
    expect(texto).toContain("imovelink_banco_disponivel");
  });

  it("marca o banco como indisponível quando não há conexão configurada", async () => {
    const texto = await (await GET()).text();
    expect(texto).toContain('imovelink_banco_disponivel{aplicacao="imovelink"} 0');
  });

  it("marca o banco como disponível quando ele responde", async () => {
    vi.mocked(isPostgresConfigured).mockReturnValue(true);
    vi.mocked(getPostgres).mockReturnValue(
      (async () => [{ "?column?": 1 }]) as unknown as ReturnType<
        typeof getPostgres
      >,
    );
    const texto = await (await GET()).text();
    expect(texto).toContain('imovelink_banco_disponivel{aplicacao="imovelink"} 1');
  });

  it("marca indisponível quando a consulta ao banco falha", async () => {
    vi.mocked(isPostgresConfigured).mockReturnValue(true);
    vi.mocked(getPostgres).mockReturnValue(
      (async () => {
        throw new Error("conexão recusada");
      }) as unknown as ReturnType<typeof getPostgres>,
    );
    const texto = await (await GET()).text();
    expect(texto).toContain('imovelink_banco_disponivel{aplicacao="imovelink"} 0');
  });

  it("conta os anúncios externos agrupados por fonte", async () => {
    vi.mocked(externalSourceRepository.listAllListings).mockResolvedValue([
      anuncio("fonte-a"),
      anuncio("fonte-a"),
      anuncio("fonte-b"),
    ]);
    const texto = await (await GET()).text();
    expect(texto).toContain('fonte="fonte-a",aplicacao="imovelink"} 2');
    expect(texto).toContain('fonte="fonte-b",aplicacao="imovelink"} 1');
  });

  it("não deixa a falha ao contar anúncios derrubar as demais métricas", async () => {
    vi.mocked(externalSourceRepository.listAllListings).mockRejectedValue(
      new Error("banco fora"),
    );
    const resposta = await GET();
    expect(resposta.status).toBe(200);
    expect(await resposta.text()).toContain("imovelink_process_cpu_seconds_total");
  });

  it("esquece fontes removidas em vez de manter o valor antigo", async () => {
    vi.mocked(externalSourceRepository.listAllListings).mockResolvedValue([
      anuncio("fonte-a"),
    ]);
    await GET();
    vi.mocked(externalSourceRepository.listAllListings).mockResolvedValue([
      anuncio("fonte-b"),
    ]);
    const texto = await (await GET()).text();
    expect(texto).toContain('fonte="fonte-b"');
    expect(texto).not.toContain('fonte="fonte-a"');
  });
});

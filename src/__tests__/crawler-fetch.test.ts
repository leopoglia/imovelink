import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buscarListagem,
  FetchError,
  USER_AGENT,
  validarUrlPublica,
} from "@/server/services/crawler-fetch";

const resposta = (corpo: string, tipo = "text/html; charset=utf-8", ok = true) =>
  new Response(corpo, {
    status: ok ? 200 : 500,
    headers: { "content-type": tipo },
  });

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("Validação da URL informada pelo administrador", () => {
  it("aceita endereço público http e https", () => {
    expect(validarUrlPublica("https://www.poderimoveis.com/imoveis").hostname)
      .toBe("www.poderimoveis.com");
    expect(validarUrlPublica("http://exemplo.com.br/lista").protocol).toBe(
      "http:",
    );
  });

  it("recusa endereços da própria máquina e da rede interna", () => {
    for (const alvo of [
      "http://localhost:3000/imoveis",
      "http://127.0.0.1/",
      "http://10.0.0.5/",
      "http://192.168.1.10/",
      "http://172.16.0.1/",
      "http://[::1]/",
      "http://servico.internal/",
    ]) {
      expect(() => validarUrlPublica(alvo)).toThrow(FetchError);
    }
  });

  it("recusa o endereço de metadados de instância em nuvem", () => {
    // 169.254.169.254 expõe credenciais da máquina em AWS, GCP e Azure.
    expect(() => validarUrlPublica("http://169.254.169.254/latest/meta-data/"))
      .toThrowError(expect.objectContaining({ code: "PRIVATE_HOST" }));
  });

  it("recusa esquemas que não sejam http ou https", () => {
    expect(() => validarUrlPublica("file:///etc/passwd")).toThrowError(
      expect.objectContaining({ code: "UNSUPPORTED_SCHEME" }),
    );
    expect(() => validarUrlPublica("ftp://exemplo.com/x")).toThrowError(
      expect.objectContaining({ code: "UNSUPPORTED_SCHEME" }),
    );
  });

  it("recusa credenciais embutidas na URL", () => {
    expect(() => validarUrlPublica("https://user:senha@exemplo.com/")).
      toThrowError(expect.objectContaining({ code: "CREDENTIALS_IN_URL" }));
  });

  it("recusa texto que não é URL", () => {
    expect(() => validarUrlPublica("poderimoveis.com")).toThrowError(
      expect.objectContaining({ code: "INVALID_URL" }),
    );
  });
});

describe("Busca da listagem", () => {
  it("identifica-se e devolve o HTML quando o robots permite", async () => {
    const chamadas: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (entrada: URL | string) => {
        const alvo = String(entrada);
        chamadas.push(alvo);
        if (alvo.endsWith("/robots.txt"))
          return resposta("User-agent: *\nAllow: /", "text/plain");
        return resposta("<html><body>ok</body></html>");
      }),
    );
    const r = await buscarListagem("https://exemplo.com/imoveis");
    expect(r.html).toContain("ok");
    expect(chamadas[0]).toBe("https://exemplo.com/robots.txt");
    const cabecalhos = vi.mocked(fetch).mock.calls[1][1]?.headers as Record<
      string,
      string
    >;
    expect(cabecalhos["User-Agent"]).toBe(USER_AGENT);
  });

  it("não busca a página quando o robots proíbe o caminho", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (entrada: URL | string) =>
        String(entrada).endsWith("/robots.txt")
          ? resposta("User-agent: *\nDisallow: /imoveis", "text/plain")
          : resposta("<html>não deveria chegar aqui</html>"),
      ),
    );
    await expect(buscarListagem("https://exemplo.com/imoveis")).rejects
      .toThrowError(expect.objectContaining({ code: "BLOCKED_BY_ROBOTS" }));
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it("segue em frente quando o site não tem robots.txt", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (entrada: URL | string) =>
        String(entrada).endsWith("/robots.txt")
          ? resposta("", "text/plain", false)
          : resposta("<html>livre</html>"),
      ),
    );
    await expect(buscarListagem("https://exemplo.com/imoveis")).resolves
      .toMatchObject({ html: "<html>livre</html>" });
  });

  it("repassa o intervalo mínimo pedido pelo site", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (entrada: URL | string) =>
        String(entrada).endsWith("/robots.txt")
          ? resposta("User-agent: *\nCrawl-delay: 3", "text/plain")
          : resposta("<html>ok</html>"),
      ),
    );
    expect((await buscarListagem("https://exemplo.com/x")).crawlDelay).toBe(3);
  });

  it("recusa resposta que não é HTML", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (entrada: URL | string) =>
        String(entrada).endsWith("/robots.txt")
          ? resposta("", "text/plain")
          : resposta("{}", "application/json"),
      ),
    );
    await expect(buscarListagem("https://exemplo.com/x")).rejects.toThrowError(
      expect.objectContaining({ code: "NOT_HTML" }),
    );
  });

  it("distingue página inexistente de erro do servidor de origem", async () => {
    const comStatus = (status: number) =>
      vi.fn(async (entrada: URL | string) =>
        String(entrada).endsWith("/robots.txt")
          ? resposta("", "text/plain")
          : new Response("", {
              status,
              headers: { "content-type": "text/html" },
            }),
      );
    vi.stubGlobal("fetch", comStatus(404));
    await expect(buscarListagem("https://exemplo.com/x")).rejects.toThrowError(
      expect.objectContaining({ code: "NOT_FOUND" }),
    );
    vi.stubGlobal("fetch", comStatus(503));
    await expect(buscarListagem("https://exemplo.com/x")).rejects.toThrowError(
      expect.objectContaining({ code: "UPSTREAM_ERROR" }),
    );
  });

  it("transforma falha de rede em erro tratado", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (entrada: URL | string) => {
        if (String(entrada).endsWith("/robots.txt"))
          return resposta("", "text/plain");
        throw new TypeError("conexão recusada");
      }),
    );
    await expect(buscarListagem("https://exemplo.com/x")).rejects.toThrowError(
      expect.objectContaining({ code: "NETWORK_ERROR" }),
    );
  });

  it("nem tenta buscar quando a URL é interna", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await expect(buscarListagem("http://127.0.0.1/imoveis")).rejects
      .toThrowError(expect.objectContaining({ code: "PRIVATE_HOST" }));
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});

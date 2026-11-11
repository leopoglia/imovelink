import { parseRobots, podeBuscar } from "./robots";

/**
 * Busca de páginas para a coleta de anúncios.
 *
 * A URL vem de um administrador, então o servidor não pode buscar qualquer
 * endereço: sem essa checagem o campo viraria um proxy para a rede interna
 * (SSRF). Também respeitamos robots.txt antes de qualquer requisição à página.
 */

export const USER_AGENT =
  "ImovelinkBot/0.1 (+https://github.com/leopoglia/imovelink)";
const LIMITE_BYTES = 3_000_000;
const TEMPO_LIMITE_MS = 20_000;

export class FetchError extends Error {
  code: string;
  constructor(code: string) {
    super("Não foi possível buscar esta página.");
    this.code = code;
  }
}

/** Endereços que nunca podem ser alvo: locais, privados e metadados de nuvem. */
function hostInterno(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host.endsWith(".internal") || host.endsWith(".local")) return true;
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd"))
    return true;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!ipv4) return false;
  const [a, b] = ipv4.slice(1).map(Number);
  return (
    a === 0 ||
    a === 127 ||
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) // metadados de instância em nuvem
  );
}

/**
 * Aceita apenas http(s) público e sem credenciais embutidas.
 * A checagem é pelo nome do host; um domínio que resolva para IP interno por
 * DNS não é coberto aqui e depende da rede do ambiente.
 */
export function validarUrlPublica(valor: string): URL {
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    throw new FetchError("INVALID_URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new FetchError("UNSUPPORTED_SCHEME");
  if (url.username || url.password) throw new FetchError("CREDENTIALS_IN_URL");
  if (hostInterno(url.hostname)) throw new FetchError("PRIVATE_HOST");
  return url;
}

async function baixar(url: URL, signal: AbortSignal): Promise<string> {
  const resposta = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    redirect: "follow",
    cache: "no-store",
    signal,
  });
  if (!resposta.ok)
    throw new FetchError(
      resposta.status === 404 ? "NOT_FOUND" : "UPSTREAM_ERROR",
    );
  const tipo = resposta.headers.get("content-type") ?? "";
  if (!tipo.includes("text/html") && !tipo.includes("text/plain"))
    throw new FetchError("NOT_HTML");
  const texto = await resposta.text();
  if (texto.length > LIMITE_BYTES) throw new FetchError("TOO_LARGE");
  return texto;
}

/** Lê o robots.txt da origem. Ausente ou ilegível significa sem restrição. */
export async function carregarRobots(url: URL, signal: AbortSignal) {
  try {
    const resposta = await fetch(new URL("/robots.txt", url.origin), {
      headers: { "User-Agent": USER_AGENT },
      redirect: "follow",
      cache: "no-store",
      signal,
    });
    if (!resposta.ok) return parseRobots("");
    return parseRobots(await resposta.text());
  } catch {
    return parseRobots("");
  }
}

/**
 * Busca a listagem respeitando o robots.txt da origem.
 * Devolve o HTML e o intervalo mínimo pedido pelo site, para a coleta espaçar
 * as próximas páginas.
 */
export async function buscarListagem(
  valor: string,
  signal?: AbortSignal,
): Promise<{ url: URL; html: string; crawlDelay?: number }> {
  const url = validarUrlPublica(valor);
  const prazo = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(TEMPO_LIMITE_MS)])
    : AbortSignal.timeout(TEMPO_LIMITE_MS);

  const regras = await carregarRobots(url, prazo);
  if (!podeBuscar(url.pathname, regras))
    throw new FetchError("BLOCKED_BY_ROBOTS");

  try {
    const html = await baixar(url, prazo);
    return { url, html, crawlDelay: regras.crawlDelay };
  } catch (erro) {
    if (erro instanceof FetchError) throw erro;
    throw new FetchError(prazo.aborted ? "TIMEOUT" : "NETWORK_ERROR");
  }
}

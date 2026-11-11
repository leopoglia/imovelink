/**
 * Leitura de robots.txt segundo o padrão de exclusão de robôs.
 * O coletor só busca uma página quando esta função autoriza.
 */

export interface RobotsRules {
  /** Prefixos de caminho proibidos para o nosso agente. */
  disallow: string[];
  /** Prefixos liberados que vencem um Disallow mais curto. */
  allow: string[];
  /** Intervalo mínimo entre requisições pedido pelo site, em segundos. */
  crawlDelay?: number;
}

const AGENTE = "imovelinkbot";

/**
 * Interpreta o texto do robots.txt e devolve as regras que se aplicam a nós.
 * Um grupo com o nosso nome vence o grupo coringa "*"; sem nenhum dos dois,
 * nada é proibido.
 */
export function parseRobots(texto: string): RobotsRules {
  const grupos = new Map<string, RobotsRules>();
  let agentesDoGrupo: string[] = [];
  let aceitandoRegras = false;

  for (const bruta of texto.split(/\r?\n/)) {
    const linha = bruta.split("#")[0].trim();
    if (!linha) continue;
    const separador = linha.indexOf(":");
    if (separador === -1) continue;
    const campo = linha.slice(0, separador).trim().toLowerCase();
    const valor = linha.slice(separador + 1).trim();

    if (campo === "user-agent") {
      // Agentes listados em sequência compartilham o mesmo bloco de regras.
      if (aceitandoRegras) agentesDoGrupo = [];
      agentesDoGrupo.push(valor.toLowerCase());
      aceitandoRegras = false;
      for (const agente of agentesDoGrupo)
        if (!grupos.has(agente)) grupos.set(agente, { disallow: [], allow: [] });
      continue;
    }
    if (!agentesDoGrupo.length) continue;
    aceitandoRegras = true;
    for (const agente of agentesDoGrupo) {
      const regras = grupos.get(agente)!;
      if (campo === "disallow" && valor) regras.disallow.push(valor);
      else if (campo === "allow" && valor) regras.allow.push(valor);
      else if (campo === "crawl-delay") {
        const segundos = Number(valor.replace(",", "."));
        if (Number.isFinite(segundos) && segundos >= 0)
          regras.crawlDelay = segundos;
      }
    }
  }

  return grupos.get(AGENTE) ?? grupos.get("*") ?? { disallow: [], allow: [] };
}

/**
 * Decide se um caminho pode ser buscado. Entre regras concorrentes vence a de
 * prefixo mais longo, e em empate vence o Allow — como fazem os buscadores.
 */
export function podeBuscar(caminho: string, regras: RobotsRules): boolean {
  const alvo = caminho || "/";
  const maior = (lista: string[]) =>
    lista
      .filter((regra) => alvo.startsWith(regra))
      .reduce((maximo, regra) => Math.max(maximo, regra.length), -1);

  const proibido = maior(regras.disallow);
  if (proibido === -1) return true;
  return maior(regras.allow) >= proibido;
}

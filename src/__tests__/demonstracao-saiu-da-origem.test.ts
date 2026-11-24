/**
 * Demonstração de ponta a ponta do aviso "Saiu do site de origem".
 *
 * Roda a coleta, a extração, a paginação, o repositório e a API de verdade,
 * sobre o catálogo em memória. Só a ida à internet (a página do site e o seu
 * robots.txt) é simulada, para que o anúncio possa sair do ar e voltar sob
 * comando. Para mostrar à banca:
 *
 *   npm run demo
 *
 * Cada "it" é um passo da história e roda na ordem em que está escrito.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/properties/route";
import { requireSession } from "@/server/services/auth.service";
import { buscarListagem } from "@/server/services/crawler-fetch";
import { crawlerService } from "@/server/services/crawler.service";
import { propertyService } from "@/server/services/property.service";
import { externalSourceRepository } from "@/server/repositories/external-source.repository";
import { SEED_TENANTS, SEED_USERS } from "@/server/seeds/seed-jaragua";
import type { ExternalListing, Property } from "@/types/domain";

vi.mock("@/server/services/auth.service", async (original) => ({
  ...(await original<typeof import("@/server/services/auth.service")>()),
  requireSession: vi.fn(),
}));
// Só a ida à internet é trocada; extração, paginação e gravação são as reais.
vi.mock("@/server/services/crawler-fetch", async (original) => ({
  ...(await original<typeof import("@/server/services/crawler-fetch")>()),
  buscarListagem: vi.fn(),
}));

const imobiliaria = SEED_TENANTS[0];
const gestor = SEED_USERS[0];
const FONTE = "99999999-9999-4999-8999-999999999999";
const SITE = "https://imobiliaria-exemplo.com.br";
const LISTAGEM = `${SITE}/imoveis/venda`;

/** O que o site de exemplo publica agora, por página. */
let paginasNoAr: string[][] = [];

const card = (codigo: string) =>
  `<div class="card"><a href="/imovel/${codigo}"></a><h2>Casa ${codigo} no Centro</h2><span class="preco">R$ 650.000</span><span class="bairro">Centro</span></div>`;

function publicar(...paginas: string[][]) {
  paginasNoAr = paginas;
}

/** Simula o site: página 1 na listagem, as outras em ?page=N, 404 depois da última. */
vi.mocked(buscarListagem).mockImplementation(async (alvo: string) => {
  const url = new URL(alvo);
  const numero = Number(url.searchParams.get("page") ?? 1);
  const pagina = paginasNoAr[numero - 1];
  if (!pagina)
    throw Object.assign(new Error("Página não existe"), { code: "NOT_FOUND" });
  return { url, html: `<main>${pagina.map(card).join("")}</main>` };
});

async function carteiraVistaPeloCorretor() {
  const resposta = await GET(
    new NextRequest("http://localhost/api/properties?includeExternal=true"),
  );
  return (await resposta.json()) as {
    properties: Property[];
    externalListings: ExternalListing[];
  };
}

const coletar = () =>
  crawlerService.coletar(gestor.role, imobiliaria.id, FONTE);

let trazido: Property;

describe("Demonstração: imóvel trazido de outro site que sai da origem", () => {
  beforeAll(async () => {
    globalThis.__IMOVELINK_DB__ = undefined;
    vi.mocked(requireSession).mockResolvedValue({
      tenant: imobiliaria,
      user: gestor,
    });
    await externalSourceRepository.create({
      id: FONTE,
      tenantId: imobiliaria.id,
      name: "Imobiliária Exemplo",
      listUrl: LISTAGEM,
      extractionMap: {
        item: "div.card",
        fields: {
          url: { selector: "a", attr: "href" },
          title: { selector: "h2" },
          price: { selector: ".preco" },
          neighborhood: { selector: ".bairro" },
        },
      },
      logoUrl: null,
      purpose: "SALE",
      paginationTemplate: `${LISTAGEM}?page={n}`,
      maxPages: 10,
      active: true,
      lastCrawledAt: null,
      lastError: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  it("1. a primeira coleta lê as duas páginas do site e indexa 3 anúncios", async () => {
    publicar(["A1", "A2"], ["A3"]);
    const resultado = await coletar();
    expect(resultado).toMatchObject({
      collected: 3,
      complete: true,
      removed: 0,
    });
    const { externalListings } = await carteiraVistaPeloCorretor();
    expect(externalListings.map((l) => l.url).sort()).toEqual([
      `${SITE}/imovel/A1`,
      `${SITE}/imovel/A2`,
      `${SITE}/imovel/A3`,
    ]);
  }, 20_000);

  it("2. o corretor traz o anúncio A2 para a carteira, e ele deixa de aparecer como externo", async () => {
    trazido = await propertyService.createProperty({
      tenantId: imobiliaria.id,
      userId: gestor.id,
      userName: gestor.name,
      userRole: gestor.role,
      title: "Casa A2 no Centro",
      description: "Casa trazida de outro site para a carteira.",
      type: "HOUSE",
      purpose: "SALE",
      price: 650000,
      bedrooms: 3,
      suites: 1,
      bathrooms: 2,
      parkingSpots: 2,
      areaTotal: 300,
      areaBuilt: 150,
      addressStreet: "",
      addressNeighborhood: "Centro",
      amenities: [],
      sourceListingUrl: `${SITE}/imovel/A2`,
    });
    const { properties, externalListings } = await carteiraVistaPeloCorretor();
    const naCarteira = properties.find((p) => p.id === trazido.id);
    expect(naCarteira?.sourceListingUrl).toBe(`${SITE}/imovel/A2`);
    expect(naCarteira?.sourceListingRemoved).toBeUndefined();
    expect(externalListings.map((l) => l.url)).not.toContain(
      `${SITE}/imovel/A2`,
    );
  });

  it("3. a outra imobiliária vende o A2; a coleta seguinte nota a ausência", async () => {
    publicar(["A1"], ["A3"]);
    const resultado = await coletar();
    expect(resultado).toMatchObject({
      collected: 2,
      complete: true,
      removed: 1,
    });
  }, 20_000);

  it("4. o imóvel da carteira passa a mostrar o aviso, e o status continua Disponível", async () => {
    const { properties } = await carteiraVistaPeloCorretor();
    const naCarteira = properties.find((p) => p.id === trazido.id);
    expect(naCarteira?.sourceListingRemoved).toBe(true);
    expect(naCarteira?.status).toBe("AVAILABLE");
  });

  it("5. se a coleta for interrompida no meio, nada é marcado", async () => {
    publicar(["A1"], ["A3"]);
    vi.mocked(buscarListagem).mockImplementationOnce(async (alvo: string) => ({
      url: new URL(alvo),
      html: `<main>${card("A1")}</main>`,
    }));
    vi.mocked(buscarListagem).mockImplementationOnce(async () => {
      throw Object.assign(new Error("Tempo esgotado"), { code: "TIMEOUT" });
    });
    const resultado = await coletar();
    expect(resultado).toMatchObject({ complete: false, removed: 0 });
  }, 20_000);

  it("6. se o anúncio voltar ao ar, o aviso some sozinho", async () => {
    publicar(["A1", "A2"], ["A3"]);
    await coletar();
    const { properties } = await carteiraVistaPeloCorretor();
    expect(
      properties.find((p) => p.id === trazido.id)?.sourceListingRemoved,
    ).toBeUndefined();
  }, 20_000);
});

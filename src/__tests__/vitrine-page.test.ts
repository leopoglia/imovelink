// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import VitrinePage from "@/app/vitrine/[slug]/page";
import { tenantRepository } from "@/server/repositories/tenant.repository";
import { propertyService } from "@/server/services/property.service";
import { SEED_PROPERTIES, SEED_TENANTS } from "@/server/seeds/seed-jaragua";
import type { Property } from "@/types/domain";

vi.mock("@/server/repositories/tenant.repository", () => ({
  tenantRepository: { findTenantBySlug: vi.fn() },
}));
vi.mock("@/server/services/property.service", () => ({
  propertyService: { listProperties: vi.fn() },
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const tenant = SEED_TENANTS[0];
const imovel = (extra: Partial<Property>): Property => ({
  ...structuredClone(SEED_PROPERTIES[0]),
  ...extra,
});

async function abrirVitrine(slug = tenant.slug) {
  const pagina = await VitrinePage({ params: Promise.resolve({ slug }) });
  return render(pagina);
}

/** O bloco de microdados que os buscadores leem. */
function microdados(container: HTMLElement) {
  const bloco = container.querySelector('script[type="application/ld+json"]');
  return {
    texto: bloco?.innerHTML ?? "",
    dados: JSON.parse(bloco?.textContent ?? "{}"),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("APP_ORIGIN", "https://imovelink.site");
  vi.mocked(tenantRepository.findTenantBySlug).mockResolvedValue(tenant);
  vi.mocked(propertyService.listProperties).mockResolvedValue([
    imovel({ id: "p1", code: "IMV-201", title: "Casa disponível" }),
    imovel({
      id: "p2",
      code: "IMV-202",
      title: "Apartamento reservado",
      status: "RESERVED",
    }),
    imovel({
      id: "p3",
      code: "IMV-203",
      title: "Sobrado vendido",
      status: "SOLD",
    }),
  ]);
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("Vitrine pública da imobiliária", () => {
  it("mostra a imobiliária e só os imóveis disponíveis ou reservados", async () => {
    await abrirVitrine();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Imóveis à venda em Jaraguá do Sul",
      }),
    ).toBeTruthy();
    expect(screen.getAllByText(tenant.name).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Casa disponível").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Apartamento reservado").length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("Sobrado vendido")).toBeNull();
    expect(propertyService.listProperties).toHaveBeenCalledWith(tenant.id);
  });

  it("publica microdados com o endereço real do site", async () => {
    const { container } = await abrirVitrine();
    const { dados } = microdados(container);
    const [agencia, ...anuncios] = dados["@graph"];

    expect(agencia["@type"]).toBe("RealEstateAgent");
    expect(agencia["@id"]).toBe(
      `https://imovelink.site/vitrine/${tenant.slug}#agency`,
    );
    expect(anuncios.map((item: { url: string }) => item.url)).toEqual([
      `https://imovelink.site/vitrine/${tenant.slug}#IMV-201`,
      `https://imovelink.site/vitrine/${tenant.slug}#IMV-202`,
    ]);
    expect(JSON.stringify(dados)).not.toContain("imovelink.com.br");
  });

  it("não deixa o texto de um imóvel encerrar a tag de microdados", async () => {
    vi.mocked(propertyService.listProperties).mockResolvedValue([
      imovel({
        id: "p1",
        code: "IMV-201",
        description: 'Casa ampla</script><script>alert("x")</script>',
      }),
    ]);
    const { container } = await abrirVitrine();
    const { texto, dados } = microdados(container);

    expect(texto).not.toContain("<");
    expect(dados["@graph"][1].description).toBe(
      'Casa ampla</script><script>alert("x")</script>',
    );
    expect(container.querySelectorAll("script")).toHaveLength(1);
  });

  it("é pública: não tem botão de volta para o painel", async () => {
    const { container } = await abrirVitrine();
    expect(screen.queryByText("Painel do Corretor")).toBeNull();
    const links = [...container.querySelectorAll("a")].map((a) =>
      a.getAttribute("href"),
    );
    expect(links).not.toContain("/");
    expect(links.some((href) => href?.startsWith("/imoveis"))).toBe(false);
  });

  it("usa o título, a capa e o texto que o gestor configurou", async () => {
    vi.mocked(tenantRepository.findTenantBySlug).mockResolvedValue({
      ...tenant,
      branding: {
        ...tenant.branding,
        headline: "Seu próximo endereço",
        coverImageUrl: "https://example.com/capa.jpg",
        about: "Atendemos desde 2010.",
      },
    });
    const { container } = await abrirVitrine();
    expect(
      screen.getByRole("heading", { level: 1, name: "Seu próximo endereço" }),
    ).toBeTruthy();
    expect(container.querySelector(".vitrine-capa-foto")?.getAttribute("src")).toBe(
      "https://example.com/capa.jpg",
    );
    expect(screen.getByText("Atendemos desde 2010.")).toBeTruthy();
  });

  it("não leva o visitante ao WhatsApp: o interesse vira contato no formulário", async () => {
    const { container } = await abrirVitrine();
    const links = [...container.querySelectorAll("a")].map(
      (a) => a.getAttribute("href") ?? "",
    );
    expect(links.some((href) => href.includes("wa.me"))).toBe(false);
    expect(screen.queryByText(/whatsapp/i, { selector: "a, a *" })).toBeNull();

    const interesse = screen.getByRole("link", {
      name: "Tenho interesse em Casa disponível",
    });
    expect(interesse.getAttribute("href")).toBe("#busca");
    fireEvent.click(interesse);
    expect(
      (screen.getByLabelText("O que você procura? *") as HTMLTextAreaElement)
        .value,
    ).toBe("Tenho interesse no imóvel IMV-201: Casa disponível.");
  });

  it("não mostra os imóveis que o gestor escondeu", async () => {
    vi.mocked(tenantRepository.findTenantBySlug).mockResolvedValue({
      ...tenant,
      branding: { ...tenant.branding, hiddenPropertyIds: ["p2"] },
    });
    const { container } = await abrirVitrine();
    expect(screen.queryByText("Apartamento reservado")).toBeNull();
    expect(microdados(container).dados["@graph"]).toHaveLength(2);
  });

  it("responde página não encontrada para uma imobiliária inexistente", async () => {
    vi.mocked(tenantRepository.findTenantBySlug).mockResolvedValue(undefined);
    await expect(abrirVitrine("nao-existe")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(propertyService.listProperties).not.toHaveBeenCalled();
  });
});

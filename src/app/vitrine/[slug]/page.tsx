import React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChatBubble, Mail, MapPin, Phone, ShieldCheck } from "iconoir-react";
import { tenantRepository } from "@/server/repositories/tenant.repository";
import { propertyService } from "@/server/services/property.service";
import { VitrineLeadCapture } from "@/components/vitrine/vitrine-lead-capture";
import { VitrineImoveis } from "@/components/vitrine/vitrine-imoveis";
import { jsonLd, publicOrigin } from "@/lib/structured-data";
import {
  corDoTextoSobre,
  corValida,
  imoveisDaVitrine,
  siglaDaImobiliaria,
  tituloDaVitrine,
} from "@/lib/vitrine";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tenant = await tenantRepository.findTenantBySlug(slug);
  if (!tenant) notFound();

  const descricao =
    tenant.branding.tagline ||
    `Imóveis à venda em ${tenant.city}/${tenant.state}.`;
  return {
    title: `${tenant.name} | Imóveis em ${tenant.city}/${tenant.state}`,
    description: descricao,
    openGraph: {
      title: `${tenant.name}: ${tituloDaVitrine(tenant)}`,
      description: descricao,
      type: "website",
      locale: "pt_BR",
      images: tenant.branding.coverImageUrl
        ? [tenant.branding.coverImageUrl]
        : undefined,
    },
  };
}

export default async function VitrinePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tenant = await tenantRepository.findTenantBySlug(slug);
  if (!tenant) notFound();

  const marca = tenant.branding;
  const properties = imoveisDaVitrine(
    await propertyService.listProperties(tenant.id),
    marca.hiddenPropertyIds,
  );
  const bairros = new Set(
    properties.map((p) => p.addressNeighborhood.trim().toLowerCase()),
  );
  const cor = corValida(marca.primaryColor);
  const estiloDaMarca = {
    "--vitrine-cor": cor,
    "--vitrine-cor-texto": corDoTextoSobre(cor),
  } as React.CSSProperties;
  const capa = marca.coverImageUrl?.trim();

  const vitrineUrl = `${publicOrigin()}/vitrine/${tenant.slug}`;
  const schemaOrgJsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "RealEstateAgent",
        "@id": `${vitrineUrl}#agency`,
        name: tenant.name,
        description: marca.tagline,
        telephone: marca.phone,
        email: marca.email,
        address: {
          "@type": "PostalAddress",
          streetAddress: marca.address,
          addressLocality: tenant.city,
          addressRegion: tenant.state,
          addressCountry: "BR",
        },
      },
      ...properties.map((prop) => ({
        "@type": "RealEstateListing",
        "@id": `${vitrineUrl}#${prop.code}`,
        name: prop.title,
        description: prop.description,
        url: `${vitrineUrl}#${prop.code}`,
        datePosted: prop.createdAt,
        offers: {
          "@type": "Offer",
          price: prop.price,
          priceCurrency: "BRL",
          availability:
            prop.status === "AVAILABLE"
              ? "https://schema.org/InStock"
              : "https://schema.org/Reserved",
        },
        geo: {
          "@type": "GeoCoordinates",
          latitude: prop.latitude,
          longitude: prop.longitude,
        },
      })),
    ],
  };

  return (
    <div className="vitrine-page" style={estiloDaMarca}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(schemaOrgJsonLd) }}
      />

      <header className="vitrine-topo">
        <div className="vitrine-largura vitrine-topo-conteudo">
          <a href="#inicio" className="vitrine-marca">
            <span className="vitrine-sigla" aria-hidden="true">
              {siglaDaImobiliaria(tenant)}
            </span>
            <span className="vitrine-marca-nome">{tenant.name}</span>
          </a>
          <nav className="vitrine-menu" aria-label="Seções da vitrine">
            <a href="#imoveis">Imóveis</a>
            <a href="#busca">Encontrar imóvel</a>
            <a href="#contato">Contato</a>
          </nav>
          <a
            href="#busca"
            className="vitrine-botao vitrine-botao-cheio vitrine-topo-acao"
          >
            <ChatBubble aria-hidden="true" width={16} height={16} />
            Fale conosco
          </a>
        </div>
      </header>

      <section
        id="inicio"
        className={`vitrine-capa${capa ? " tem-foto" : ""}`}
        aria-labelledby="vitrine-titulo"
      >
        {capa && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={capa} alt="" className="vitrine-capa-foto" />
        )}
        <div className="vitrine-largura vitrine-capa-conteudo">
          <p className="vitrine-capa-selo">
            <ShieldCheck aria-hidden="true" width={15} height={15} />
            {tenant.creci ? `Imobiliária com ${tenant.creci}` : tenant.name}
          </p>
          <h1 id="vitrine-titulo">{tituloDaVitrine(tenant)}</h1>
          {marca.tagline && (
            <p className="vitrine-capa-subtitulo">{marca.tagline}</p>
          )}
          <div className="vitrine-capa-acoes">
            <a href="#imoveis" className="vitrine-botao vitrine-botao-cheio">
              Ver imóveis
            </a>
            <a href="#busca" className="vitrine-botao vitrine-botao-vazado">
              Conte o que você procura
            </a>
          </div>
          <dl className="vitrine-numeros">
            <div>
              <dt>Imóveis à venda</dt>
              <dd>{properties.length}</dd>
            </div>
            <div>
              <dt>{bairros.size === 1 ? "Bairro" : "Bairros"}</dt>
              <dd>{bairros.size}</dd>
            </div>
            <div>
              <dt>Cidade</dt>
              <dd>
                {tenant.city}/{tenant.state}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <main>
        <section
          id="imoveis"
          className="vitrine-secao"
          aria-labelledby="titulo-imoveis"
        >
          <div className="vitrine-largura">
            <div className="vitrine-secao-topo">
              <h2 id="titulo-imoveis">Imóveis à venda</h2>
              <p>
                {properties.length === 1
                  ? "1 imóvel selecionado pela nossa equipe."
                  : `${properties.length} imóveis selecionados pela nossa equipe.`}
              </p>
            </div>
            <VitrineImoveis imoveis={properties} />
          </div>
        </section>

        <section
          id="busca"
          className="vitrine-secao vitrine-secao-busca"
          aria-labelledby="titulo-busca"
        >
          <div className="vitrine-largura vitrine-busca">
            <div className="vitrine-busca-texto">
              <h2 id="titulo-busca">Não achou o que procura?</h2>
              <p>
                Descreva o imóvel dos seus sonhos com as suas palavras. Nossa
                busca inteligente mostra as opções mais parecidas e um corretor
                fala com você.
              </p>
            </div>
            <VitrineLeadCapture tenantId={tenant.id} />
          </div>
        </section>

        <section
          id="contato"
          className="vitrine-secao"
          aria-labelledby="titulo-contato"
        >
          <div className="vitrine-largura vitrine-sobre">
            <div>
              <h2 id="titulo-contato">Sobre a {tenant.name}</h2>
              <p className="vitrine-sobre-texto">
                {marca.about?.trim() ||
                  marca.tagline ||
                  `Imobiliária em ${tenant.city}/${tenant.state}.`}
              </p>
            </div>
            <ul className="vitrine-contatos">
              {marca.phone && (
                <li>
                  <Phone aria-hidden="true" width={18} height={18} />
                  <a href={`tel:${marca.phone.replace(/[^\d+]/g, "")}`}>
                    {marca.phone}
                  </a>
                </li>
              )}
              {marca.email && (
                <li>
                  <Mail aria-hidden="true" width={18} height={18} />
                  <a href={`mailto:${marca.email}`}>{marca.email}</a>
                </li>
              )}
              {marca.address && (
                <li>
                  <MapPin aria-hidden="true" width={18} height={18} />
                  <span>{marca.address}</span>
                </li>
              )}
            </ul>
          </div>
        </section>
      </main>

      <footer className="vitrine-rodape">
        <div className="vitrine-largura vitrine-rodape-conteudo">
          <span>
            {[tenant.name, tenant.creci].filter(Boolean).join(" · ")}
          </span>
          <span>
            © {new Date().getFullYear()} · Vitrine criada com Imovelink
          </span>
        </div>
      </footer>
    </div>
  );
}

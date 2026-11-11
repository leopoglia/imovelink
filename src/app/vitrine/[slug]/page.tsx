import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, Phone, ShieldCheck } from "iconoir-react";
import { tenantRepository } from "@/server/repositories/tenant.repository";
import { propertyService } from "@/server/services/property.service";
import { VitrineLeadCapture } from "@/components/vitrine/vitrine-lead-capture";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tenant = await tenantRepository.findTenantBySlug(slug);
  if (!tenant) notFound();

  return {
    title: `${tenant.name} | Imóveis em ${tenant.city}/${tenant.state} — Imovelink`,
    description: `${tenant.branding.tagline}. Confira nosso portfólio verificado (${tenant.creci}) com busca assistida por Inteligência Artificial.`,
    openGraph: {
      title: `${tenant.name} — Portfólio Oficial de Imóveis`,
      description: tenant.branding.tagline,
      type: "website",
      locale: "pt_BR",
    },
  };
}

export default async function VitrineB2BWhiteLabelPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tenant = await tenantRepository.findTenantBySlug(slug);
  if (!tenant) notFound();

  const properties = (await propertyService.listProperties(tenant.id)).filter(
    (p) => p.status === "AVAILABLE" || p.status === "RESERVED",
  );

  const schemaOrgJsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "RealEstateAgent",
        "@id": `https://imovelink.com.br/vitrine/${tenant.slug}#agency`,
        name: tenant.name,
        description: tenant.branding.tagline,
        telephone: tenant.branding.phone,
        email: tenant.branding.email,
        address: {
          "@type": "PostalAddress",
          streetAddress: tenant.branding.address,
          addressLocality: tenant.city,
          addressRegion: tenant.state,
          addressCountry: "BR",
        },
      },
      ...properties.map((prop) => ({
        "@type": "RealEstateListing",
        "@id": `https://imovelink.com.br/vitrine/${tenant.slug}#${prop.code}`,
        name: prop.title,
        description: prop.description,
        url: `https://imovelink.com.br/vitrine/${tenant.slug}#${prop.code}`,
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
    <div className="vitrine-page min-h-screen text-slate-900">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaOrgJsonLd) }}
      />

      {/* Barra Superior Discreta */}
      <div className="bg-white border-b border-slate-200/80 text-slate-500 px-6 py-2.5 flex justify-end text-xs">
        <Link href="/" className="button-secondary button-compact">
          <ArrowLeft aria-hidden="true" className="w-3.5 h-3.5" />
          Painel do Corretor
        </Link>
      </div>

      {/* Header da Imobiliária */}
      <header className="border-b border-slate-200/80 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center font-semibold text-base text-white"
              style={{
                backgroundColor:
                  tenant.branding.primaryColor.toLowerCase() === "#0d9488"
                    ? "var(--accent)"
                    : tenant.branding.primaryColor,
              }}
            >
              {tenant.branding.logoText || "IMV"}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl font-semibold text-slate-900">
                  {tenant.name}
                </h1>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200/60 flex items-center gap-1 font-medium">
                  <ShieldCheck aria-hidden="true" className="w-3.5 h-3.5" />
                  {tenant.creci}
                </span>
              </div>
              <p className="text-sm text-slate-500 mt-0.5">
                {tenant.branding.tagline}
              </p>
            </div>
          </div>

          <div className="px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200/70 text-xs">
            <span className="text-slate-400 block">Atendimento</span>
            <strong className="text-slate-800 flex items-center gap-1.5 mt-0.5 font-semibold">
              <Phone
                aria-hidden="true"
                className="w-3.5 h-3.5 text-brand-600"
              />
              {tenant.branding.phone}
            </strong>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 space-y-12">
        <VitrineLeadCapture tenantId={tenant.id} />

        <section className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Imóveis em {tenant.city}, {tenant.state}
              </h2>
            </div>
            <span className="text-xs text-slate-400">
              {properties.length} imóveis
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {properties.map((prop) => (
              <article
                key={prop.id}
                id={prop.code}
                className="rounded-2xl bg-white border border-slate-200/80 overflow-hidden flex flex-col justify-between hover:border-slate-300 transition"
              >
                <div>
                  <div className="relative h-48 bg-slate-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={prop.images[0]}
                      alt={prop.title}
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-white/95 text-xs font-semibold text-slate-800">
                      {prop.code}
                    </span>
                    <span className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-brand-600 text-white text-xs font-semibold">
                      R$ {prop.price.toLocaleString("pt-BR")}
                    </span>
                  </div>

                  <div className="p-5 space-y-2.5">
                    <div className="text-xs text-slate-500 flex items-center gap-1">
                      <MapPin
                        aria-hidden="true"
                        className="w-3.5 h-3.5 text-brand-600"
                      />
                      {prop.addressNeighborhood}, {prop.addressCity}
                    </div>
                    <h3 className="text-sm font-semibold text-slate-900 line-clamp-2">
                      {prop.title}
                    </h3>
                    <p className="text-xs text-slate-500 line-clamp-2">
                      {prop.description}
                    </p>
                  </div>
                </div>

                <div className="px-5 py-3.5 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <span>
                    {prop.bedrooms} dorms ({prop.suites} suítes)
                  </span>
                  <span>{prop.parkingSpots} vagas</span>
                  <span>{prop.areaBuilt} m²</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <footer className="border-t border-slate-200 pt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <span>
            {tenant.name} · {tenant.creci}
          </span>
        </footer>
      </main>
    </div>
  );
}

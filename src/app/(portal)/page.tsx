"use client";

import React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Building,
  CheckCircle,
  ClockRotateRight,
  MapPin,
  Search,
} from "iconoir-react";
import { useTenantStore } from "@/store/tenant-store";
import { apiFetch } from "@/lib/api";
import { Property, PropertyAuditLog } from "@/types/domain";

const currency = (value: number) =>
  value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });

export default function DashboardHomePage() {
  const { currentTenant } = useTenantStore();
  const {
    data: propData,
    isPending: propertiesPending,
    isError: propertiesError,
  } = useQuery<{ properties: Property[]; auditLogs: PropertyAuditLog[] }>({
    queryKey: ["properties", currentTenant.id],
    queryFn: async () => {
      const res = await apiFetch(
        "/api/properties?includeAudit=true",
      );
      if (!res.ok) throw new Error("Não foi possível carregar os imóveis.");
      return res.json();
    },
  });

  const properties = propData?.properties ?? [];
  const auditLogs = propData?.auditLogs ?? [];
  const available = properties.filter((p) => p.status === "AVAILABLE");
  const totalVgv = properties.reduce((total, p) => total + p.price, 0);
  const reserved = properties.filter(
    (property) => property.status === "RESERVED",
  );
  const sold = properties.filter((property) => property.status === "SOLD");
  const featured = [...available]
    .sort((a, b) => Number(b.featured) - Number(a.featured))
    .slice(0, 3);

  return (
    <div className="dashboard">
      <div className="page-heading">
        <div>
          <h1>Visão geral</h1>
        </div>
        <div className="heading-actions">
          <Link href="/imoveis" className="button-secondary">
            <Building aria-hidden="true" width={15} height={15} />
            Gerenciar imóveis
          </Link>
          <Link href="/busca-ia" className="button-primary">
            <Search aria-hidden="true" width={15} height={15} />
            Busca inteligente
          </Link>
        </div>
      </div>

      <dl className="stat-grid" aria-label="Indicadores da imobiliária">
        <div className="stat-card">
          <dt className="stat-label">Imóveis disponíveis</dt>
          <dd className="stat-value">
            {propertiesPending || propertiesError ? "—" : available.length}
            <small>
              de{" "}
              {propertiesPending || propertiesError ? "—" : properties.length}{" "}
              imóveis
            </small>
          </dd>
        </div>
        <div className="stat-card">
          <dt className="stat-label">Valor em carteira</dt>
          <dd className="stat-value">
            {propertiesPending || propertiesError
              ? "—"
              : totalVgv >= 1_000_000
                ? `R$ ${(totalVgv / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}`
                : currency(totalVgv)}
            {totalVgv >= 1_000_000 && <small>milhões</small>}
          </dd>
        </div>
        <div className="stat-card">
          <dt className="stat-label">Imóveis reservados</dt>
          <dd className="stat-value">
            {propertiesPending || propertiesError ? "—" : reserved.length}
          </dd>
        </div>
        <div className="stat-card">
          <dt className="stat-label">Imóveis vendidos</dt>
          <dd className="stat-value">
            {propertiesPending || propertiesError ? "—" : sold.length}
          </dd>
        </div>
      </dl>

      <section aria-labelledby="portfolio-heading">
        <div className="section-heading">
          <div>
            <h2 id="portfolio-heading">Imóveis disponíveis</h2>
          </div>
          <Link href="/imoveis" className="text-link">
            Ver portfólio
          </Link>
        </div>
        <div className="portfolio-preview">
          {featured.map((property) => (
            <Link
              href="/imoveis"
              className="preview-card"
              key={property.id}
              aria-label={`Ver ${property.title}`}
            >
              <div className="preview-image">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={property.images[0]}
                  alt={property.title}
                  loading="lazy"
                />
                <span className="preview-code">{property.code}</span>
              </div>
              <div className="preview-body">
                <span className="preview-location">
                  <MapPin aria-hidden="true" width={11} height={11} />
                  {property.addressNeighborhood}, {property.addressCity}
                </span>
                <h3>{property.title}</h3>
                <div className="preview-bottom">
                  <strong>{currency(property.price)}</strong>
                  <small>
                    {property.bedrooms} quartos · {property.areaBuilt} m²
                  </small>
                </div>
              </div>
            </Link>
          ))}
        </div>
        {!featured.length && (
          <div className="panel empty-state">
            {propertiesPending
              ? "Carregando seu portfólio…"
              : propertiesError
                ? "Erro ao carregar imóveis."
                : "Nenhum imóvel disponível."}
          </div>
        )}
      </section>

      <section className="panel" aria-labelledby="activity-heading">
        <div className="panel-heading">
          <div>
            <h2 id="activity-heading">Atividade recente</h2>
          </div>
          <Link href="/imoveis" className="text-link">
            Ver histórico
          </Link>
        </div>
        <div className="activity-list">
          {auditLogs.slice(0, 3).map((log) => (
            <div className="activity-item" key={log.id}>
              <CheckCircle aria-hidden="true" width={15} height={15} />
              <div>
                <p>
                  <strong>{log.propertyCode}</strong> · {log.summary}
                </p>
                <small>{log.userName}</small>
              </div>
            </div>
          ))}
        </div>
        {!auditLogs.length && (
          <p className="empty-state">
            <ClockRotateRight
              aria-hidden="true"
              width={15}
              height={15}
              className="inline mr-2"
            />
            {propertiesPending
              ? "Carregando atividades…"
              : propertiesError
                ? "Não foi possível carregar as atividades."
                : "Nenhuma atividade."}
          </p>
        )}
      </section>
    </div>
  );
}

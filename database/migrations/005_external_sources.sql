-- Agregação de anúncios de terceiros: o sistema indexa e aponta para a origem,
-- nunca copia fotos ou descrição. Fica separado de imovelink.properties para não
-- misturar anúncio externo com o portfólio do corretor nem com a trilha de auditoria.
CREATE TABLE imovelink.external_sources (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES imovelink.tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    list_url TEXT NOT NULL,
    -- Mapa de extração inferido uma vez e reaplicado de forma determinística.
    extraction_map JSONB,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    last_crawled_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, list_url)
);
CREATE INDEX external_sources_tenant ON imovelink.external_sources(tenant_id, active);

CREATE TABLE imovelink.external_listings (
    id UUID PRIMARY KEY,
    source_id UUID NOT NULL REFERENCES imovelink.external_sources(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES imovelink.tenants(id) ON DELETE CASCADE,
    -- URL do anúncio na origem: é para lá que o usuário é enviado.
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    price NUMERIC(14, 2),
    neighborhood TEXT,
    city TEXT,
    bedrooms INTEGER,
    parking_spots INTEGER,
    area_total NUMERIC(10, 2),
    -- Digest do conteúdo extraído: permite detectar mudança sem comparar campo a campo.
    content_hash TEXT NOT NULL,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (source_id, url)
);
CREATE INDEX external_listings_tenant_seen ON imovelink.external_listings(tenant_id, last_seen_at DESC);
CREATE INDEX external_listings_source ON imovelink.external_listings(source_id);

REVOKE ALL ON ALL TABLES IN SCHEMA imovelink FROM PUBLIC;

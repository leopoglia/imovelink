-- Venda ou locação. Sem isso o valor mensal de um aluguel seria comparado com
-- preços de venda na busca, trazendo resultados sem sentido.
ALTER TABLE imovelink.external_sources
    ADD COLUMN purpose TEXT CHECK (purpose IN ('SALE', 'RENT'));
ALTER TABLE imovelink.external_listings
    ADD COLUMN purpose TEXT CHECK (purpose IN ('SALE', 'RENT'));
CREATE INDEX external_listings_tenant_purpose
    ON imovelink.external_listings(tenant_id, purpose);

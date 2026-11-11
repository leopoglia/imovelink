-- A URL identifica o imóvel. Duas fontes que encontram o mesmo anúncio não
-- devem gerar duas linhas: num agregador isso aparece como imóvel repetido.
-- A chave passa de (source_id, url) para (tenant_id, url).
SET LOCAL lock_timeout = '5s';
LOCK TABLE imovelink.external_listings IN ACCESS EXCLUSIVE MODE;

-- Remove as repetições já gravadas, preservando o registro mais antigo de cada
-- imóvel para não perder a data do primeiro avistamento.
DELETE FROM imovelink.external_listings a
USING imovelink.external_listings b
WHERE a.tenant_id = b.tenant_id
  AND a.url = b.url
  AND (a.first_seen_at, a.id) > (b.first_seen_at, b.id);

ALTER TABLE imovelink.external_listings
    DROP CONSTRAINT IF EXISTS external_listings_source_id_url_key,
    ADD CONSTRAINT external_listings_tenant_url_key UNIQUE (tenant_id, url);

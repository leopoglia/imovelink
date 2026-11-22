-- Quando um anúncio deixa de aparecer numa coleta que leu a listagem inteira,
-- ele é marcado em vez de apagado: se voltar a aparecer, a marca sai.
ALTER TABLE imovelink.external_listings
    ADD COLUMN removed_at TIMESTAMPTZ;

-- Imóvel da carteira trazido de um anúncio de outro site: guarda o endereço do
-- anúncio para avisar o corretor quando ele sair da origem.
ALTER TABLE imovelink.properties
    ADD COLUMN source_listing_url TEXT;
-- Imóveis trazidos antes desta coluna: a foto do imóvel é o endereço da imagem
-- do anúncio, então ela identifica de qual anúncio ele veio. Só preenche quando
-- exatamente um anúncio da imobiliária tem aquela foto.
UPDATE imovelink.properties AS p
SET source_listing_url = l.url
FROM imovelink.external_listings AS l
WHERE p.source_listing_url IS NULL
  AND l.tenant_id = p.tenant_id
  AND l.image_url IS NOT NULL
  AND l.image_url = p.images->>0
  AND (
    SELECT COUNT(*) FROM imovelink.external_listings AS outro
    WHERE outro.tenant_id = p.tenant_id AND outro.image_url = l.image_url
  ) = 1;

CREATE INDEX properties_source_listing
    ON imovelink.properties(tenant_id, source_listing_url)
    WHERE source_listing_url IS NOT NULL;

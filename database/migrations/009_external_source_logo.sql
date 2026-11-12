-- Logo da imobiliária de origem, detectado do site ou informado pelo gestor.
-- Como nas fotos dos anúncios, guardamos só a URL; o arquivo fica na origem.
ALTER TABLE imovelink.external_sources ADD COLUMN logo_url TEXT;

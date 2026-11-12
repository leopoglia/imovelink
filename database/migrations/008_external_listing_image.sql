-- Endereço da foto na origem. Guardamos apenas a URL: o arquivo continua sendo
-- servido pelo site que publicou o anúncio, nunca copiado para cá.
ALTER TABLE imovelink.external_listings ADD COLUMN image_url TEXT;

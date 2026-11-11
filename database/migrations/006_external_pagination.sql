-- Paginação da listagem. O template guarda a URL com {n} no lugar do número da
-- página, descoberto por tentativa verificada. Nulo significa fonte de página única.
ALTER TABLE imovelink.external_sources
    ADD COLUMN pagination_template TEXT,
    ADD COLUMN max_pages INTEGER NOT NULL DEFAULT 5 CHECK (max_pages BETWEEN 1 AND 200);

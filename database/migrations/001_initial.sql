-- Imovelink owns these tables. Supabase Auth, Storage and Data API are not used.
CREATE SCHEMA IF NOT EXISTS imovelink;
REVOKE ALL ON SCHEMA imovelink FROM PUBLIC;

CREATE TABLE imovelink.tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    cnpj TEXT NOT NULL,
    creci TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL,
    state CHAR(2) NOT NULL,
    branding JSONB NOT NULL CHECK (jsonb_typeof(branding) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE imovelink.users (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES imovelink.tenants(id),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN', 'AGENCY_ADMIN', 'BROKER')),
    creci TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    avatar_url TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (tenant_id, id)
);
CREATE UNIQUE INDEX users_email_unique ON imovelink.users (LOWER(email));

CREATE TABLE imovelink.properties (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES imovelink.tenants(id),
    broker_id TEXT NOT NULL,
    broker_name TEXT,
    code TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('HOUSE', 'APARTMENT', 'COMMERCIAL', 'LAND', 'PENTHOUSE')),
    purpose TEXT NOT NULL CHECK (purpose IN ('SALE', 'RENT', 'BOTH')),
    status TEXT NOT NULL CHECK (status IN ('AVAILABLE', 'RESERVED', 'SOLD', 'INACTIVE')),
    price NUMERIC(14,2) NOT NULL CHECK (price >= 0),
    condo_fee NUMERIC(14,2) NOT NULL DEFAULT 0,
    iptu NUMERIC(14,2) NOT NULL DEFAULT 0,
    bedrooms INTEGER NOT NULL DEFAULT 0,
    suites INTEGER NOT NULL DEFAULT 0,
    bathrooms INTEGER NOT NULL DEFAULT 0,
    parking_spots INTEGER NOT NULL DEFAULT 0,
    area_total NUMERIC(14,2) NOT NULL DEFAULT 0,
    area_built NUMERIC(14,2) NOT NULL DEFAULT 0,
    address_street TEXT NOT NULL,
    address_neighborhood TEXT NOT NULL,
    address_city TEXT NOT NULL,
    address_state CHAR(2) NOT NULL,
    address_zip TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    amenities JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(amenities) = 'array'),
    images JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(images) = 'array'),
    featured BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, code),
    FOREIGN KEY (tenant_id, broker_id) REFERENCES imovelink.users(tenant_id, id)
);
CREATE INDEX properties_tenant_status ON imovelink.properties (tenant_id, status);

CREATE TABLE imovelink.property_audit_logs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES imovelink.tenants(id),
    -- This identifier is retained after a property is deleted.
    property_id TEXT NOT NULL,
    property_code TEXT NOT NULL,
    property_title TEXT NOT NULL,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    user_role TEXT NOT NULL CHECK (user_role IN ('SUPER_ADMIN', 'AGENCY_ADMIN', 'BROKER')),
    action TEXT NOT NULL CHECK (action IN ('CREATED', 'PRICE_UPDATED', 'STATUS_CHANGED', 'EDITED', 'DELETED')),
    summary TEXT NOT NULL,
    before_state JSONB,
    after_state JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id, user_id) REFERENCES imovelink.users(tenant_id, id)
);
CREATE INDEX audit_tenant_property_date ON imovelink.property_audit_logs (tenant_id, property_id, created_at DESC);

CREATE TABLE imovelink.leads (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES imovelink.tenants(id),
    assigned_broker_id TEXT NOT NULL,
    assigned_broker_name TEXT,
    name TEXT NOT NULL,
    email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL,
    origin_channel TEXT NOT NULL,
    stage TEXT NOT NULL,
    ai_score INTEGER NOT NULL CHECK (ai_score BETWEEN 0 AND 100),
    ai_temperature TEXT NOT NULL CHECK (ai_temperature IN ('HOT', 'WARM', 'COLD')),
    natural_search_desire TEXT NOT NULL,
    ai_extracted_profile JSONB NOT NULL,
    budget_min NUMERIC(14,2) NOT NULL DEFAULT 0,
    budget_max NUMERIC(14,2) NOT NULL DEFAULT 0,
    lgpd_consent BOOLEAN NOT NULL DEFAULT FALSE,
    last_contact_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id, assigned_broker_id) REFERENCES imovelink.users(tenant_id, id)
);
CREATE INDEX leads_tenant_date ON imovelink.leads (tenant_id, created_at DESC);

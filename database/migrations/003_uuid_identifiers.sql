-- The runner applies this whole file in a transaction. Lock briefly or fail without changes.
SET LOCAL lock_timeout = '5s';
LOCK TABLE imovelink.tenants, imovelink.users, imovelink.properties,
    imovelink.leads, imovelink.property_audit_logs,
    imovelink.user_credentials, imovelink.auth_sessions IN ACCESS EXCLUSIVE MODE;

-- Stable conversion also used by the JSON import; existing UUIDs keep their values.
CREATE FUNCTION pg_temp.imovelink_uuid(entity TEXT, value TEXT) RETURNS UUID
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE
    digest BYTEA;
    hex TEXT;
BEGIN
    IF value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RETURN value::UUID;
    END IF;
    IF value = '' THEN RAISE EXCEPTION 'EMPTY_LEGACY_IDENTIFIER'; END IF;
    digest := sha256(convert_to('imovelink:' || entity || ':' || value, 'UTF8'));
    hex := encode(digest, 'hex');
    RETURN (substr(hex, 1, 8) || '-' || substr(hex, 9, 4) || '-8' || substr(hex, 14, 3)
        || '-' || substr('89ab', ((get_byte(digest, 8) >> 4) & 3) + 1, 1)
        || substr(hex, 18, 3) || '-' || substr(hex, 21, 12))::UUID;
END;
$$;

-- Save and recreate actual definitions, including cascading deletes and composite tenant keys.
CREATE TEMP TABLE imovelink_uuid_foreign_keys ON COMMIT DROP AS
SELECT conrelid::regclass::TEXT AS source, conname AS name, pg_get_constraintdef(oid) AS definition
FROM pg_constraint WHERE contype = 'f' AND connamespace = 'imovelink'::regnamespace;

DO $$
DECLARE constraint_row RECORD;
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint c JOIN pg_class target ON target.oid = c.confrelid
        WHERE c.contype = 'f' AND target.relnamespace = 'imovelink'::regnamespace
          AND c.connamespace <> 'imovelink'::regnamespace
    ) THEN RAISE EXCEPTION 'EXTERNAL_FOREIGN_KEY_REQUIRES_REVIEW'; END IF;
    FOR constraint_row IN SELECT * FROM imovelink_uuid_foreign_keys LOOP
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', constraint_row.source, constraint_row.name);
    END LOOP;
END;
$$;

ALTER TABLE imovelink.tenants
    ALTER COLUMN id TYPE UUID USING pg_temp.imovelink_uuid('tenants', id),
    ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE imovelink.users
    ALTER COLUMN id TYPE UUID USING pg_temp.imovelink_uuid('users', id),
    ALTER COLUMN tenant_id TYPE UUID USING pg_temp.imovelink_uuid('tenants', tenant_id),
    ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE imovelink.properties
    ALTER COLUMN id TYPE UUID USING pg_temp.imovelink_uuid('properties', id),
    ALTER COLUMN tenant_id TYPE UUID USING pg_temp.imovelink_uuid('tenants', tenant_id),
    ALTER COLUMN broker_id TYPE UUID USING pg_temp.imovelink_uuid('users', broker_id),
    ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE imovelink.leads
    ALTER COLUMN id TYPE UUID USING pg_temp.imovelink_uuid('leads', id),
    ALTER COLUMN tenant_id TYPE UUID USING pg_temp.imovelink_uuid('tenants', tenant_id),
    ALTER COLUMN assigned_broker_id TYPE UUID USING pg_temp.imovelink_uuid('users', assigned_broker_id),
    ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE imovelink.property_audit_logs
    ALTER COLUMN id TYPE UUID USING pg_temp.imovelink_uuid('auditLogs', id),
    ALTER COLUMN tenant_id TYPE UUID USING pg_temp.imovelink_uuid('tenants', tenant_id),
    ALTER COLUMN property_id TYPE UUID USING pg_temp.imovelink_uuid('properties', property_id),
    ALTER COLUMN user_id TYPE UUID USING pg_temp.imovelink_uuid('users', user_id),
    ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE imovelink.user_credentials
    ALTER COLUMN user_id TYPE UUID USING pg_temp.imovelink_uuid('users', user_id);
ALTER TABLE imovelink.auth_sessions
    ALTER COLUMN user_id TYPE UUID USING pg_temp.imovelink_uuid('users', user_id);

-- Audit snapshots can contain property identity fields, including deleted properties.
DO $$
DECLARE state_column TEXT; field RECORD;
BEGIN
    FOREACH state_column IN ARRAY ARRAY['before_state', 'after_state'] LOOP
        FOR field IN SELECT * FROM (VALUES ('id', 'properties'), ('tenantId', 'tenants'), ('brokerId', 'users')) AS fields(name, entity) LOOP
            EXECUTE format(
                'UPDATE imovelink.property_audit_logs SET %1$I = jsonb_set(%1$I, ARRAY[$1], to_jsonb(pg_temp.imovelink_uuid($2, %1$I ->> $1)::TEXT)) WHERE jsonb_typeof(%1$I -> $1) = ''string''',
                state_column
            ) USING field.name, field.entity;
        END LOOP;
    END LOOP;
END;
$$;

DO $$
DECLARE constraint_row RECORD;
BEGIN
    FOR constraint_row IN SELECT * FROM imovelink_uuid_foreign_keys LOOP
        EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', constraint_row.source, constraint_row.name, constraint_row.definition);
    END LOOP;
END;
$$;

-- Replace only the two recognizable demo IDs. New tenants already use random UUIDv4.
SET LOCAL lock_timeout = '5s';
LOCK TABLE imovelink.tenants, imovelink.users, imovelink.properties,
    imovelink.leads, imovelink.property_audit_logs,
    imovelink.user_credentials, imovelink.auth_sessions IN ACCESS EXCLUSIVE MODE;

CREATE TEMP TABLE imovelink_tenant_replacements (old_id UUID PRIMARY KEY, new_id UUID NOT NULL UNIQUE) ON COMMIT DROP;
INSERT INTO imovelink_tenant_replacements VALUES
    ('11111111-1111-4111-8111-111111111111', '09e1cc27-15ec-4a5c-9a95-0485de24d386'),
    ('22222222-2222-4222-8222-222222222222', 'a3b76ce0-cc99-41e5-b071-8827170a7a2c');

CREATE TEMP TABLE imovelink_tenant_foreign_keys ON COMMIT DROP AS
SELECT conrelid::regclass::TEXT AS source, conname AS name, pg_get_constraintdef(oid) AS definition
FROM pg_constraint WHERE contype = 'f' AND connamespace = 'imovelink'::regnamespace;

DO $$
DECLARE fk RECORD;
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint c JOIN pg_class target ON target.oid = c.confrelid
        WHERE c.contype = 'f' AND target.relnamespace = 'imovelink'::regnamespace
          AND c.connamespace <> 'imovelink'::regnamespace
    ) THEN RAISE EXCEPTION 'EXTERNAL_FOREIGN_KEY_REQUIRES_REVIEW'; END IF;
    FOR fk IN SELECT * FROM imovelink_tenant_foreign_keys LOOP
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', fk.source, fk.name);
    END LOOP;
END;
$$;

UPDATE imovelink.users t SET tenant_id = m.new_id FROM imovelink_tenant_replacements m WHERE t.tenant_id = m.old_id;
UPDATE imovelink.properties t SET tenant_id = m.new_id FROM imovelink_tenant_replacements m WHERE t.tenant_id = m.old_id;
UPDATE imovelink.leads t SET tenant_id = m.new_id FROM imovelink_tenant_replacements m WHERE t.tenant_id = m.old_id;
UPDATE imovelink.property_audit_logs t SET tenant_id = m.new_id FROM imovelink_tenant_replacements m WHERE t.tenant_id = m.old_id;
UPDATE imovelink.tenants t SET id = m.new_id FROM imovelink_tenant_replacements m WHERE t.id = m.old_id;

UPDATE imovelink.property_audit_logs t
SET before_state = jsonb_set(t.before_state, '{tenantId}', to_jsonb(m.new_id::TEXT))
FROM imovelink_tenant_replacements m WHERE t.before_state ->> 'tenantId' = m.old_id::TEXT;
UPDATE imovelink.property_audit_logs t
SET after_state = jsonb_set(t.after_state, '{tenantId}', to_jsonb(m.new_id::TEXT))
FROM imovelink_tenant_replacements m WHERE t.after_state ->> 'tenantId' = m.old_id::TEXT;

DO $$
DECLARE fk RECORD;
BEGIN
    FOR fk IN SELECT * FROM imovelink_tenant_foreign_keys LOOP
        EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', fk.source, fk.name, fk.definition);
    END LOOP;
END;
$$;

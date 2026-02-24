BEGIN;

CREATE TABLE security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  event_type VARCHAR(120) NOT NULL,
  severity VARCHAR(10) NOT NULL DEFAULT 'INFO',
  ip_address INET,
  user_agent TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT security_event_severity_check CHECK (severity IN ('INFO', 'WARN', 'ERROR'))
);

CREATE INDEX security_events_created_idx ON security_events (created_at DESC);
CREATE INDEX security_events_tenant_created_idx ON security_events (tenant_id, created_at DESC);
CREATE INDEX security_events_user_created_idx ON security_events (user_id, created_at DESC);
CREATE INDEX security_events_event_type_idx ON security_events (event_type, created_at DESC);

COMMIT;

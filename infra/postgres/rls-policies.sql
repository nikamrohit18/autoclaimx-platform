-- Row-Level Security policies for AutoClaimX
-- Applied after Prisma migrations via a separate migration step.
-- Each policy restricts rows to the tenant set by SET LOCAL "app.current_tenant".
-- PLATFORM_ADMIN connections bypass RLS via a superuser/bypassrls role.

-- Helper function: returns current tenant or NULL (safe missing-setting handling)
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS text AS $$
  SELECT current_setting('app.current_tenant', true);
$$ LANGUAGE sql STABLE;

-- ─── Enable RLS on all tenant-scoped tables ───────────────────────────────────

ALTER TABLE tenants             ENABLE ROW LEVEL SECURITY;
ALTER TABLE users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys            ENABLE ROW LEVEL SECURITY;
ALTER TABLE claims              ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_media         ENABLE ROW LEVEL SECURITY;
ALTER TABLE damage_reports      ENABLE ROW LEVEL SECURITY;
ALTER TABLE workshops           ENABLE ROW LEVEL SECURITY;
ALTER TABLE workshop_estimates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE negotiation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE negotiation_offers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE fraud_scores        ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events        ENABLE ROW LEVEL SECURITY;

-- ─── Policies ─────────────────────────────────────────────────────────────────
-- negotiation_offers has no tenant_id — it inherits isolation through session FK.
-- All other tables are gated directly on tenant_id.

CREATE POLICY tenant_isolation ON tenants
  USING (id = current_tenant_id());

CREATE POLICY tenant_isolation ON users
  USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON api_keys
  USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON claims
  USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON claim_media
  USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON damage_reports
  USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON workshops
  USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON workshop_estimates
  USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON negotiation_sessions
  USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON fraud_scores
  USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON audit_events
  USING (tenant_id = current_tenant_id());

-- negotiation_offers: no tenant_id column; rely on session-level isolation
-- (queries always join through negotiation_sessions which is already RLS-gated)
CREATE POLICY tenant_isolation ON negotiation_offers
  USING (
    session_id IN (
      SELECT id FROM negotiation_sessions
      WHERE tenant_id = current_tenant_id()
    )
  );

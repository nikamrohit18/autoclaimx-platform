-- PostgreSQL initialization script
-- Creates shadow database for Prisma migrations and enables RLS extensions

CREATE DATABASE autoclaimx_shadow;

-- Enable extensions on main DB
\c autoclaimx;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Row-Level Security helper: current tenant context
-- Services call: SET app.current_tenant = '<tenant_id>';
-- Policies reference: current_setting('app.current_tenant', true)
-- This is a no-op on init; policies are created in Prisma migrations.

\c autoclaimx_shadow;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

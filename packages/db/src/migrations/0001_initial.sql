-- ============================================================================
-- Migration: 0001_initial.sql
-- WMS Phase 1 — Complete Initial Schema
--
-- Run order: pnpm db:migrate  (drizzle-kit manages the transaction)
-- Or manually: psql $DATABASE_URL < 0001_initial.sql
--
-- IMPORTANT: This file creates ALL Phase 1 tables in dependency order.
-- Run ONCE on a fresh database. Subsequent schema changes use new migration files.
--
-- NOTE: No explicit BEGIN/COMMIT here. drizzle-kit wraps every migration file
-- in its own transaction. Adding a second BEGIN causes PostgreSQL to emit
-- "WARNING: there is already a transaction in progress" and the inner COMMIT
-- prematurely closes drizzle's transaction before it can record the migration.
-- ============================================================================

-- Enable UUID generation (available in pg >= 13 via pgcrypto extension)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- ENUMS
-- Must be created before tables that reference them.
-- ============================================================================

CREATE TYPE site_type AS ENUM (
  'factory',
  'warehouse',
  '3pl',
  'transit'
);

CREATE TYPE location_level AS ENUM (
  'building',
  'floor',
  'rack',
  'bin',
  'shelf'
);

CREATE TYPE sku_type AS ENUM (
  'raw_material',
  'component',
  'semi_finished',
  'finished_good',
  'packaging',
  'consumable'
);

CREATE TYPE qc_status AS ENUM (
  'pending',
  'passed',
  'failed',
  'conditionally_passed'
);

CREATE TYPE inventory_state AS ENUM (
  'available',
  'reserved',
  'in_production',
  'qc_hold',
  'damaged',
  'returned',
  'in_transit'
);

CREATE TYPE stock_event_type AS ENUM (
  'opening_balance',
  'inbound_receipt',
  'adjustment_positive',
  'adjustment_negative',
  'transfer_out',
  'transfer_in',
  'location_transfer'
);

CREATE TYPE transfer_type AS ENUM (
  'factory_to_warehouse',
  'warehouse_to_factory',
  'internal_move',
  'inter_warehouse'
);

CREATE TYPE transfer_status AS ENUM (
  'draft',
  'approved',
  'in_transit',
  'received',
  'partial',
  'cancelled'
);

-- ============================================================================
-- ORGANIZATIONS & SITES
-- ============================================================================

CREATE TABLE organizations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  code        TEXT NOT NULL,
  address     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT organizations_code_unique UNIQUE (code)
);

COMMENT ON TABLE organizations IS 'Top-level tenant. One org per deployment in Phase 1.';

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE sites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id),
  name        TEXT NOT NULL,
  code        TEXT NOT NULL,
  site_type   site_type NOT NULL,
  address     JSONB,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT sites_org_code_unique UNIQUE (org_id, code)
);

COMMENT ON TABLE sites IS 'Physical facilities: Factory, Warehouse, etc.';

CREATE INDEX idx_sites_org_id ON sites (org_id);

-- ============================================================================
-- LOCATION HIERARCHY
-- Self-referencing tree with materialized paths.
-- ============================================================================

CREATE TABLE locations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id         UUID NOT NULL REFERENCES sites(id),
  parent_id       UUID REFERENCES locations(id),
  name            TEXT NOT NULL,
  code            TEXT NOT NULL,
  level           location_level NOT NULL,
  -- Materialized path for efficient subtree queries:
  -- WHERE path LIKE 'FAC/BLD-A/%'
  path            TEXT NOT NULL,
  -- Only bins/shelves (leaf nodes) store inventory
  is_storage      BOOLEAN NOT NULL DEFAULT FALSE,
  capacity        NUMERIC(12, 4),
  capacity_unit   TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT locations_site_path_unique UNIQUE (site_id, path)
);

COMMENT ON TABLE locations IS 'Location hierarchy: Building → Floor → Rack → Bin → Shelf';
COMMENT ON COLUMN locations.path IS 'Materialized path e.g. "FAC/BLD-A/F1/R3/B5". Allows LIKE prefix queries for subtrees.';
COMMENT ON COLUMN locations.is_storage IS 'Only TRUE for leaf nodes (bins/shelves) that physically hold inventory.';

CREATE INDEX idx_locations_site_id    ON locations (site_id);
CREATE INDEX idx_locations_path       ON locations (path);
CREATE INDEX idx_locations_parent_id  ON locations (parent_id);
CREATE INDEX idx_locations_level      ON locations (level);
CREATE INDEX idx_locations_is_storage ON locations (is_storage);

-- ============================================================================
-- USERS & AUTHENTICATION
-- ============================================================================

CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  email           TEXT NOT NULL,
  password_hash   TEXT NOT NULL,
  full_name       TEXT NOT NULL,
  phone           TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT users_email_unique UNIQUE (email)
);

COMMENT ON TABLE users IS 'Application users. Passwords stored as bcrypt hashes.';

CREATE INDEX idx_users_org_id    ON users (org_id);
CREATE INDEX idx_users_email     ON users (email);
CREATE INDEX idx_users_is_active ON users (is_active);

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE roles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  name            TEXT NOT NULL,
  description     TEXT,
  is_system_role  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE roles IS 'Roles bundle permissions and are assigned to users.';
COMMENT ON COLUMN roles.is_system_role IS 'System roles cannot be deleted or renamed.';

CREATE INDEX idx_roles_org_id ON roles (org_id);

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE permissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Module: skus | categories | locations | sites | inventory | transfers | users | roles | dashboard
  module      TEXT NOT NULL,
  -- Action: read | create | update | delete | approve | post
  action      TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT permissions_module_action_unique UNIQUE (module, action)
);

COMMENT ON TABLE permissions IS 'Atomic permission: (module, action) pair.';

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE role_permissions (
  role_id       UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (role_id, permission_id)
);

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE user_roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id     UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  -- NULL = role applies to all sites; non-null = scoped to one site
  site_id     UUID REFERENCES sites(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN user_roles.site_id IS 'NULL = global role. Non-null = site-scoped role.';

-- Partial unique indexes handle nullable site_id correctly
CREATE UNIQUE INDEX user_roles_uniq_with_site
  ON user_roles (user_id, role_id, site_id)
  WHERE site_id IS NOT NULL;

CREATE UNIQUE INDEX user_roles_uniq_no_site
  ON user_roles (user_id, role_id)
  WHERE site_id IS NULL;

CREATE INDEX idx_user_roles_user_id ON user_roles (user_id);
CREATE INDEX idx_user_roles_role_id ON user_roles (role_id);

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE refresh_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Only the hash of the token is stored — never the raw value
  token_hash    TEXT NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at    TIMESTAMPTZ,
  ip_address    TEXT,
  user_agent    TEXT,

  CONSTRAINT refresh_tokens_hash_unique UNIQUE (token_hash)
);

COMMENT ON TABLE refresh_tokens IS 'Persisted refresh tokens for session management. Raw token never stored.';

CREATE INDEX idx_refresh_tokens_user_id    ON refresh_tokens (user_id);
CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens (token_hash);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens (expires_at);

-- ============================================================================
-- SKU CATALOG
-- ============================================================================

CREATE TABLE sku_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id),
  name        TEXT NOT NULL,
  code        TEXT NOT NULL,
  parent_id   UUID REFERENCES sku_categories(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT sku_categories_org_code_unique UNIQUE (org_id, code)
);

CREATE INDEX idx_sku_categories_org_id    ON sku_categories (org_id);
CREATE INDEX idx_sku_categories_parent_id ON sku_categories (parent_id);

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE skus (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES organizations(id),
  sku_code            TEXT NOT NULL,
  name                TEXT NOT NULL,
  description         TEXT,
  category_id         UUID REFERENCES sku_categories(id),
  sku_type            sku_type NOT NULL,
  uom                 TEXT NOT NULL DEFAULT 'pcs',
  weight_kg           NUMERIC(10, 4),
  dimensions          JSONB,               -- { length, width, height, unit }
  hsn_code            TEXT,
  barcode             TEXT,
  image_url           TEXT,
  reorder_point       NUMERIC(12, 4) NOT NULL DEFAULT 0,
  reorder_qty         NUMERIC(12, 4) NOT NULL DEFAULT 0,
  lead_time_days      INTEGER NOT NULL DEFAULT 0,
  is_batch_tracked    BOOLEAN NOT NULL DEFAULT TRUE,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  tags                TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  metadata            JSONB NOT NULL DEFAULT '{}',
  created_by          UUID NOT NULL REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ,         -- soft delete

  CONSTRAINT skus_sku_code_unique UNIQUE (sku_code)
);

COMMENT ON TABLE skus IS 'Master SKU catalog. ~1000 active SKUs.';
COMMENT ON COLUMN skus.deleted_at IS 'Soft delete. Deleted SKUs excluded from normal queries via WHERE deleted_at IS NULL.';

-- Full-text search index for instant SKU search (sku_code + name + description)
CREATE INDEX idx_skus_fts ON skus USING GIN (
  to_tsvector('english',
    sku_code || ' ' || name || ' ' || COALESCE(description, '')
  )
);

CREATE INDEX idx_skus_sku_type    ON skus (sku_type);
CREATE INDEX idx_skus_category_id ON skus (category_id);
CREATE INDEX idx_skus_is_active   ON skus (is_active);
CREATE INDEX idx_skus_org_id      ON skus (org_id);
CREATE INDEX idx_skus_tags        ON skus USING GIN (tags);
CREATE INDEX idx_skus_barcode     ON skus (barcode) WHERE barcode IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE batches (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_id            UUID NOT NULL REFERENCES skus(id),
  batch_no          TEXT NOT NULL,
  lot_no            TEXT,
  expiry_date       DATE,
  manufacture_date  DATE,
  supplier_ref      TEXT,
  qc_status         qc_status NOT NULL DEFAULT 'pending',
  qc_notes          TEXT,
  qc_by             UUID REFERENCES users(id),
  qc_at             TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT batches_sku_batch_unique UNIQUE (sku_id, batch_no)
);

CREATE INDEX idx_batches_sku_id      ON batches (sku_id);
CREATE INDEX idx_batches_expiry_date ON batches (expiry_date) WHERE expiry_date IS NOT NULL;
CREATE INDEX idx_batches_qc_status   ON batches (qc_status);

-- ============================================================================
-- INVENTORY — STOCK LEDGER & BALANCES
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- STOCK LEDGER — APPEND ONLY. This is the ground truth for all inventory.
-- NEVER issue UPDATE or DELETE on this table.
-- All corrections go through adjustment events.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE stock_ledger (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES organizations(id),
  event_type          stock_event_type NOT NULL,
  sku_id              UUID NOT NULL REFERENCES skus(id),
  batch_id            UUID REFERENCES batches(id),
  location_id         UUID NOT NULL REFERENCES locations(id),
  site_id             UUID NOT NULL REFERENCES sites(id),
  -- Signed quantity: positive = IN, negative = OUT
  qty                 NUMERIC(14, 6) NOT NULL,
  uom                 TEXT NOT NULL,
  inventory_state     inventory_state NOT NULL,
  -- Traceability: link back to source document
  reference_type      TEXT,           -- 'transfer_order' | 'adjustment' | 'manual'
  reference_id        UUID,
  reference_line_id   UUID,
  performed_by        UUID NOT NULL REFERENCES users(id),
  performed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes               TEXT,
  metadata            JSONB NOT NULL DEFAULT '{}'
);

COMMENT ON TABLE stock_ledger IS
  'Append-only event log. Ground truth for all inventory. Never UPDATE or DELETE.';
COMMENT ON COLUMN stock_ledger.qty IS
  'Signed: positive = stock entering location, negative = stock leaving location.';

CREATE INDEX idx_stock_ledger_sku_loc_time
  ON stock_ledger (sku_id, location_id, performed_at);

CREATE INDEX idx_stock_ledger_reference
  ON stock_ledger (reference_type, reference_id);

CREATE INDEX idx_stock_ledger_performed_at
  ON stock_ledger (performed_at DESC);

CREATE INDEX idx_stock_ledger_site_time
  ON stock_ledger (site_id, performed_at DESC);

CREATE INDEX idx_stock_ledger_ref_line
  ON stock_ledger (reference_line_id, event_type)
  WHERE reference_line_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- INVENTORY BALANCES — Maintained atomically with stock_ledger via trigger.
-- Used for all balance reads. Never aggregate the ledger directly for current stock.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE inventory_balances (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  sku_id          UUID NOT NULL REFERENCES skus(id),
  batch_id        UUID REFERENCES batches(id),
  location_id     UUID NOT NULL REFERENCES locations(id),
  site_id         UUID NOT NULL REFERENCES sites(id),
  inventory_state inventory_state NOT NULL,
  qty_on_hand     NUMERIC(14, 6) NOT NULL DEFAULT 0,
  uom             TEXT NOT NULL,
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE inventory_balances IS
  'Materialized balance: qty by (SKU, batch, location, state). Updated atomically via trigger.';

-- Unique index using COALESCE to handle NULL batch_id correctly
CREATE UNIQUE INDEX inventory_balances_unique
  ON inventory_balances (
    sku_id,
    location_id,
    inventory_state,
    COALESCE(batch_id, '00000000-0000-0000-0000-000000000000'::UUID)
  );

CREATE INDEX idx_inventory_balances_sku      ON inventory_balances (sku_id);
CREATE INDEX idx_inventory_balances_location ON inventory_balances (location_id);
CREATE INDEX idx_inventory_balances_site_sku ON inventory_balances (site_id, sku_id);
CREATE INDEX idx_inventory_balances_state    ON inventory_balances (inventory_state);
CREATE INDEX idx_inventory_balances_org_sku  ON inventory_balances (org_id, sku_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- TRIGGER: Maintain inventory_balances on stock_ledger INSERT
-- Runs inside the same transaction as the ledger insert.
-- Prevents balance from going negative (enforces the "balance floor guard").
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_update_inventory_balance()
RETURNS TRIGGER AS $$
DECLARE
  current_qty NUMERIC;
  new_qty     NUMERIC;
BEGIN
  -- Lock the balance row for this (sku, location, state, batch) combination
  -- to prevent concurrent updates from causing race conditions.
  SELECT qty_on_hand
    INTO current_qty
    FROM inventory_balances
   WHERE sku_id          = NEW.sku_id
     AND location_id     = NEW.location_id
     AND inventory_state = NEW.inventory_state
     AND COALESCE(batch_id, '00000000-0000-0000-0000-000000000000'::UUID)
       = COALESCE(NEW.batch_id, '00000000-0000-0000-0000-000000000000'::UUID)
   FOR UPDATE;

  -- Calculate the new balance
  new_qty := COALESCE(current_qty, 0) + NEW.qty;

  -- Balance floor guard: reject if balance would go negative
  IF new_qty < 0 THEN
    RAISE EXCEPTION
      'Insufficient stock: SKU % at location % would go to % (current: %)',
      NEW.sku_id, NEW.location_id, new_qty, COALESCE(current_qty, 0)
      USING ERRCODE = 'check_violation';
  END IF;

  -- Upsert the balance row
  INSERT INTO inventory_balances (
    org_id, sku_id, batch_id, location_id, site_id,
    inventory_state, qty_on_hand, uom, last_updated_at
  ) VALUES (
    NEW.org_id, NEW.sku_id, NEW.batch_id, NEW.location_id, NEW.site_id,
    NEW.inventory_state, new_qty, NEW.uom, NOW()
  )
  ON CONFLICT (
    sku_id,
    location_id,
    inventory_state,
    COALESCE(batch_id, '00000000-0000-0000-0000-000000000000'::UUID)
  )
  DO UPDATE SET
    qty_on_hand     = inventory_balances.qty_on_hand + NEW.qty,
    last_updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_inventory_balance
  AFTER INSERT ON stock_ledger
  FOR EACH ROW
  EXECUTE FUNCTION fn_update_inventory_balance();

-- ─────────────────────────────────────────────────────────────────────────────
-- Document sequences — auto-numbering for transactional documents
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE document_sequences (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id),
  doc_type    TEXT NOT NULL,      -- 'TRF' | 'ADJ' | 'GRN' | 'PCK'
  year        SMALLINT NOT NULL,
  last_seq    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT doc_sequences_org_type_year_unique UNIQUE (org_id, doc_type, year)
);

COMMENT ON TABLE document_sequences IS
  'Tracks the last used sequence number per document type per year. Locked FOR UPDATE on increment.';

-- ─────────────────────────────────────────────────────────────────────────────
-- FUNCTION: Atomically increment and return next document number
-- Usage: SELECT next_document_number(<org_id>, 'TRF', 2025)
-- Returns: 'TRF-2025-0042'
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION next_document_number(
  p_org_id  UUID,
  p_type    TEXT,
  p_year    SMALLINT
)
RETURNS TEXT AS $$
DECLARE
  v_seq INTEGER;
BEGIN
  INSERT INTO document_sequences (org_id, doc_type, year, last_seq)
  VALUES (p_org_id, p_type, p_year, 1)
  ON CONFLICT ON CONSTRAINT doc_sequences_org_type_year_unique
  DO UPDATE SET
    last_seq   = document_sequences.last_seq + 1,
    updated_at = NOW()
  RETURNING last_seq INTO v_seq;

  RETURN p_type || '-' || p_year || '-' || LPAD(v_seq::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRANSFER ORDERS
-- ============================================================================

CREATE TABLE transfer_orders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES organizations(id),
  transfer_number     TEXT NOT NULL,
  transfer_type       transfer_type NOT NULL,
  from_site_id        UUID NOT NULL REFERENCES sites(id),
  to_site_id          UUID NOT NULL REFERENCES sites(id),
  from_location_id    UUID REFERENCES locations(id),
  to_location_id      UUID REFERENCES locations(id),
  vehicle_no          TEXT,
  status              transfer_status NOT NULL DEFAULT 'draft',
  requested_by        UUID NOT NULL REFERENCES users(id),
  approved_by         UUID REFERENCES users(id),
  approved_at         TIMESTAMPTZ,
  dispatched_at       TIMESTAMPTZ,
  received_at         TIMESTAMPTZ,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT transfer_orders_number_unique UNIQUE (transfer_number)
);

CREATE INDEX idx_transfer_orders_org_id     ON transfer_orders (org_id);
CREATE INDEX idx_transfer_orders_status     ON transfer_orders (status);
CREATE INDEX idx_transfer_orders_from_site  ON transfer_orders (from_site_id);
CREATE INDEX idx_transfer_orders_to_site    ON transfer_orders (to_site_id);
CREATE INDEX idx_transfer_orders_created_at ON transfer_orders (created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE transfer_order_lines (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_order_id   UUID NOT NULL REFERENCES transfer_orders(id) ON DELETE CASCADE,
  sku_id              UUID NOT NULL REFERENCES skus(id),
  batch_id            UUID REFERENCES batches(id),
  from_location_id    UUID NOT NULL REFERENCES locations(id),
  to_location_id      UUID NOT NULL REFERENCES locations(id),
  qty_planned         NUMERIC(12, 4) NOT NULL,
  qty_dispatched      NUMERIC(12, 4) NOT NULL DEFAULT 0,
  qty_received        NUMERIC(12, 4) NOT NULL DEFAULT 0,
  uom                 TEXT NOT NULL,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT tol_qty_planned_positive CHECK (qty_planned > 0),
  CONSTRAINT tol_qty_dispatched_gte_0 CHECK (qty_dispatched >= 0),
  CONSTRAINT tol_qty_received_gte_0   CHECK (qty_received >= 0)
);

CREATE INDEX idx_transfer_lines_order_id ON transfer_order_lines (transfer_order_id);
CREATE INDEX idx_transfer_lines_sku_id   ON transfer_order_lines (sku_id);

-- ============================================================================
-- AUDIT LOG
-- ============================================================================

CREATE TABLE audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id),
  user_id       UUID NOT NULL REFERENCES users(id),
  action        TEXT NOT NULL,         -- 'create' | 'update' | 'delete' | 'approve' | 'post'
  entity_type   TEXT NOT NULL,         -- 'sku' | 'transfer_order' | 'user' | ...
  entity_id     UUID NOT NULL,
  changes       JSONB,                 -- { before: {...}, after: {...} }
  ip_address    TEXT,
  user_agent    TEXT,
  performed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE audit_log IS
  'Immutable audit trail. Never UPDATE or DELETE. Written on every data mutation.';

CREATE INDEX idx_audit_log_entity       ON audit_log (entity_type, entity_id);
CREATE INDEX idx_audit_log_user         ON audit_log (user_id, performed_at DESC);
CREATE INDEX idx_audit_log_performed_at ON audit_log (performed_at DESC);
CREATE INDEX idx_audit_log_org          ON audit_log (org_id, performed_at DESC);

-- ============================================================================
-- UPDATED_AT TRIGGER HELPER
-- Automatically updates updated_at on any table that has the column.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all mutable tables
CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_sites_updated_at
  BEFORE UPDATE ON sites
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_locations_updated_at
  BEFORE UPDATE ON locations
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_roles_updated_at
  BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_sku_categories_updated_at
  BEFORE UPDATE ON sku_categories
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_skus_updated_at
  BEFORE UPDATE ON skus
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_batches_updated_at
  BEFORE UPDATE ON batches
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_transfer_orders_updated_at
  BEFORE UPDATE ON transfer_orders
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_transfer_order_lines_updated_at
  BEFORE UPDATE ON transfer_order_lines
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_document_sequences_updated_at
  BEFORE UPDATE ON document_sequences
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ============================================================================
-- Post-migration verification (runs inside drizzle-kit's transaction)
-- ============================================================================
DO $$
DECLARE
  table_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO table_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE';

  RAISE NOTICE 'Migration 0001_initial completed. Tables created: %', table_count;
END $$;

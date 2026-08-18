/*
# FiduSight Multi-PBM Intelligence Platform - Core Schema

1. New Tables
- `pbm_vendors`: PBM vendor master data (OptumRx, CVS Caremark, Navitus, etc.)
  - id (uuid, PK), vendor_code (text, unique), vendor_name (text), plan_group (text), pricing_model (text), created_at
- `drugs`: Drug master data with NDC, RxCUI, therapeutic class
  - id (uuid, PK), ndc_11 (text, unique), rxcui (text), drug_name (text), therapeutic_class (text), is_specialty (bool), nadac_benchmark_unit (numeric), package_size (int), package_unit (text), created_at
- `drug_pbm_pricing`: Aggregated per-drug per-PBM pricing for comparison
  - id (uuid, PK), drug_id (uuid FK), pbm_vendor_id (uuid FK), pharmacy_reimbursement (numeric), rebate_passed_thru (numeric), bfsf_admin_fee (numeric), amt_billed_plan (numeric), true_net_price (numeric), tnp_per_unit (numeric), spread_amount (numeric), days_supply (int), claim_count (int), created_at
- `audit_anomalies`: Compliance violations detected by the engine
  - id (uuid, PK), claim_ref (text), pbm_vendor_id (uuid FK), drug_id (uuid FK), anomaly_type (text), severity (text), description (text), dollar_amount (numeric), status (text), detected_at, resolved_at
- `audit_log`: Tamper-evident append-only audit ledger
  - id (uuid, PK), action (text), actor_role (text), entity_type (text), entity_id (text), details (jsonb), hash_prev (text), hash_current (text), created_at
- `ingestion_jobs`: PBM file ingestion job tracking
  - id (uuid, PK), pbm_vendor_id (uuid FK), filename (text), file_size_mb (numeric), row_count (int), status (text), error_details (text), started_at, completed_at, created_at

2. Security
- Enable RLS on all tables.
- This is a single-tenant no-auth app; policies allow anon+authenticated full CRUD (data is intentionally shared).
- USING (true) is acceptable because there is no sign-in screen and all data is shared dashboard data.

3. Notes
- All monetary fields are NUMERIC(14,2).
- true_net_price = pharmacy_reimbursement + bfsf_admin_fee - rebate_passed_thru
- spread_amount = amt_billed_plan - pharmacy_reimbursement
- tnp_per_unit = true_net_price / days_supply * 30 (standardized 30-day baseline)
*/

-- PBM Vendors
CREATE TABLE IF NOT EXISTS pbm_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_code text UNIQUE NOT NULL,
  vendor_name text NOT NULL,
  plan_group text NOT NULL,
  pricing_model text NOT NULL DEFAULT 'PASS_THRU',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE pbm_vendors ENABLE ROW LEVEL SECURITY;

-- Drugs
CREATE TABLE IF NOT EXISTS drugs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ndc_11 text UNIQUE NOT NULL,
  rxcui text,
  drug_name text NOT NULL,
  therapeutic_class text NOT NULL,
  is_specialty boolean NOT NULL DEFAULT false,
  nadac_benchmark_unit numeric(14,2),
  package_size integer NOT NULL DEFAULT 1,
  package_unit text NOT NULL DEFAULT 'each',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE drugs ENABLE ROW LEVEL SECURITY;

-- Drug-PBM Pricing (aggregated comparison data)
CREATE TABLE IF NOT EXISTS drug_pbm_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drug_id uuid NOT NULL REFERENCES drugs(id) ON DELETE CASCADE,
  pbm_vendor_id uuid NOT NULL REFERENCES pbm_vendors(id) ON DELETE CASCADE,
  pharmacy_reimbursement numeric(14,2) NOT NULL,
  rebate_passed_thru numeric(14,2) NOT NULL,
  bfsf_admin_fee numeric(14,2) NOT NULL,
  amt_billed_plan numeric(14,2) NOT NULL,
  true_net_price numeric(14,2) NOT NULL,
  tnp_per_unit numeric(14,2) NOT NULL,
  spread_amount numeric(14,2) NOT NULL DEFAULT 0,
  days_supply integer NOT NULL DEFAULT 30,
  claim_count integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  UNIQUE(drug_id, pbm_vendor_id)
);
ALTER TABLE drug_pbm_pricing ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_dpp_drug ON drug_pbm_pricing(drug_id);
CREATE INDEX IF NOT EXISTS idx_dpp_pbm ON drug_pbm_pricing(pbm_vendor_id);

-- Audit Anomalies
CREATE TABLE IF NOT EXISTS audit_anomalies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_ref text NOT NULL,
  pbm_vendor_id uuid REFERENCES pbm_vendors(id) ON DELETE SET NULL,
  drug_id uuid REFERENCES drugs(id) ON DELETE SET NULL,
  anomaly_type text NOT NULL,
  severity text NOT NULL,
  description text NOT NULL,
  dollar_amount numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'OPEN',
  detected_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);
ALTER TABLE audit_anomalies ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_anomaly_status ON audit_anomalies(status);
CREATE INDEX IF NOT EXISTS idx_anomaly_severity ON audit_anomalies(severity);

-- Audit Log (tamper-evident)
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  actor_role text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  details jsonb,
  hash_prev text,
  hash_current text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Ingestion Jobs
CREATE TABLE IF NOT EXISTS ingestion_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pbm_vendor_id uuid REFERENCES pbm_vendors(id) ON DELETE SET NULL,
  filename text NOT NULL,
  file_size_mb numeric(10,2),
  row_count integer,
  status text NOT NULL DEFAULT 'PENDING',
  error_details text,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE ingestion_jobs ENABLE ROW LEVEL SECURITY;

-- Policies for all tables (single-tenant, no auth, shared data)
-- pbm_vendors
DROP POLICY IF EXISTS "anon_select_pbm_vendors" ON pbm_vendors;
CREATE POLICY "anon_select_pbm_vendors" ON pbm_vendors FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_pbm_vendors" ON pbm_vendors;
CREATE POLICY "anon_insert_pbm_vendors" ON pbm_vendors FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_pbm_vendors" ON pbm_vendors;
CREATE POLICY "anon_update_pbm_vendors" ON pbm_vendors FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_pbm_vendors" ON pbm_vendors;
CREATE POLICY "anon_delete_pbm_vendors" ON pbm_vendors FOR DELETE TO anon, authenticated USING (true);

-- drugs
DROP POLICY IF EXISTS "anon_select_drugs" ON drugs;
CREATE POLICY "anon_select_drugs" ON drugs FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_drugs" ON drugs;
CREATE POLICY "anon_insert_drugs" ON drugs FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_drugs" ON drugs;
CREATE POLICY "anon_update_drugs" ON drugs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_drugs" ON drugs;
CREATE POLICY "anon_delete_drugs" ON drugs FOR DELETE TO anon, authenticated USING (true);

-- drug_pbm_pricing
DROP POLICY IF EXISTS "anon_select_dpp" ON drug_pbm_pricing;
CREATE POLICY "anon_select_dpp" ON drug_pbm_pricing FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_dpp" ON drug_pbm_pricing;
CREATE POLICY "anon_insert_dpp" ON drug_pbm_pricing FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_dpp" ON drug_pbm_pricing;
CREATE POLICY "anon_update_dpp" ON drug_pbm_pricing FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_dpp" ON drug_pbm_pricing;
CREATE POLICY "anon_delete_dpp" ON drug_pbm_pricing FOR DELETE TO anon, authenticated USING (true);

-- audit_anomalies
DROP POLICY IF EXISTS "anon_select_anomalies" ON audit_anomalies;
CREATE POLICY "anon_select_anomalies" ON audit_anomalies FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_anomalies" ON audit_anomalies;
CREATE POLICY "anon_insert_anomalies" ON audit_anomalies FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_anomalies" ON audit_anomalies;
CREATE POLICY "anon_update_anomalies" ON audit_anomalies FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_anomalies" ON audit_anomalies;
CREATE POLICY "anon_delete_anomalies" ON audit_anomalies FOR DELETE TO anon, authenticated USING (true);

-- audit_log
DROP POLICY IF EXISTS "anon_select_audit_log" ON audit_log;
CREATE POLICY "anon_select_audit_log" ON audit_log FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_audit_log" ON audit_log;
CREATE POLICY "anon_insert_audit_log" ON audit_log FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_audit_log" ON audit_log;
CREATE POLICY "anon_update_audit_log" ON audit_log FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_audit_log" ON audit_log;
CREATE POLICY "anon_delete_audit_log" ON audit_log FOR DELETE TO anon, authenticated USING (true);

-- ingestion_jobs
DROP POLICY IF EXISTS "anon_select_ingestion" ON ingestion_jobs;
CREATE POLICY "anon_select_ingestion" ON ingestion_jobs FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_ingestion" ON ingestion_jobs;
CREATE POLICY "anon_insert_ingestion" ON ingestion_jobs FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_ingestion" ON ingestion_jobs;
CREATE POLICY "anon_update_ingestion" ON ingestion_jobs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_ingestion" ON ingestion_jobs;
CREATE POLICY "anon_delete_ingestion" ON ingestion_jobs FOR DELETE TO anon, authenticated USING (true);

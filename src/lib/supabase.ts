import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Type definitions matching the database schema

export interface PBMVendor {
  id: string;
  vendor_code: string;
  vendor_name: string;
  plan_group: string;
  pricing_model: string;
  created_at: string;
}

export interface Drug {
  id: string;
  ndc_11: string;
  rxcui: string | null;
  drug_name: string;
  therapeutic_class: string;
  is_specialty: boolean;
  nadac_benchmark_unit: number | null;
  package_size: number;
  package_unit: string;
  created_at: string;
}

export interface DrugPBMPricing {
  id: string;
  drug_id: string;
  pbm_vendor_id: string;
  pharmacy_reimbursement: number;
  rebate_passed_thru: number;
  bfsf_admin_fee: number;
  amt_billed_plan: number;
  true_net_price: number;
  tnp_per_unit: number;
  spread_amount: number;
  days_supply: number;
  claim_count: number;
  created_at: string;
  pbm_vendors?: PBMVendor;
  drugs?: Drug;
}

export interface AuditAnomaly {
  id: string;
  claim_ref: string;
  pbm_vendor_id: string | null;
  drug_id: string | null;
  anomaly_type: string;
  severity: string;
  description: string;
  dollar_amount: number;
  status: string;
  detected_at: string;
  resolved_at: string | null;
  pbm_vendors?: PBMVendor;
  drugs?: Drug;
}

export interface IngestionJob {
  id: string;
  pbm_vendor_id: string | null;
  filename: string;
  file_size_mb: number | null;
  row_count: number | null;
  status: string;
  error_details: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  pbm_vendors?: PBMVendor;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  actor_role: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  hash_prev: string | null;
  hash_current: string | null;
  created_at: string;
}

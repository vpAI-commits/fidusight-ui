import { useState, useEffect, useMemo } from 'react';
import {
  Activity,
  Pill,
  ShieldAlert,
  TrendingDown,
  DollarSign,
  Building2,
  AlertTriangle,
  ArrowRight,
  Layers,
  FileUp,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Drug, DrugPBMPricing, PBMVendor, AuditAnomaly, IngestionJob } from '@/lib/supabase';
import { formatCurrency, formatNumber, formatCurrencyShort } from '@/lib/format';
import { cn } from '@/lib/utils';

export default function DashboardOverview({ onNavigate }: { onNavigate: (view: string) => void }) {
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [pricing, setPricing] = useState<DrugPBMPricing[]>([]);
  const [vendors, setVendors] = useState<PBMVendor[]>([]);
  const [anomalies, setAnomalies] = useState<AuditAnomaly[]>([]);
  const [jobs, setJobs] = useState<IngestionJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      const [drugsRes, pricingRes, vendorsRes, anomRes, jobsRes] = await Promise.all([
        supabase.from('drugs').select('*'),
        supabase.from('drug_pbm_pricing').select('*, pbm_vendors(*)'),
        supabase.from('pbm_vendors').select('*'),
        supabase.from('audit_anomalies').select('*, pbm_vendors(*), drugs(*)').order('detected_at', { ascending: false }).limit(5),
        supabase.from('ingestion_jobs').select('*, pbm_vendors(*)').order('created_at', { ascending: false }),
      ]);
      if (drugsRes.data) setDrugs(drugsRes.data);
      if (pricingRes.data) setPricing(pricingRes.data);
      if (vendorsRes.data) setVendors(vendorsRes.data);
      if (anomRes.data) setAnomalies(anomRes.data);
      if (jobsRes.data) setJobs(jobsRes.data);
      setLoading(false);
    }
    loadData();
  }, []);

  const stats = useMemo(() => {
    const totalClaims = pricing.reduce((s, p) => s + p.claim_count, 0);
    const totalSpend = pricing.reduce((s, p) => s + p.true_net_price * p.claim_count, 0);
    const openViolations = anomalies.filter((a) => a.status === 'OPEN').length;
    const totalExposure = anomalies
      .filter((a) => a.status === 'OPEN')
      .reduce((s, a) => s + a.dollar_amount, 0);
    const completedJobs = jobs.filter((j) => j.status === 'COMPLETED').length;
    const totalRowsIngested = jobs.filter((j) => j.status === 'COMPLETED').reduce((s, j) => s + (j.row_count || 0), 0);

    // Calculate potential savings (max arbitrage per drug * claim count)
    const drugSavings = drugs.map((drug) => {
      const drugPricing = pricing.filter((p) => p.drug_id === drug.id);
      if (drugPricing.length < 2) return 0;
      const minTNP = Math.min(...drugPricing.map((p) => p.true_net_price));
      const maxTNP = Math.max(...drugPricing.map((p) => p.true_net_price));
      const claimsOnExpensive = drugPricing
        .filter((p) => p.true_net_price > minTNP)
        .reduce((s, p) => s + p.claim_count, 0);
      return (maxTNP - minTNP) * claimsOnExpensive;
    });
    const potentialAnnualSavings = drugSavings.reduce((s, v) => s + v, 0) * 2; // H1 * 2 for annual

    return {
      totalDrugs: drugs.length,
      totalClaims,
      totalSpend,
      openViolations,
      totalExposure,
      completedJobs,
      totalRowsIngested,
      potentialAnnualSavings,
      pbmCount: vendors.length,
    };
  }, [drugs, pricing, anomalies, jobs, vendors]);

  const topSavingsDrugs = useMemo(() => {
    return drugs.map((drug) => {
      const drugPricing = pricing.filter((p) => p.drug_id === drug.id);
      if (drugPricing.length < 2) return null;
      const minTNP = Math.min(...drugPricing.map((p) => p.true_net_price));
      const maxTNP = Math.max(...drugPricing.map((p) => p.true_net_price));
      const winner = drugPricing.find((p) => p.true_net_price === minTNP);
      const winnerVendor = vendors.find((v) => v.id === winner?.pbm_vendor_id);
      return {
        drug,
        savingsPerFill: maxTNP - minTNP,
        savingsPct: maxTNP > 0 ? ((maxTNP - minTNP) / maxTNP) * 100 : 0,
        winnerName: winnerVendor?.vendor_name || '',
      };
    })
      .filter(Boolean)
      .sort((a, b) => b!.savingsPerFill - a!.savingsPerFill)
      .slice(0, 5) as Array<{
        drug: Drug;
        savingsPerFill: number;
        savingsPct: number;
        winnerName: string;
      }>;
  }, [drugs, pricing, vendors]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-slate-400 text-sm">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Hero stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-slate-400" />
            <span className="text-xs text-slate-500 uppercase tracking-wider">Total Plan Spend (H1)</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">{formatCurrencyShort(stats.totalSpend)}</div>
          <div className="text-xs text-slate-400 mt-1">{formatNumber(stats.totalClaims)} claims across {stats.pbmCount} PBMs</div>
        </div>
        <div className="stat-card border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-4 h-4 text-emerald-600" />
            <span className="text-xs text-slate-500 uppercase tracking-wider">Potential Annual Savings</span>
          </div>
          <div className="text-2xl font-bold text-emerald-700">{formatCurrencyShort(stats.potentialAnnualSavings)}</div>
          <div className="text-xs text-emerald-600 mt-1">via cross-PBM arbitrage</div>
        </div>
        <div className="stat-card border-red-200">
          <div className="flex items-center gap-2 mb-2">
            <ShieldAlert className="w-4 h-4 text-red-500" />
            <span className="text-xs text-slate-500 uppercase tracking-wider">Open Violations</span>
          </div>
          <div className="text-2xl font-bold text-red-600">{stats.openViolations}</div>
          <div className="text-xs text-slate-400 mt-1">{formatCurrencyShort(stats.totalExposure)} exposure</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <FileUp className="w-4 h-4 text-sky-500" />
            <span className="text-xs text-slate-500 uppercase tracking-wider">Claims Ingested</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">{formatNumber(stats.totalRowsIngested)}</div>
          <div className="text-xs text-slate-400 mt-1">{stats.completedJobs} completed jobs</div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { id: 'comparator', label: 'Compare Drug Prices', icon: Pill, desc: 'Side-by-side PBM TNP analysis', color: 'teal' },
          { id: 'arbitrage', label: 'Simulate Carve-Out', icon: Layers, desc: 'Class-level arbitrage modeling', color: 'sky' },
          { id: 'compliance', label: 'Review Violations', icon: ShieldAlert, desc: 'ERISA breach alerts & cure notices', color: 'red' },
          { id: 'ingestion', label: 'Ingest PBM Files', icon: FileUp, desc: 'Upload & validate CAA reports', color: 'amber' },
        ].map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              onClick={() => onNavigate(action.id)}
              className="card p-4 card-hover text-left group"
            >
              <div className={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center mb-3',
                action.color === 'teal' && 'bg-teal-100 text-teal-600',
                action.color === 'sky' && 'bg-sky-100 text-sky-600',
                action.color === 'red' && 'bg-red-100 text-red-600',
                action.color === 'amber' && 'bg-amber-100 text-amber-600',
              )}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="font-semibold text-slate-900 text-sm mb-1">{action.label}</div>
              <div className="text-xs text-slate-400">{action.desc}</div>
              <div className="flex items-center gap-1 mt-2 text-xs font-medium text-slate-400 group-hover:text-teal-600 transition-colors">
                Open <ArrowRight className="w-3 h-3" />
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top arbitrage opportunities */}
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-emerald-600" />
              Top Arbitrage Opportunities
            </h3>
            <button onClick={() => onNavigate('comparator')} className="text-xs text-teal-600 hover:text-teal-700 font-medium">
              View all →
            </button>
          </div>
          <div className="p-4 space-y-3">
            {topSavingsDrugs.map((item, idx) => (
              <div key={item.drug.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500">
                    {idx + 1}
                  </span>
                  <div>
                    <div className="font-medium text-slate-900 text-sm">{item.drug.drug_name.split('(')[0].trim()}</div>
                    <div className="text-xs text-slate-400">
                      Best: <span className="font-medium text-teal-600">{item.winnerName.split(' ')[0]}</span>
                      {' · '}<span className="text-emerald-600">{item.savingsPct.toFixed(1)}% savings</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-emerald-600">{formatCurrency(item.savingsPerFill)}</div>
                  <div className="text-xs text-slate-400">per fill</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent compliance alerts */}
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-500" />
              Recent Compliance Alerts
            </h3>
            <button onClick={() => onNavigate('compliance')} className="text-xs text-teal-600 hover:text-teal-700 font-medium">
              View all →
            </button>
          </div>
          <div className="p-4 space-y-3">
            {anomalies.slice(0, 5).map((anom) => {
              const vendor = anom.pbm_vendors || vendors.find((v) => v.id === anom.pbm_vendor_id);
              const drug = anom.drugs || drugs.find((d) => d.id === anom.drug_id);
              return (
                <div key={anom.id} className="flex items-start gap-3 py-2 border-b border-slate-50 last:border-0">
                  <div className={cn(
                    'w-2 h-2 rounded-full mt-1.5 flex-shrink-0',
                    anom.severity === 'CRITICAL_ERISA_BREACH' ? 'bg-red-500' :
                    anom.severity === 'HIGH' ? 'bg-orange-500' :
                    anom.severity === 'MEDIUM' ? 'bg-amber-500' : 'bg-slate-400'
                  )} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-900 text-sm">
                      {anom.anomaly_type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
                    </div>
                    <div className="text-xs text-slate-400 truncate">
                      {vendor?.vendor_name.split(' ')[0]} · {drug?.drug_name.split('(')[0].trim()}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-semibold text-slate-700">{formatCurrencyShort(anom.dollar_amount)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* PBM vendor summary */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-400" />
            Active PBM Vendors
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Plan Group</th>
                <th>Pricing Model</th>
                <th className="text-right">Drugs Covered</th>
                <th className="text-right">Claims (H1)</th>
                <th className="text-right">Total Spend (H1)</th>
                <th className="text-right">Avg TNP</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((vendor) => {
                const vendorPricing = pricing.filter((p) => p.pbm_vendor_id === vendor.id);
                const drugCount = vendorPricing.length;
                const claims = vendorPricing.reduce((s, p) => s + p.claim_count, 0);
                const spend = vendorPricing.reduce((s, p) => s + p.true_net_price * p.claim_count, 0);
                const avgTNP = drugCount > 0 ? vendorPricing.reduce((s, p) => s + p.true_net_price, 0) / drugCount : 0;
                return (
                  <tr key={vendor.id}>
                    <td className="font-medium text-slate-900">{vendor.vendor_name}</td>
                    <td className="text-slate-600">{vendor.plan_group}</td>
                    <td>
                      <span className={cn(
                        'badge',
                        vendor.pricing_model === 'PASS_THRU' ? 'badge-success' : 'badge-warning'
                      )}>
                        {vendor.pricing_model.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="text-right text-slate-500">{drugCount}</td>
                    <td className="text-right text-slate-500">{formatNumber(claims)}</td>
                    <td className="text-right font-medium text-slate-700">{formatCurrencyShort(spend)}</td>
                    <td className="text-right font-medium text-slate-700">{formatCurrency(avgTNP)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

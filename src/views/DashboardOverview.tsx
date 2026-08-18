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
  const [vendors, setVendors] = useState<PBMVendor[]>([]);
  const [anomalies, setAnomalies] = useState<AuditAnomaly[]>([]);
  const [jobs, setJobs] = useState<IngestionJob[]>([]);
  const [claims, setClaims] = useState<any[]>([]); // ADDED: Live claims state
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      const [drugsRes, vendorsRes, anomRes, jobsRes, claimsRes] = await Promise.all([
        supabase.from('drugs').select('*'),
        supabase.from('pbm_vendors').select('*'),
        supabase.from('audit_anomalies').select('*, pbm_vendors(*), drugs(*)').order('detected_at', { ascending: false }).limit(5),
        supabase.from('ingestion_jobs').select('*, pbm_vendors(*)').order('created_at', { ascending: false }),
        supabase.from('claims').select('*'), // FETCH LIVE CLAIMS
      ]);
      
      if (drugsRes.data) setDrugs(drugsRes.data);
      if (vendorsRes.data) setVendors(vendorsRes.data);
      if (anomRes.data) setAnomalies(anomRes.data);
      if (jobsRes.data) setJobs(jobsRes.data);
      if (claimsRes.data) setClaims(claimsRes.data);
      
      setLoading(false);
    }
    loadData();
  }, []);

  const stats = useMemo(() => {
    // Dynamically calculate from the newly ingested claims table
    const totalClaims = claims.length;
    const totalSpend = claims.reduce((s, c) => s + Number(c.true_net_price || 0), 0);
    
    const openViolations = anomalies.filter((a) => a.status === 'OPEN').length;
    const totalExposure = anomalies
      .filter((a) => a.status === 'OPEN')
      .reduce((s, a) => s + a.dollar_amount, 0);
      
    const completedJobs = jobs.filter((j) => j.status === 'COMPLETED').length;
    const totalRowsIngested = jobs.filter((j) => j.status === 'COMPLETED').reduce((s, j) => s + (j.row_count || 0), 0);

    // Calculate potential savings (Arbitrage engine using live claims)
    const drugNames = [...new Set(claims.map(c => c.drug_name))];
    let potentialAnnualSavings = 0;

    drugNames.forEach(drugName => {
      const drugClaims = claims.filter(c => c.drug_name === drugName);
      const uniquePBMs = [...new Set(drugClaims.map(c => c.pbm_vendor_id))];
      
      if (uniquePBMs.length > 1) {
        const tnpByPBM = uniquePBMs.map(pbmId => {
          const pbmClaims = drugClaims.filter(c => c.pbm_vendor_id === pbmId);
          return pbmClaims.reduce((s, c) => s + Number(c.true_net_price || 0), 0) / pbmClaims.length;
        });
        
        const minTNP = Math.min(...tnpByPBM);
        const maxTNP = Math.max(...tnpByPBM);
        const expensiveClaims = drugClaims.filter(c => Number(c.true_net_price || 0) > minTNP).length;
        
        potentialAnnualSavings += (maxTNP - minTNP) * expensiveClaims;
      }
    });
    
    potentialAnnualSavings *= 2; // Multiply by 2 for Annual Projection

    // Get unique PBM count straight from the data
    const uniquePBMCount = new Set(claims.map(c => c.pbm_vendor_id)).size;

    return {
      totalDrugs: drugNames.length,
      totalClaims,
      totalSpend,
      openViolations,
      totalExposure,
      completedJobs,
      totalRowsIngested,
      potentialAnnualSavings,
      pbmCount: uniquePBMCount,
    };
  }, [claims, anomalies, jobs]);

  const topSavingsDrugs = useMemo(() => {
    // Generate Arbitrage insights from live claims
    const drugNames = [...new Set(claims.map(c => c.drug_name))];
    const savings = drugNames.map(drugName => {
      const drugClaims = claims.filter(c => c.drug_name === drugName);
      const uniquePBMs = [...new Set(drugClaims.map(c => c.pbm_vendor_id))];
      
      if (uniquePBMs.length < 2) return null;

      const pbmStats = uniquePBMs.map(pbmName => {
        const pbmClaims = drugClaims.filter(c => c.pbm_vendor_id === pbmName);
        const avgTnp = pbmClaims.reduce((sum, c) => sum + Number(c.true_net_price || 0), 0) / pbmClaims.length;
        return { pbmName, avgTnp };
      });

      const minStat = pbmStats.reduce((prev, curr) => prev.avgTnp < curr.avgTnp ? prev : curr);
      const maxStat = pbmStats.reduce((prev, curr) => prev.avgTnp > curr.avgTnp ? prev : curr);

      return {
        id: drugName,
        drug_name: drugName,
        savingsPerFill: maxStat.avgTnp - minStat.avgTnp,
        savingsPct: maxStat.avgTnp > 0 ? ((maxStat.avgTnp - minStat.avgTnp) / maxStat.avgTnp) * 100 : 0,
        winnerName: minStat.pbmName
      };
    }).filter(Boolean) as any[];

    return savings.sort((a, b) => b.savingsPerFill - a.savingsPerFill).slice(0, 5);
  }, [claims]);

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
            {topSavingsDrugs.length === 0 ? (
               <div className="text-sm text-slate-500 py-4 text-center">Ingest more overlapping PBM claims to identify arbitrage.</div>
            ) : topSavingsDrugs.map((item, idx) => (
              <div key={item.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500">
                    {idx + 1}
                  </span>
                  <div>
                    <div className="font-medium text-slate-900 text-sm">{item.drug_name.split('(')[0].trim()}</div>
                    <div className="text-xs text-slate-400">
                      Best: <span className="font-medium text-teal-600">{item.winnerName}</span>
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
            {anomalies.length === 0 ? (
              <div className="text-sm text-slate-500 py-4 text-center">No open ERISA violations detected.</div>
            ) : anomalies.slice(0, 5).map((anom) => {
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
                      {vendor?.vendor_name.split(' ')[0] || 'Unknown'} · {drug?.drug_name.split('(')[0].trim() || 'Unknown'}
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

      {/* PBM vendor summary generated from Claims */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-400" />
            Active PBM Vendors
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table w-full text-left">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="p-4 text-xs font-medium text-slate-500">Vendor</th>
                <th className="p-4 text-xs font-medium text-slate-500">Plan Group</th>
                <th className="p-4 text-xs font-medium text-slate-500">Pricing Model</th>
                <th className="p-4 text-xs font-medium text-slate-500 text-right">Drugs Covered</th>
                <th className="p-4 text-xs font-medium text-slate-500 text-right">Claims (H1)</th>
                <th className="p-4 text-xs font-medium text-slate-500 text-right">Total Spend (H1)</th>
                <th className="p-4 text-xs font-medium text-slate-500 text-right">Avg TNP</th>
              </tr>
            </thead>
            <tbody>
              {/* Extracting Unique Vendors straight from live claims */}
              {[...new Set(claims.map(c => c.pbm_vendor_id))].filter(Boolean).map((pbmName) => {
                const vendorClaims = claims.filter(c => c.pbm_vendor_id === pbmName);
                const drugCount = new Set(vendorClaims.map(c => c.drug_name)).size;
                const claimsCount = vendorClaims.length;
                const spend = vendorClaims.reduce((s, c) => s + Number(c.true_net_price || 0), 0);
                const avgTNP = claimsCount > 0 ? spend / claimsCount : 0;
                
                return (
                  <tr key={pbmName as string} className="border-b border-slate-100">
                    <td className="p-4 font-medium text-slate-900">{pbmName as string}</td>
                    <td className="p-4 text-slate-600">Commercial</td>
                    <td className="p-4">
                      <span className="badge badge-success">PASS THRU</span>
                    </td>
                    <td className="p-4 text-right text-slate-500">{drugCount}</td>
                    <td className="p-4 text-right text-slate-500">{formatNumber(claimsCount)}</td>
                    <td className="p-4 text-right font-medium text-slate-700">{formatCurrencyShort(spend)}</td>
                    <td className="p-4 text-right font-medium text-slate-700">{formatCurrency(avgTNP)}</td>
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

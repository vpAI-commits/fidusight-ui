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
  Info
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Drug, PBMVendor, AuditAnomaly, IngestionJob } from '@/lib/supabase';
import { formatCurrency, formatNumber, formatCurrencyShort } from '@/lib/format';
import { cn } from '@/lib/utils';

// --- REUSABLE TOOLTIP COMPONENT ---
const InfoTooltip = ({ text }: { text: string }) => (
  <div className="group relative inline-flex items-center ml-1.5 cursor-help align-middle">
    <Info className="w-3.5 h-3.5 text-slate-400 hover:text-teal-500 transition-colors" />
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-56 p-2.5 bg-slate-800 text-white text-xs rounded-lg shadow-xl z-50 font-normal leading-relaxed text-left normal-case tracking-normal">
      {text}
      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
    </div>
  </div>
);

export default function DashboardOverview({ onNavigate }: { onNavigate: (view: string) => void }) {
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [vendors, setVendors] = useState<PBMVendor[]>([]);
  const [anomalies, setAnomalies] = useState<AuditAnomaly[]>([]);
  const [jobs, setJobs] = useState<IngestionJob[]>([]);
  const [claims, setClaims] = useState<any[]>([]); 
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      const [drugsRes, vendorsRes, anomRes, jobsRes, claimsRes] = await Promise.all([
        supabase.from('drugs').select('*'),
        supabase.from('pbm_vendors').select('*'),
        supabase.from('audit_anomalies').select('*, pbm_vendors(*), drugs(*)').order('detected_at', { ascending: false }).limit(5),
        supabase.from('ingestion_jobs').select('*, pbm_vendors(*)').order('created_at', { ascending: false }),
        supabase.from('claims').select('*'), 
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
    const totalClaims = claims.length;
    const totalSpend = claims.reduce((s, c) => s + Number(c.true_net_price || 0), 0);
    const openViolations = anomalies.filter((a) => a.status === 'OPEN').length;
    const totalExposure = anomalies
      .filter((a) => a.status === 'OPEN')
      .reduce((s, a) => s + a.dollar_amount, 0);
      
    const completedJobs = jobs.filter((j) => j.status === 'COMPLETED').length;
    const totalRowsIngested = jobs.filter((j) => j.status === 'COMPLETED').reduce((s, j) => s + (j.row_count || 0), 0);

    const drugNames = [...new Set(claims.map(c => c.drug_name))];
    let potentialAnnualSavings = 0;

    drugNames.forEach(drugName => {
      const drugClaims = claims.filter(c => c.drug_name === drugName);
      const uniqueContracts = [...new Set(drugClaims.map(c => `${c.pbm_vendor_id}::${c.pbm_plan_id}`))];
      
      if (uniqueContracts.length > 1) {
        const tnpByContract = uniqueContracts.map(contract => {
          const [pbm, plan] = contract.split('::');
          const contractClaims = drugClaims.filter(c => c.pbm_vendor_id === pbm && c.pbm_plan_id === plan);
          return contractClaims.reduce((s, c) => s + Number(c.true_net_price || 0), 0) / contractClaims.length;
        });
        
        const minTNP = Math.min(...tnpByContract);
        const maxTNP = Math.max(...tnpByContract);
        const expensiveClaims = drugClaims.filter(c => Number(c.true_net_price || 0) > minTNP).length;
        
        potentialAnnualSavings += (maxTNP - minTNP) * expensiveClaims;
      }
    });
    
    potentialAnnualSavings *= 2; // Multiply by 2 for Annual Projection
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
    const drugNames = [...new Set(claims.map(c => c.drug_name))];
    const savings = drugNames.map(drugName => {
      const drugClaims = claims.filter(c => c.drug_name === drugName);
      const uniqueContracts = [...new Set(drugClaims.map(c => `${c.pbm_vendor_id}::${c.pbm_plan_id}`))];
      
      if (uniqueContracts.length < 2) return null;

      const contractStats = uniqueContracts.map(contract => {
        const [pbm, plan] = contract.split('::');
        const contractClaims = drugClaims.filter(c => c.pbm_vendor_id === pbm && c.pbm_plan_id === plan);
        const avgTnp = contractClaims.reduce((sum, c) => sum + Number(c.true_net_price || 0), 0) / contractClaims.length;
        return { contractName: `${pbm} ${plan}`, avgTnp };
      });

      const minStat = contractStats.reduce((prev, curr) => prev.avgTnp < curr.avgTnp ? prev : curr);
      const maxStat = contractStats.reduce((prev, curr) => prev.avgTnp > curr.avgTnp ? prev : curr);

      return {
        id: drugName,
        drug_name: drugName,
        savingsPerFill: maxStat.avgTnp - minStat.avgTnp,
        savingsPct: maxStat.avgTnp > 0 ? ((maxStat.avgTnp - minStat.avgTnp) / maxStat.avgTnp) * 100 : 0,
        winnerName: minStat.contractName
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
    <div className="p-6 space-y-6 max-w-7xl mx-auto animate-fade-in">
      {/* Hero stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-slate-400" />
            <span className="text-xs text-slate-500 uppercase tracking-wider">
              Total Plan Spend (H1)
              <InfoTooltip text="The cumulative True Net Price (TNP) paid by the plan sponsor across all claims during the first half of the year." />
            </span>
          </div>
          <div className="text-2xl font-bold text-slate-900">{formatCurrencyShort(stats.totalSpend)}</div>
          <div className="text-xs text-slate-400 mt-1">{formatNumber(stats.totalClaims)} claims across {stats.pbmCount} PBMs</div>
        </div>
        <div className="stat-card border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-4 h-4 text-emerald-600" />
            <span className="text-xs text-slate-500 uppercase tracking-wider">
              Potential Annual Savings
              <InfoTooltip text="Projected 12-month savings if all claims were routed to the lowest-cost PBM/Plan contract identified in the arbitrage engine." />
            </span>
          </div>
          <div className="text-2xl font-bold text-emerald-700">{formatCurrencyShort(stats.potentialAnnualSavings)}</div>
          <div className="text-xs text-emerald-600 mt-1">via cross-PBM arbitrage</div>
        </div>
        <div className="stat-card border-red-200">
          <div className="flex items-center gap-2 mb-2">
            <ShieldAlert className="w-4 h-4 text-red-500" />
            <span className="text-xs text-slate-500 uppercase tracking-wider">
              Open Violations
              <InfoTooltip text="Active claims that breached ERISA §408(b)(2) fee disclosure rules or exhibit excessive spread pricing." />
            </span>
          </div>
          <div className="text-2xl font-bold text-red-600">{stats.openViolations}</div>
          <div className="text-xs text-slate-400 mt-1">{formatCurrencyShort(stats.totalExposure)} exposure</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <FileUp className="w-4 h-4 text-sky-500" />
            <span className="text-xs text-slate-500 uppercase tracking-wider">
              Claims Ingested
              <InfoTooltip text="Total number of prescription fills processed and enriched with RxNorm data." />
            </span>
          </div>
          <div className="text-2xl font-bold text-slate-900">{formatNumber(stats.totalClaims)}</div>
          <div className="text-xs text-slate-400 mt-1">{stats.completedJobs} completed file jobs</div>
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
              <InfoTooltip text="Specific medications with the widest pricing gaps between your contracted health plans." />
            </h3>
            <button onClick={() => onNavigate('comparator')} className="text-xs text-teal-600 hover:text-teal-700 font-medium">
              View all 
            </button>
          </div>
          <div className="p-4 space-y-3">
            {topSavingsDrugs.length === 0 ? (
               <div className="text-sm text-slate-500 py-4 text-center">Ingest more overlapping claims to identify arbitrage.</div>
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
                      {' • '}<span className="text-emerald-600">{item.savingsPct.toFixed(1)}% savings</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-emerald-600">{formatCurrency(item.savingsPerFill)}</div>
                  <div className="text-xs text-slate-400">spread per fill</div>
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
              <InfoTooltip text="Newly detected contract violations requiring fiduciary action." />
            </h3>
            <button onClick={() => onNavigate('compliance')} className="text-xs text-teal-600 hover:text-teal-700 font-medium">
              View all 
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
                      {vendor?.vendor_name.split(' ')[0] || 'Unknown'} • {drug?.drug_name.split('(')[0].trim() || 'Unknown'}
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
            Active Health Plan Contracts
            <InfoTooltip text="A summary of all unique PBM-to-Plan relationships identified in your uploaded claims data." />
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table w-full text-left">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="p-4 text-xs font-medium text-slate-500">
                  PBM <InfoTooltip text="Pharmacy Benefit Manager administering the claims." />
                </th>
                <th className="p-4 text-xs font-medium text-slate-500">
                  Plan Code <InfoTooltip text="The specific health plan or carve-out group identifier." />
                </th>
                <th className="p-4 text-xs font-medium text-slate-500 text-right">
                  Drugs Covered <InfoTooltip text="Count of unique NDCs processed under this plan." />
                </th>
                <th className="p-4 text-xs font-medium text-slate-500 text-right">
                  Claims (H1) <InfoTooltip text="Total volume of prescription fills." />
                </th>
                <th className="p-4 text-xs font-medium text-slate-500 text-right">
                  Total Spend (H1) <InfoTooltip text="Total True Net Price paid by the plan." />
                </th>
                <th className="p-4 text-xs font-medium text-slate-500 text-right">
                  Avg TNP <InfoTooltip text="Average True Net Price per prescription fill." />
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Extracting Unique Vendor/Plan combinations straight from live claims */}
              {[...new Set(claims.map(c => `${c.pbm_vendor_id}::${c.pbm_plan_id}`))].filter(Boolean).map((contract) => {
                const [pbmName, planCode] = contract.split('::');
                const vendorClaims = claims.filter(c => c.pbm_vendor_id === pbmName && c.pbm_plan_id === planCode);
                const drugCount = new Set(vendorClaims.map(c => c.drug_name)).size;
                const claimsCount = vendorClaims.length;
                const spend = vendorClaims.reduce((s, c) => s + Number(c.true_net_price || 0), 0);
                const avgTNP = claimsCount > 0 ? spend / claimsCount : 0;
                
                return (
                  <tr key={contract} className="border-b border-slate-100">
                    <td className="p-4 font-bold text-slate-900">{pbmName}</td>
                    <td className="p-4 text-slate-600 font-mono text-xs">{planCode}</td>
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

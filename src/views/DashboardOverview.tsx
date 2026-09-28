import { useState, useEffect, useMemo } from 'react';
import {
  ShieldAlert,
  TrendingDown,
  Building2,
  AlertTriangle,
  ArrowRight,
  Layers,
  FileUp,
  CheckCircle2,
  Clock,
  Sparkles,
  ExternalLink,
  Info,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Drug, PBMVendor, AuditAnomaly, IngestionJob } from '@/lib/supabase';
import { formatCurrency, formatCurrencyShort } from '@/lib/format';
import { cn } from '@/lib/utils';

const InfoTooltip = ({ text }: { text: string }) => (
  <div className="group relative inline-flex items-center ml-1.5 cursor-help align-middle">
    <Info className="w-3.5 h-3.5 text-slate-400 hover:text-teal-500 transition-colors" />
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-56 p-2.5 bg-slate-800 text-white text-xs rounded-lg shadow-xl z-50 font-normal leading-relaxed text-left normal-case tracking-normal">
      {text}
      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
    </div>
  </div>
);

export default function FiduciaryCommandCenter({ onNavigate }: { onNavigate: (view: string) => void }) {
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [vendors, setVendors] = useState<PBMVendor[]>([]);
  const [anomalies, setAnomalies] = useState<AuditAnomaly[]>([]);
  const [jobs, setJobs] = useState<IngestionJob[]>([]);
  const [claims, setClaims] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadCommandCenterData() {
      try {
        const [drugsRes, vendorsRes, anomRes, jobsRes, claimsRes] = await Promise.all([
          supabase.from('drugs').select('*'),
          supabase.from('pbm_vendors').select('*'),
          supabase.from('audit_anomalies').select('*, pbm_vendors(*), drugs(*)').eq('status', 'OPEN').order('dollar_amount', { ascending: false }),
          supabase.from('ingestion_jobs').select('*').order('created_at', { ascending: false }),
          supabase.from('claims').select('*'),
        ]);

        if (drugsRes.data) setDrugs(drugsRes.data);
        if (vendorsRes.data) setVendors(vendorsRes.data);
        if (anomRes.data) setAnomalies(anomRes.data);
        if (jobsRes.data) setJobs(jobsRes.data);
        if (claimsRes.data) setClaims(claimsRes.data);
      } catch (err) {
        console.error('Failed to load command center data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadCommandCenterData();
  }, []);

  // Action Queue Metrics
  const actionQueue = useMemo(() => {
    const criticalBreaches = anomalies.filter(a => a.severity === 'CRITICAL_ERISA_BREACH');
    const totalExposure = anomalies.reduce((s, a) => s + Number(a.dollar_amount || 0), 0);
    
    // Calculate potential class-level savings across ingested claims
    let optimizedSavings = 0;
    const drugNames = [...new Set(claims.map(c => c.drug_name))];
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
        const volume = drugClaims.length;
        optimizedSavings += (maxTNP - minTNP) * volume;
      }
    });

    return {
      criticalBreaches,
      totalExposure,
      optimizedSavings: optimizedSavings * 2, // Annualized projection
    };
  }, [anomalies, claims]);

  // Top Class Arbitrage Opportunities
  const classArbitrageOpportunities = useMemo(() => {
    const classes = [...new Set(claims.map(c => c.therapeutic_class))].filter(Boolean);
    return classes.map(cls => {
      const classClaims = claims.filter(c => c.therapeutic_class === cls);
      const totalSpend = classClaims.reduce((s, c) => s + Number(c.true_net_price || 0), 0);
      return {
        className: cls,
        claimCount: classClaims.length,
        totalSpend,
        potentialSavings: totalSpend * 0.18 // Estimated 18% arbitrage variance
      };
    }).sort((a, b) => b.potentialSavings - a.potentialSavings).slice(0, 3);
  }, [claims]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[70vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm font-medium tracking-widest uppercase text-slate-400">Compiling Fiduciary Action Queue...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8 max-w-[1440px] mx-auto animate-fade-in">
      {/* Header Banner */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-200">
        <div>
          <h1 className="text-3xl font-light text-slate-900 tracking-tight">
            Good afternoon, Sara Doe.
          </h1>
          <p className="text-slate-500 mt-2 text-sm max-w-xl leading-relaxed">
            Your current active PBM contracts contain <strong className="text-red-600 font-semibold">{actionQueue.criticalBreaches.length} statutory breaches</strong> requiring your signature, and <strong className="text-emerald-600 font-semibold">{formatCurrencyShort(actionQueue.optimizedSavings)} in immediate class arbitrage</strong> opportunities.
          </p>
        </div>
        <div className="flex gap-4 shrink-0">
          <div className="text-right">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
              Total Liability Exposure
              <InfoTooltip text="Sum of unremitted rebate leakages and unauthorized spread margins across all open violations." />
            </div>
            <div className="text-2xl font-mono font-medium text-slate-900">{formatCurrency(actionQueue.totalExposure)}</div>
          </div>
          <div className="w-px bg-slate-200"></div>
          <div className="text-right">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
              Identified Waste (YTD)
              <InfoTooltip text="Projected annual savings from routing prescriptions to lower-cost contracted health plans." />
            </div>
            <div className="text-2xl font-mono font-medium text-slate-900">{formatCurrencyShort(actionQueue.optimizedSavings)}</div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* ACTION-ORIENTED COMPLIANCE INBOX */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-widest flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-600" />
              Fiduciary Action Queue (CAA 2026)
            </h2>
            <button 
              onClick={() => onNavigate('compliance')}
              className="text-xs font-semibold text-teal-600 hover:text-teal-700 flex items-center gap-1"
            >
              View All Violations <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="card divide-y divide-slate-100 overflow-hidden shadow-sm">
            {anomalies.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">
                No active compliance anomalies require review. System is fully optimized.
              </div>
            ) : (
              anomalies.slice(0, 4).map((anom) => (
                <div key={anom.id} className="p-4 hover:bg-slate-50/80 transition-colors flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "w-2.5 h-2.5 rounded-full mt-1.5 shrink-0",
                      anom.severity === 'CRITICAL_ERISA_BREACH' ? "bg-red-600 animate-pulse" : "bg-amber-500"
                    )} />
                    <div>
                      <div className="text-sm font-semibold text-slate-900">
                        {anom.anomaly_type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                        Ref: <span className="font-mono">{anom.claim_ref}</span> • {anom.description}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-mono font-bold text-red-600">{formatCurrency(anom.dollar_amount)}</div>
                    <button 
                      onClick={() => onNavigate('compliance')}
                      className="text-[10px] font-bold text-slate-600 hover:text-teal-600 uppercase tracking-wider mt-1 inline-flex items-center gap-0.5"
                    >
                      Issue Cure Notice <ExternalLink className="w-2.5 h-2.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* CLASS ARBITRAGE & CARVE-OUT SIMULATOR TEASER */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-widest flex items-center gap-2">
              <Layers className="w-4 h-4 text-sky-600" />
              High-Yield Class Arbitrage Opportunities
            </h2>
            <button 
              onClick={() => onNavigate('arbitrage')}
              className="text-xs font-semibold text-teal-600 hover:text-teal-700 flex items-center gap-1"
            >
              Open Simulator <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="card divide-y divide-slate-100 overflow-hidden shadow-sm">
            {classArbitrageOpportunities.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">
                Ingest claims data to unlock therapeutic class arbitrage modeling.
              </div>
            ) : (
              classArbitrageOpportunities.map((opp, idx) => (
                <div key={idx} className="p-4 hover:bg-slate-50/80 transition-colors flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 font-bold flex items-center justify-center text-xs">
                      {idx + 1}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{opp.className}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {opp.claimCount} claims audited • Total Spend: {formatCurrencyShort(opp.totalSpend)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-mono font-bold text-emerald-600">
                      +{formatCurrencyShort(opp.potentialSavings)}
                    </div>
                    <div className="text-[10px] text-slate-400 uppercase tracking-wider mt-0.5">Projected Savings</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* QUICK WORKFLOW NAVIGATION BAR */}
      <section className="pt-4">
        <h2 className="text-sm font-bold text-slate-900 uppercase tracking-widest mb-4">
          Fiduciary Analytics Workflows
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { id: 'comparator', label: 'Drug Comparator', desc: 'Side-by-side TNP-30 waterfall analysis', icon: Sparkles, color: 'teal' },
            { id: 'arbitrage', label: 'Class Arbitrage', desc: 'Simulate specialty drug carve-outs', icon: Layers, color: 'sky' },
            { id: 'compliance', label: 'Compliance Audit', desc: 'ERISA §408(b)(2) & 30-day cure notices', icon: ShieldAlert, color: 'red' },
            { id: 'ingestion', label: 'Data Ingestion', desc: 'Upload PBM claims files & validate schema', icon: FileUp, color: 'amber' },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className="card p-5 text-left card-hover group flex flex-col justify-between"
              >
                <div>
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center mb-4 transition-transform group-hover:scale-110",
                    item.color === 'teal' && "bg-teal-50 text-teal-600",
                    item.color === 'sky' && "bg-sky-50 text-sky-600",
                    item.color === 'red' && "bg-red-50 text-red-600",
                    item.color === 'amber' && "bg-amber-50 text-amber-600",
                  )}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="font-bold text-slate-900 text-sm mb-1">{item.label}</div>
                  <div className="text-xs text-slate-500 leading-relaxed">{item.desc}</div>
                </div>
                <div className="flex items-center gap-1 mt-4 text-xs font-semibold text-teal-600 group-hover:translate-x-1 transition-transform">
                  Launch Module <ArrowRight className="w-3 h-3" />
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

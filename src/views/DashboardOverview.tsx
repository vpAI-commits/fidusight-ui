import { useState, useEffect, useMemo } from 'react';
import {
  ShieldAlert,
  TrendingDown,
  AlertTriangle,
  ArrowRight,
  FileText,
  CheckCircle,
  Clock,
  Scale,
  BriefcaseMedical,
  ChevronRight
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatNumber, formatCurrencyShort } from '@/lib/format';
import { cn } from '@/lib/utils';

export default function FiduciaryCommandCenter({ onNavigate }: { onNavigate: (view: string) => void }) {
  const [anomalies, setAnomalies] = useState<any[]>([]);
  const [claims, setClaims] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      const [anomRes, claimsRes] = await Promise.all([
        supabase.from('audit_anomalies').select('*, pbm_vendors(*), drugs(*)').eq('status', 'OPEN').order('dollar_amount', { ascending: false }),
        supabase.from('claims').select('*'),
      ]);
      
      if (anomRes.data) setAnomalies(anomRes.data);
      if (claimsRes.data) setClaims(claimsRes.data);
      setLoading(false);
    }
    loadData();
  }, []);

  // UX Principle: Exception-Based UI. We only calculate what requires action.
  const actionQueue = useMemo(() => {
    const criticalBreaches = anomalies.filter(a => a.severity === 'CRITICAL_ERISA_BREACH');
    const totalExposure = anomalies.reduce((sum, a) => sum + Number(a.dollar_amount || 0), 0);
    
    // Calculate immediate arbitrage (Money left on the table)
    const drugNames = [...new Set(claims.map(c => c.drug_name))];
    let optimizedSavings = 0;
    const arbitrageActions: any[] = [];

    drugNames.forEach(drugName => {
      const drugClaims = claims.filter(c => c.drug_name === drugName);
      const uniqueContracts = [...new Set(drugClaims.map(c => `${c.pbm_vendor_id}::${c.pbm_plan_id}`))];
      
      if (uniqueContracts.length > 1) {
        const stats = uniqueContracts.map(contract => {
          const [pbm, plan] = contract.split('::');
          const matched = drugClaims.filter(c => c.pbm_vendor_id === pbm && c.pbm_plan_id === plan);
          const avgTnp = matched.reduce((s, c) => s + Number(c.true_net_price || 0), 0) / matched.length;
          return { contract: `${pbm} ${plan}`, tnp: avgTnp, count: matched.length };
        });
        
        const minStat = stats.reduce((p, c) => p.tnp < c.tnp ? p : c);
        const maxStat = stats.reduce((p, c) => p.tnp > c.tnp ? p : c);
        
        if (maxStat.tnp - minStat.tnp > 0) {
          const waste = (maxStat.tnp - minStat.tnp) * maxStat.count;
          optimizedSavings += waste;
          arbitrageActions.push({
            drug: drugName,
            waste,
            moveFrom: maxStat.contract,
            moveTo: minStat.contract,
            spread: maxStat.tnp - minStat.tnp
          });
        }
      }
    });

    return {
      criticalBreaches,
      totalExposure,
      optimizedSavings,
      topArbitrage: arbitrageActions.sort((a, b) => b.waste - a.waste).slice(0, 3)
    };
  }, [anomalies, claims]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400">
        <Scale className="w-8 h-8 mb-4 animate-pulse text-slate-300" />
        <span className="text-sm font-medium tracking-widest uppercase">Compiling Fiduciary Action Queue...</span>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-[1200px] mx-auto animate-fade-in space-y-8">
      
      {/* 
        UX Principle: The "So What?" Header
        Instead of a generic greeting, immediately state the fiduciary's liability and opportunity.
      */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-slate-200">
        <div>
          <h1 className="text-3xl font-light text-slate-900 tracking-tight">
            Good afternoon, Fiduciary.
          </h1>
          <p className="text-slate-500 mt-2 text-sm max-w-xl leading-relaxed">
            Your current active PBM contracts contain <strong className="text-red-600 font-semibold">{actionQueue.criticalBreaches.length} statutory breaches</strong> requiring your signature, and <strong className="text-emerald-600 font-semibold">{formatCurrencyShort(actionQueue.optimizedSavings)} in immediate class arbitrage</strong> opportunities.
          </p>
        </div>
        <div className="flex gap-4 shrink-0">
          <div className="text-right">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Liability Exposure</div>
            <div className="text-2xl font-mono font-medium text-slate-900">{formatCurrency(actionQueue.totalExposure)}</div>
          </div>
          <div className="w-px bg-slate-200"></div>
          <div className="text-right">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Identified Waste (YTD)</div>
            <div className="text-2xl font-mono font-medium text-slate-900">{formatCurrency(actionQueue.optimizedSavings)}</div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* 
          UX Principle: Action-Oriented Architecture
          This isn't a chart. It's a prioritized inbox of legal requirements.
        */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-widest flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-500" />
              Required Actions: CAA 2026 Breaches
            </h2>
            <button onClick={() => onNavigate('compliance')} className="text-xs font-semibold text-teal-600 hover:text-teal-700">Open Compliance Ledger &rarr;</button>
          </div>
          
          <div className="space-y-3">
            {actionQueue.criticalBreaches.length === 0 ? (
               <div className="card p-8 flex flex-col items-center justify-center text-center bg-slate-50/50 border-dashed">
                 <CheckCircle className="w-8 h-8 text-emerald-400 mb-3" />
                 <h3 className="text-sm font-bold text-slate-700">Zero Open Violations</h3>
                 <p className="text-xs text-slate-500 mt-1">All ingested PBM claims comply with ERISA §408(b)(2) pass-through standards.</p>
               </div>
            ) : actionQueue.criticalBreaches.slice(0, 4).map(breach => (
              <div key={breach.id} className="card p-4 flex items-center justify-between group hover:border-red-200 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center shrink-0 mt-0.5">
                    <Scale className="w-4 h-4 text-red-600" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-900">{breach.pbm_plan_id} • {breach.drugs?.drug_name.split(' ')[0]}</div>
                    <div className="text-xs text-slate-500 mt-0.5 max-w-[280px] truncate" title={breach.description}>
                      {breach.description}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right">
                    <div className="text-sm font-mono font-bold text-red-600">{formatCurrency(breach.dollar_amount)}</div>
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">Exposure</div>
                  </div>
                  <button 
                    onClick={() => onNavigate('compliance')}
                    className="w-8 h-8 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 group-hover:bg-teal-50 group-hover:text-teal-600 group-hover:border-teal-200 transition-all"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 
          UX Principle: Data Density & Progressive Disclosure
          Directing the CFO exactly to where the contract is bleeding money, without making them analyze the whole database.
        */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-widest flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-emerald-500" />
              Strategic Arbitrage Targets
            </h2>
            <button onClick={() => onNavigate('comparator')} className="text-xs font-semibold text-teal-600 hover:text-teal-700">Open Drug Comparator &rarr;</button>
          </div>
          
          <div className="space-y-3">
            {actionQueue.topArbitrage.length === 0 ? (
               <div className="card p-8 flex flex-col items-center justify-center text-center bg-slate-50/50 border-dashed">
                 <BriefcaseMedical className="w-8 h-8 text-slate-300 mb-3" />
                 <h3 className="text-sm font-bold text-slate-700">No Arbitrage Detected</h3>
                 <p className="text-xs text-slate-500 mt-1">Ingest multiple PBM contracts to detect pricing overlaps.</p>
               </div>
            ) : actionQueue.topArbitrage.map((arb, idx) => (
              <div key={idx} className="card p-4 relative overflow-hidden group hover:border-teal-200 transition-colors">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-bold text-slate-900">{arb.drug}</div>
                  <div className="text-sm font-mono font-bold text-emerald-600">{formatCurrency(arb.waste)} <span className="text-[10px] text-slate-400 font-sans uppercase">Savings</span></div>
                </div>
                
                <div className="flex items-center gap-3 text-xs">
                  <div className="flex-1 bg-slate-50 border border-slate-100 rounded-md p-2">
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Move From</div>
                    <div className="font-mono text-slate-700 font-medium truncate">{arb.moveFrom}</div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />
                  <div className="flex-1 bg-emerald-50/50 border border-emerald-100 rounded-md p-2">
                    <div className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider mb-0.5">Move To</div>
                    <div className="font-mono text-teal-900 font-medium truncate">{arb.moveTo}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* 
        UX Principle: Transparency & System Status
        The user needs to trust the pipeline. We show them the pulse of the engine.
      */}
      <section className="pt-6 border-t border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
             <div className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Engine Online</span>
          </div>
          <div className="w-px h-4 bg-slate-200"></div>
          <div className="text-xs font-medium text-slate-500">
            Evaluating <strong className="text-slate-700">{formatNumber(claims.length)}</strong> claim records across <strong className="text-slate-700">{new Set(claims.map(c => c.pbm_vendor_id)).size}</strong> PBM networks.
          </div>
        </div>
        
        <button onClick={() => onNavigate('ingestion')} className="btn btn-secondary py-1.5 px-3 text-xs font-semibold flex items-center gap-2 text-slate-600 hover:text-slate-900">
          <Clock className="w-3.5 h-3.5" />
          Ingest New Files
        </button>
      </section>

    </div>
  );
}

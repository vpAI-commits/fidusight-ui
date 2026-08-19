import { useState, useEffect, useMemo } from 'react';
import { 
  Layers, 
  TrendingDown, 
  DollarSign, 
  Activity, 
  ArrowRight,
  Stethoscope
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatNumber, formatCurrencyShort } from '@/lib/format';

export default function ClassArbitrage() {
  const [claims, setClaims] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      // Fetching the newly enriched claims data from the database
      const { data } = await supabase.from('claims').select('*');
      if (data) setClaims(data);
      setLoading(false);
    }
    loadData();
  }, []);

  // --- MACRO-ARBITRAGE ENGINE ---
  const classStats = useMemo(() => {
    // 1. Group all unique therapeutic classes identified by the Python Agent
    const classes = [...new Set(claims.map(c => c.therapeutic_class || 'Unclassified'))];
    
    return classes.map(tClass => {
      const classClaims = claims.filter(c => (c.therapeutic_class || 'Unclassified') === tClass);
      const totalClaims = classClaims.length;
      const totalSpend = classClaims.reduce((sum, c) => sum + Number(c.true_net_price || 0), 0);
      
      // 2. Calculate Arbitrage specific to this therapeutic class
      let classSavings = 0;
      const uniqueDrugs = [...new Set(classClaims.map(c => c.drug_name))];
      
      uniqueDrugs.forEach(drug => {
        const drugClaims = classClaims.filter(c => c.drug_name === drug);
        const pbms = [...new Set(drugClaims.map(c => c.pbm_vendor_id))];
        
        if (pbms.length > 1) {
          const pbmAvgs = pbms.map(pbm => {
            const pc = drugClaims.filter(c => c.pbm_vendor_id === pbm);
            return pc.reduce((s, c) => s + Number(c.true_net_price || 0), 0) / pc.length;
          });
          
          const minAvg = Math.min(...pbmAvgs);
          const maxAvg = Math.max(...pbmAvgs);
          const expensiveCount = drugClaims.filter(c => Number(c.true_net_price || 0) > minAvg).length;
          
          classSavings += (maxAvg - minAvg) * expensiveCount;
        }
      });

      return {
        therapeutic_class: tClass,
        totalClaims,
        totalSpend,
        potentialSavings: classSavings * 2, // Multiplied by 2 for Annual Projection
        drugCount: uniqueDrugs.length
      };
    }).sort((a, b) => b.potentialSavings - a.potentialSavings);
  }, [claims]);

  const totalSimulatedSavings = classStats.reduce((sum, cls) => sum + cls.potentialSavings, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-slate-400 text-sm flex items-center gap-2">
          <Activity className="w-4 h-4 animate-spin text-sky-600" />
          Running macro-arbitrage models...
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Layers className="w-6 h-6 text-sky-600" />
            Therapeutic Class Arbitrage
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            Model the financial impact of specialty carve-outs using live NDC orchestration data.
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">Total Simulated Savings (Annual)</div>
          <div className="text-3xl font-bold text-emerald-600">{formatCurrencyShort(totalSimulatedSavings)}</div>
        </div>
      </div>

      {/* Arbitrage Data Table */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-emerald-600" />
            Class-Level Carve-Out Opportunities
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table w-full text-left">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="p-4 text-xs font-medium text-slate-500">Therapeutic Class</th>
                <th className="p-4 text-xs font-medium text-slate-500 text-right">Unique Drugs</th>
                <th className="p-4 text-xs font-medium text-slate-500 text-right">Claims Vol.</th>
                <th className="p-4 text-xs font-medium text-slate-500 text-right">Total Spend (H1)</th>
                <th className="p-4 text-xs font-medium text-emerald-700 text-right bg-emerald-50/50">Carve-Out Savings</th>
                <th className="p-4 text-xs font-medium text-slate-500 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {classStats.map((cls, idx) => (
                <tr key={cls.therapeutic_class} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="p-4">
                    <div className="font-semibold text-slate-800 flex items-center gap-2">
                      <Stethoscope className="w-4 h-4 text-slate-400" />
                      {cls.therapeutic_class}
                    </div>
                  </td>
                  <td className="p-4 text-right text-slate-600">{cls.drugCount}</td>
                  <td className="p-4 text-right text-slate-600">{formatNumber(cls.totalClaims)}</td>
                  <td className="p-4 text-right font-medium text-slate-700">
                    {formatCurrencyShort(cls.totalSpend)}
                  </td>
                  <td className="p-4 text-right font-bold text-emerald-600 bg-emerald-50/30">
                    {cls.potentialSavings > 0 ? formatCurrency(cls.potentialSavings) : '—'}
                  </td>
                  <td className="p-4 text-center">
                    <button 
                      disabled={cls.potentialSavings === 0}
                      className="text-xs font-medium text-sky-600 hover:text-sky-800 disabled:text-slate-300 disabled:cursor-not-allowed flex items-center gap-1 justify-center w-full"
                    >
                      Simulate <ArrowRight className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))}
              {classStats.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    No enriched claims data available. Ingest files to generate arbitrage models.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

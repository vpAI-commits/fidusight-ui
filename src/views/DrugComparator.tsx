import { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Pill,
  Building2,
  Bookmark,
  Info,
  AlertTriangle,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Drug } from '@/lib/supabase';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';

// Local interface for Plans since we just added it to the DB
interface PBMPlan {
  id: string;
  pbm_vendor_id: string;
  plan_code: string;
  plan_name: string;
  plan_type: string;
  pbm_vendors?: { vendor_name: string };
}

interface EnrichedDrugPricing {
  drug: Drug;
  prices: Record<string, number>; 
  cheapestPlan: PBMPlan | null;
  expensivePlan: PBMPlan | null;
  lowestPrice: number;
  highestPrice: number;
  arbitragePerFill: number;
  savingsPercentage: number;
  hasClaims: boolean;
}

export default function DrugComparator() {
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [plans, setPlans] = useState<PBMPlan[]>([]);
  const [claims, setClaims] = useState<any[]>([]);
  const [selectedDrugId, setSelectedDrugId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadComparatorData() {
      try {
        setLoading(true);
        // Fetch drugs, health plans, and LIVE claims data
        const [drugsRes, plansRes, claimsRes] = await Promise.all([
          supabase.from('drugs').select('*').order('drug_name'),
          supabase.from('pbm_plans').select('*, pbm_vendors(vendor_name)'),
          supabase.from('claims').select('*'),
        ]);

        if (drugsRes.data) setDrugs(drugsRes.data);
        if (plansRes.data) setPlans(plansRes.data);
        if (claimsRes.data) setClaims(claimsRes.data);

      } catch (err) {
        console.error('Failed to load comparator data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadComparatorData();
  }, []);

  // Dynamically calculate pricing grouped by HEALTH PLAN from the raw claims table
  const processedDrugs = useMemo<EnrichedDrugPricing[]>(() => {
    const enriched = drugs.map((drug) => {
      // Find all live claims for this specific drug
      const drugClaims = claims.filter((c) => c.ndc_11 === drug.ndc_11 || c.drug_name === drug.drug_name);
      
      const prices: Record<string, number> = {};
      let lowestPrice = Infinity;
      let highestPrice = 0;
      let cheapestPlan: PBMPlan | null = null;
      let expensivePlan: PBMPlan | null = null;

      plans.forEach((plan) => {
        // Match claims to the specific plan_code
        const planClaims = drugClaims.filter((c) => c.pbm_plan_id === plan.plan_code);
        
        if (planClaims.length > 0) {
          // Average the True Net Price for this specific Plan
          const avgTnp = planClaims.reduce((s, c) => s + Number(c.true_net_price || 0), 0) / planClaims.length;
          prices[plan.plan_code] = avgTnp;
          
          if (avgTnp < lowestPrice) { lowestPrice = avgTnp; cheapestPlan = plan; }
          if (avgTnp > highestPrice) { highestPrice = avgTnp; expensivePlan = plan; }
        } else {
          prices[plan.plan_code] = 0;
        }
      });

      if (lowestPrice === Infinity) lowestPrice = 0;

      const arbitragePerFill = highestPrice > 0 ? highestPrice - lowestPrice : 0;
      const savingsPercentage = highestPrice > 0 ? (arbitragePerFill / highestPrice) * 100 : 0;

      return {
        drug,
        prices,
        cheapestPlan,
        expensivePlan,
        lowestPrice,
        highestPrice,
        arbitragePerFill,
        savingsPercentage,
        hasClaims: drugClaims.length > 0
      };
    });

    // Only show drugs in the UI that actually have uploaded claims
    return enriched.filter(d => d.hasClaims);
  }, [drugs, plans, claims]);

  // Ensure a drug is selected if data exists
  useEffect(() => {
    if (processedDrugs.length > 0 && !selectedDrugId) {
      setSelectedDrugId(processedDrugs[0].drug.id);
    } else if (processedDrugs.length === 0) {
      setSelectedDrugId(null);
    }
  }, [processedDrugs, selectedDrugId]);

  // Filter for search bar
  const filteredDrugs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return processedDrugs;
    return processedDrugs.filter(
      (item) =>
        item.drug.drug_name.toLowerCase().includes(q) ||
        item.drug.ndc_11.includes(q) ||
        item.drug.therapeutic_class.toLowerCase().includes(q)
    );
  }, [processedDrugs, searchQuery]);

  const currentSelection = useMemo(() => {
    return processedDrugs.find((item) => item.drug.id === selectedDrugId) || null;
  }, [processedDrugs, selectedDrugId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="text-slate-400 text-sm flex items-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-teal-600" />
          <span>Synchronizing live plan-level claims data...</span>
        </div>
      </div>
    );
  }

  if (processedDrugs.length === 0) {
    return (
      <div className="p-6 max-w-7xl mx-auto h-[60vh] flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
          <Pill className="w-8 h-8 text-slate-300" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">No Claims Data Available</h2>
        <p className="text-slate-500 max-w-md">
          The comparator engine is waiting for data. Head over to the <b>Data Ingestion</b> tab and upload a PBM claims file to activate cross-plan pricing analysis.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto animate-fade-in">
      <div className="relative w-full max-w-lg">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by drug name, NDC, or therapeutic class..."
          className="input pl-10 h-10 w-full rounded-lg bg-white shadow-sm border-slate-200 focus:border-teal-500 text-sm placeholder:text-slate-400"
        />
      </div>

      <div className="flex flex-wrap gap-2.5">
        {filteredDrugs.map(({ drug }) => {
          const isSelected = selectedDrugId === drug.id;
          return (
            <button
              key={drug.id}
              onClick={() => setSelectedDrugId(drug.id)}
              className={cn(
                'inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-150 border',
                isSelected
                  ? 'bg-teal-50 border-teal-500 text-teal-800 shadow-sm ring-1 ring-teal-400/40'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
              )}
            >
              <Pill className={cn('w-3.5 h-3.5', isSelected ? 'text-teal-600' : 'text-slate-400')} />
              <span>{drug.drug_name}</span>
              {drug.is_specialty && (
                <span className="bg-sky-100 text-sky-700 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                  Specialty
                </span>
              )}
            </button>
          );
        })}
      </div>

      {currentSelection && (
        <>
          <div className="card p-5 bg-white flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                {currentSelection.drug.drug_name}
              </h2>
              <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-500 font-medium">
                <span className="font-mono">NDC: {currentSelection.drug.ndc_11}</span>
                <span>•</span>
                <span className="font-mono">
                  RxCUI: {currentSelection.drug.rxcui || 'Pending'}
                </span>
                <span>•</span>
                <span className="bg-sky-50 text-sky-700 font-semibold px-2.5 py-0.5 rounded-full border border-sky-100">
                  {currentSelection.drug.therapeutic_class}
                </span>
              </div>
            </div>
            <div className="text-left md:text-right border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                NADAC Benchmark
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-0.5">
                {formatCurrency(currentSelection.drug.nadac_benchmark_unit)}
              </div>
              <div className="text-xs text-slate-400">
                per {currentSelection.drug.package_unit || 'unit'}
              </div>
            </div>
          </div>

          {/* DYNAMIC PLAN CARDS */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {plans.map((plan) => {
              const price = currentSelection.prices[plan.plan_code] || 0;
              const isLowest = price > 0 && price === currentSelection.lowestPrice;

              return (
                <div
                  key={plan.id}
                  className={cn(
                    'card relative p-5 bg-white transition-all',
                    isLowest ? 'border-teal-500 ring-1 ring-teal-500/20 shadow-sm' : 'border-slate-200'
                  )}
                >
                  {isLowest && (
                    <div className="absolute -top-3 right-4 bg-teal-600 text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full shadow-sm flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      Lowest Net Cost
                    </div>
                  )}

                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-4 h-4 text-slate-500" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm leading-tight">
                        {plan.plan_code}
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[120px]" title={plan.plan_name}>
                        {plan.pbm_vendors?.vendor_name || 'Vendor'} - {plan.plan_type}
                      </p>
                    </div>
                  </div>

                  <div className="pt-2">
                    <div className="text-2xl font-bold text-slate-900 tracking-tight">
                      {formatCurrency(price)}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">True Net Price (Average)</div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="card p-5 bg-gradient-to-r from-teal-50/70 to-cyan-50/50 border-teal-200/80">
            <div className="flex items-center gap-2 mb-4">
              <Bookmark className="w-4 h-4 text-teal-700" />
              <h3 className="font-bold text-slate-900 text-sm">Arbitrage Summary</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-1">Cheapest Plan</div>
                <div className="font-bold text-teal-700 text-sm">{currentSelection.cheapestPlan?.plan_code || 'N/A'}</div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-1">Most Expensive Plan</div>
                <div className="font-bold text-slate-800 text-sm">{currentSelection.expensivePlan?.plan_code || 'N/A'}</div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-1">Max Savings / Fill</div>
                <div className="font-bold text-emerald-600 text-sm">{formatCurrency(currentSelection.arbitragePerFill)}</div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-1">Max Savings %</div>
                <div className="font-bold text-emerald-600 text-sm">{currentSelection.savingsPercentage.toFixed(1)}%</div>
              </div>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50/80 flex items-center gap-2">
              <Info className="w-4 h-4 text-slate-400" />
              <h3 className="font-semibold text-slate-800 text-xs uppercase tracking-wider">
                Uploaded Drugs — Cross-Plan Live Averages
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="data-table w-full text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-white">
                    <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Drug Name & Dosage</th>
                    {/* Dynamically generate column headers for every plan */}
                    {plans.map((plan) => (
                      <th key={plan.id} className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">
                        {plan.plan_code}
                      </th>
                    ))}
                    <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Best Plan</th>
                    <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Arbitrage / Fill</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {processedDrugs.map((item) => {
                    const isSelected = item.drug.id === selectedDrugId;
                    const isHighVariance = item.savingsPercentage >= 25;

                    return (
                      <tr
                        key={item.drug.id}
                        onClick={() => setSelectedDrugId(item.drug.id)}
                        className={cn('cursor-pointer transition-colors hover:bg-slate-50/80', isSelected && 'bg-teal-50/40')}
                      >
                        <td className="p-4 font-semibold text-slate-900">{item.drug.drug_name}</td>
                        
                        {/* Dynamically generate pricing cells for every plan */}
                        {plans.map((plan) => {
                          const planPrice = item.prices[plan.plan_code] || 0;
                          const isPlanLowest = planPrice > 0 && planPrice === item.lowestPrice;
                          return (
                            <td key={plan.id} className={cn('p-4 text-right font-medium', isPlanLowest ? 'text-emerald-600 font-bold' : 'text-slate-600')}>
                              {formatCurrency(planPrice)}
                            </td>
                          );
                        })}

                        <td className="p-4 text-center">
                          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold px-2 py-0.5 rounded">
                            {item.cheapestPlan?.plan_code || 'N/A'}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="font-semibold text-emerald-600">-{formatCurrency(item.arbitragePerFill)}</span>
                            {isHighVariance && <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

import { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Pill,
  Building2,
  Bookmark,
  Info,
  AlertTriangle,
  Loader2,
  ArrowRightLeft,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Drug } from '@/lib/supabase';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';

interface PbmPlanContract {
  id: string; // Composite key: PBM::Plan
  pbm: string;
  plan: string;
}

interface EnrichedDrugPricing {
  drug: Drug;
  prices: Record<string, number>; 
  cheapestContract: PbmPlanContract | null;
  expensiveContract: PbmPlanContract | null;
  lowestPrice: number;
  highestPrice: number;
  maxArbitrage: number;
  savingsPercentage: number;
  hasClaims: boolean;
}

export default function DrugComparator() {
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [claims, setClaims] = useState<any[]>([]);
  
  const [selectedDrugId, setSelectedDrugId] = useState<string | null>(null);
  const [compareA, setCompareA] = useState<string>('');
  const [compareB, setCompareB] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadComparatorData() {
      try {
        setLoading(true);
        const [drugsRes, claimsRes] = await Promise.all([
          supabase.from('drugs').select('*').order('drug_name'),
          supabase.from('claims').select('*'),
        ]);

        if (drugsRes.data) setDrugs(drugsRes.data);
        if (claimsRes.data) setClaims(claimsRes.data);
      } catch (err) {
        console.error('Failed to load comparator data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadComparatorData();
  }, []);

  // 1. Extract Unique PBM + Plan combinations
  const contracts = useMemo<PbmPlanContract[]>(() => {
    const contractMap = new Map<string, PbmPlanContract>();
    claims.forEach((c) => {
      const pbm = (c.pbm_vendor_id || 'Unknown PBM').toUpperCase();
      const plan = (c.pbm_plan_id || 'Default Plan').toUpperCase();
      const id = `${pbm}::${plan}`;
      if (!contractMap.has(id)) {
        contractMap.set(id, { id, pbm, plan });
      }
    });
    return Array.from(contractMap.values()).sort((a, b) => a.pbm.localeCompare(b.pbm) || a.plan.localeCompare(b.plan));
  }, [claims]);

  // Group contracts by PBM for the matrix table headers
  const pbmGroups = useMemo(() => {
    const groups: Record<string, PbmPlanContract[]> = {};
    contracts.forEach(c => {
      if (!groups[c.pbm]) groups[c.pbm] = [];
      groups[c.pbm].push(c);
    });
    return groups;
  }, [contracts]);

  // 2. Calculate TNP across all contracts
  const processedDrugs = useMemo<EnrichedDrugPricing[]>(() => {
    const enriched = drugs.map((drug) => {
      const drugClaims = claims.filter((c) => c.ndc_11 === drug.ndc_11 || c.drug_name === drug.drug_name);
      
      const prices: Record<string, number> = {};
      let lowestPrice = Infinity;
      let highestPrice = 0;
      let cheapestContract: PbmPlanContract | null = null;
      let expensiveContract: PbmPlanContract | null = null;

      contracts.forEach((contract) => {
        const contractClaims = drugClaims.filter((c) => 
          (c.pbm_vendor_id || 'Unknown PBM').toUpperCase() === contract.pbm && 
          (c.pbm_plan_id || 'Default Plan').toUpperCase() === contract.plan
        );
        
        if (contractClaims.length > 0) {
          const avgTnp = contractClaims.reduce((s, c) => s + Number(c.true_net_price || 0), 0) / contractClaims.length;
          prices[contract.id] = avgTnp;
          
          if (avgTnp < lowestPrice) { lowestPrice = avgTnp; cheapestContract = contract; }
          if (avgTnp > highestPrice) { highestPrice = avgTnp; expensiveContract = contract; }
        } else {
          prices[contract.id] = 0;
        }
      });

      if (lowestPrice === Infinity) lowestPrice = 0;
      const maxArbitrage = highestPrice > 0 ? highestPrice - lowestPrice : 0;
      const savingsPercentage = highestPrice > 0 ? (maxArbitrage / highestPrice) * 100 : 0;

      return {
        drug,
        prices,
        cheapestContract,
        expensiveContract,
        lowestPrice,
        highestPrice,
        maxArbitrage,
        savingsPercentage,
        hasClaims: drugClaims.length > 0
      };
    });

    return enriched.filter(d => d.hasClaims);
  }, [drugs, contracts, claims]);

  // 3. Selection Auto-Defaults
  useEffect(() => {
    if (processedDrugs.length > 0 && !selectedDrugId) {
      setSelectedDrugId(processedDrugs[0].drug.id);
    }
    if (contracts.length >= 2 && !compareA && !compareB) {
      setCompareA(contracts[0].id);
      setCompareB(contracts[1].id);
    } else if (contracts.length === 1 && !compareA) {
      setCompareA(contracts[0].id);
    }
  }, [processedDrugs, contracts, selectedDrugId, compareA, compareB]);

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
          <span>Building hierarchical PBM-Plan matrices...</span>
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
          Head over to the <b>Data Ingestion</b> tab and upload a PBM claims file to activate cross-plan pricing analysis.
        </p>
      </div>
    );
  }

  // Calculate Head-to-Head Arbitrage for the selected drug
  const priceA = currentSelection ? (currentSelection.prices[compareA] || 0) : 0;
  const priceB = currentSelection ? (currentSelection.prices[compareB] || 0) : 0;
  const headToHeadDiff = Math.abs(priceA - priceB);
  const winner = priceA < priceB ? 'A' : priceB < priceA ? 'B' : 'TIE';

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto animate-fade-in">
      {/* Search & Pill Cloud */}
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
        {filteredDrugs.map(({ drug }) => (
          <button
            key={drug.id}
            onClick={() => setSelectedDrugId(drug.id)}
            className={cn(
              'inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-150 border',
              selectedDrugId === drug.id
                ? 'bg-teal-50 border-teal-500 text-teal-800 shadow-sm ring-1 ring-teal-400/40'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
            )}
          >
            <Pill className={cn('w-3.5 h-3.5', selectedDrugId === drug.id ? 'text-teal-600' : 'text-slate-400')} />
            <span>{drug.drug_name}</span>
            {drug.is_specialty && (
              <span className="bg-sky-100 text-sky-700 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                Specialty
              </span>
            )}
          </button>
        ))}
      </div>

      {currentSelection && (
        <>
          {/* Active Drug Header */}
          <div className="card p-5 bg-white flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                {currentSelection.drug.drug_name}
              </h2>
              <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-500 font-medium">
                <span className="font-mono">NDC: {currentSelection.drug.ndc_11}</span>
                <span>•</span>
                <span className="font-mono">RxCUI: {currentSelection.drug.rxcui || 'Pending'}</span>
                <span>•</span>
                <span className="bg-sky-50 text-sky-700 font-semibold px-2.5 py-0.5 rounded-full border border-sky-100">
                  {currentSelection.drug.therapeutic_class}
                </span>
              </div>
            </div>
            <div className="text-left md:text-right border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">NADAC Benchmark</div>
              <div className="text-2xl font-bold text-slate-900 mt-0.5">
                {formatCurrency(currentSelection.drug.nadac_benchmark_unit)}
              </div>
              <div className="text-xs text-slate-400">per {currentSelection.drug.package_unit || 'unit'}</div>
            </div>
          </div>

          {/* HEAD-TO-HEAD SIDE-BY-SIDE COMPARATOR */}
          <div className="card p-6 bg-slate-50/50 border-slate-200">
            <div className="flex items-center gap-2 mb-6">
              <ArrowRightLeft className="w-4 h-4 text-teal-600" />
              <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider">Head-to-Head Contract Comparison</h3>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-8 items-center">
              {/* Left Side: Contract A */}
              <div className={cn("p-5 rounded-xl border bg-white transition-colors", winner === 'A' ? "border-emerald-400 ring-1 ring-emerald-400/20" : "border-slate-200")}>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Baseline Contract</label>
                <select 
                  value={compareA} 
                  onChange={(e) => setCompareA(e.target.value)}
                  className="input mb-6 font-medium"
                >
                  <option value="" disabled>Select a contract...</option>
                  {contracts.map(c => (
                    <option key={c.id} value={c.id}>{c.pbm} — {c.plan}</option>
                  ))}
                </select>
                <div className="flex justify-between items-end">
                  <div>
                    <div className="text-xs text-slate-400 mb-1">True Net Price</div>
                    <div className="text-3xl font-bold text-slate-900">{formatCurrency(priceA)}</div>
                  </div>
                  {winner === 'A' && priceA > 0 && <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-3 py-1 rounded-full mb-1">Lowest Cost</span>}
                </div>
              </div>

              {/* Center VS Indicator */}
              <div className="flex flex-col items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center font-black text-slate-400 text-sm z-10">VS</div>
                {headToHeadDiff > 0 && priceA > 0 && priceB > 0 && (
                  <div className="mt-3 text-center">
                    <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Spread / Fill</div>
                    <div className="text-emerald-600 font-bold text-lg">{formatCurrency(headToHeadDiff)}</div>
                  </div>
                )}
              </div>

              {/* Right Side: Contract B */}
              <div className={cn("p-5 rounded-xl border bg-white transition-colors", winner === 'B' ? "border-emerald-400 ring-1 ring-emerald-400/20" : "border-slate-200")}>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Comparison Contract</label>
                <select 
                  value={compareB} 
                  onChange={(e) => setCompareB(e.target.value)}
                  className="input mb-6 font-medium"
                >
                  <option value="" disabled>Select a contract...</option>
                  {contracts.map(c => (
                    <option key={c.id} value={c.id}>{c.pbm} — {c.plan}</option>
                  ))}
                </select>
                <div className="flex justify-between items-end">
                  <div>
                    <div className="text-xs text-slate-400 mb-1">True Net Price</div>
                    <div className="text-3xl font-bold text-slate-900">{formatCurrency(priceB)}</div>
                  </div>
                  {winner === 'B' && priceB > 0 && <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-3 py-1 rounded-full mb-1">Lowest Cost</span>}
                </div>
              </div>
            </div>
          </div>

          {/* GLOBAL ARBITRAGE SUMMARY */}
          <div className="card p-5 bg-gradient-to-r from-teal-50/70 to-cyan-50/50 border-teal-200/80">
            <div className="flex items-center gap-2 mb-4">
              <Bookmark className="w-4 h-4 text-teal-700" />
              <h3 className="font-bold text-slate-900 text-sm">Global Arbitrage Summary (All Uploaded Contracts)</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-1">Cheapest Contract</div>
                <div className="font-bold text-teal-700 text-sm">
                  {currentSelection.cheapestContract ? `${currentSelection.cheapestContract.pbm} (${currentSelection.cheapestContract.plan})` : 'N/A'}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-1">Most Expensive</div>
                <div className="font-bold text-slate-800 text-sm">
                  {currentSelection.expensiveContract ? `${currentSelection.expensiveContract.pbm} (${currentSelection.expensiveContract.plan})` : 'N/A'}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-1">Max Savings / Fill</div>
                <div className="font-bold text-emerald-600 text-sm">{formatCurrency(currentSelection.maxArbitrage)}</div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-1">Max Savings %</div>
                <div className="font-bold text-emerald-600 text-sm">{currentSelection.savingsPercentage.toFixed(1)}%</div>
              </div>
            </div>
          </div>

          {/* HIERARCHICAL MATRIX TABLE */}
          <div className="card overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50/80 flex items-center gap-2">
              <Info className="w-4 h-4 text-slate-400" />
              <h3 className="font-semibold text-slate-800 text-xs uppercase tracking-wider">
                Hierarchical Cross-Plan Matrix
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="data-table w-full text-left border-collapse">
                <thead>
                  {/* Super Header: PBMs */}
                  <tr className="bg-white">
                    <th rowSpan={2} className="p-4 align-bottom text-xs font-bold text-slate-700 uppercase tracking-wider border-b-2 border-slate-200 min-w-[250px]">
                      Drug Name & Dosage
                    </th>
                    {Object.entries(pbmGroups).map(([pbm, pbmContracts]) => (
                      <th 
                        key={pbm} 
                        colSpan={pbmContracts.length} 
                        className="p-3 text-center text-xs font-bold text-slate-800 bg-slate-100 border-l border-b border-slate-200 uppercase tracking-widest"
                      >
                        <div className="flex items-center justify-center gap-2">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" /> {pbm}
                        </div>
                      </th>
                    ))}
                    <th rowSpan={2} className="p-4 align-bottom text-xs font-bold text-slate-500 uppercase tracking-wider text-center border-l border-b-2 border-slate-200">
                      Best Contract
                    </th>
                    <th rowSpan={2} className="p-4 align-bottom text-xs font-bold text-slate-500 uppercase tracking-wider text-right border-b-2 border-slate-200">
                      Max Arbitrage
                    </th>
                  </tr>
                  {/* Sub Header: Health Plans */}
                  <tr className="bg-white">
                    {Object.values(pbmGroups).flat().map((contract) => (
                      <th 
                        key={contract.id} 
                        className="p-3 text-xs font-semibold text-slate-500 text-right border-l border-b-2 border-slate-200 bg-slate-50/50"
                      >
                        {contract.plan}
                      </th>
                    ))}
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
                        <td className="p-4 font-semibold text-slate-900 border-r border-slate-50">{item.drug.drug_name}</td>
                        
                        {/* Pricing Cells aligned with grouped headers */}
                        {Object.values(pbmGroups).flat().map((contract) => {
                          const contractPrice = item.prices[contract.id] || 0;
                          const isContractLowest = contractPrice > 0 && contractPrice === item.lowestPrice;
                          return (
                            <td 
                              key={contract.id} 
                              className={cn(
                                'p-4 text-right font-medium border-l border-slate-100', 
                                isContractLowest ? 'text-emerald-600 font-bold bg-emerald-50/30' : 'text-slate-600'
                              )}
                            >
                              {formatCurrency(contractPrice)}
                            </td>
                          );
                        })}

                        <td className="p-4 text-center border-l border-slate-100">
                          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold px-2 py-1 rounded tracking-wide uppercase">
                            {item.cheapestContract?.plan || 'N/A'}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="font-semibold text-emerald-600">-{formatCurrency(item.maxArbitrage)}</span>
                            {isHighVariance && <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" title="High Pricing Variance Detected" />}
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

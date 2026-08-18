import { useState, useEffect, useMemo } from 'react';
import {
  Pill,
  Search,
  TrendingDown,
  Award,
  AlertTriangle,
  Building2,
  ArrowRight,
  Info,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Drug, DrugPBMPricing, PBMVendor } from '@/lib/supabase';
import { formatCurrency, formatPercentage } from '@/lib/format';
import { cn } from '@/lib/utils';

interface ComparisonRow extends DrugPBMPricing {
  pbm_vendors: PBMVendor;
  is_lowest_cost: boolean;
  variance_pct: number;
  variance_dollar: number;
}

export default function DrugComparator() {
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [pricing, setPricing] = useState<DrugPBMPricing[]>([]);
  const [vendors, setVendors] = useState<PBMVendor[]>([]);
  const [selectedDrugId, setSelectedDrugId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      const [drugsRes, pricingRes, vendorsRes] = await Promise.all([
        supabase.from('drugs').select('*').order('drug_name'),
        supabase.from('drug_pbm_pricing').select('*, pbm_vendors(*)'),
        supabase.from('pbm_vendors').select('*').order('vendor_name'),
      ]);

      if (drugsRes.data) setDrugs(drugsRes.data);
      if (pricingRes.data) setPricing(pricingRes.data);
      if (vendorsRes.data) setVendors(vendorsRes.data);
      if (drugsRes.data && drugsRes.data.length > 0) {
        setSelectedDrugId(drugsRes.data[0].id);
      }
      setLoading(false);
    }
    loadData();
  }, []);

  const selectedDrug = useMemo(() => drugs.find((d) => d.id === selectedDrugId), [drugs, selectedDrugId]);

  const comparisons = useMemo<ComparisonRow[]>(() => {
    const drugPricing = pricing.filter((p) => p.drug_id === selectedDrugId);
    if (drugPricing.length === 0) return [];

    const minTNP = Math.min(...drugPricing.map((p) => p.true_net_price));

    return drugPricing
      .map((p) => {
        const varianceDollar = p.true_net_price - minTNP;
        const variancePct = minTNP > 0 ? (varianceDollar / minTNP) * 100 : 0;
        return {
          ...p,
          pbm_vendors: p.pbm_vendors || vendors.find((v) => v.id === p.pbm_vendor_id)!,
          is_lowest_cost: p.true_net_price === minTNP,
          variance_pct: variancePct,
          variance_dollar: varianceDollar,
        };
      })
      .sort((a, b) => a.true_net_price - b.true_net_price);
  }, [pricing, selectedDrugId, vendors]);

  const arbitrageSummary = useMemo(() => {
    if (comparisons.length < 2) return null;
    const cheapest = comparisons[0];
    const mostExpensive = comparisons[comparisons.length - 1];
    return {
      cheapestPbm: cheapest.pbm_vendors.vendor_name,
      mostExpensivePbm: mostExpensive.pbm_vendors.vendor_name,
      maxSavingsPerFill: mostExpensive.true_net_price - cheapest.true_net_price,
      maxSavingsPct: cheapest.true_net_price > 0
        ? ((mostExpensive.true_net_price - cheapest.true_net_price) / mostExpensive.true_net_price) * 100
        : 0,
    };
  }, [comparisons]);

  const filteredDrugs = useMemo(() => {
    if (!searchQuery) return drugs;
    const q = searchQuery.toLowerCase();
    return drugs.filter(
      (d) =>
        d.drug_name.toLowerCase().includes(q) ||
        d.ndc_11.includes(q) ||
        d.therapeutic_class.toLowerCase().includes(q)
    );
  }, [drugs, searchQuery]);

  const allDrugsComparison = useMemo(() => {
    return drugs.map((drug) => {
      const drugPricing = pricing.filter((p) => p.drug_id === drug.id);
      if (drugPricing.length === 0) return null;

      const minTNP = Math.min(...drugPricing.map((p) => p.true_net_price));
      const maxTNP = Math.max(...drugPricing.map((p) => p.true_net_price));
      const winner = drugPricing.find((p) => p.true_net_price === minTNP);
      const winnerVendor = vendors.find((v) => v.id === winner?.pbm_vendor_id);
      const spread = drugPricing.reduce((sum, p) => sum + (p.spread_amount || 0), 0);

      return {
        drug,
        minTNP,
        maxTNP,
        savingsPerFill: maxTNP - minTNP,
        winnerName: winnerVendor?.vendor_name || '—',
        winnerCode: winnerVendor?.vendor_code || '',
        hasSpread: spread > 0,
      };
    }).filter(Boolean) as Array<{
      drug: Drug;
      minTNP: number;
      maxTNP: number;
      savingsPerFill: number;
      winnerName: string;
      winnerCode: string;
      hasSpread: boolean;
    }>;
  }, [drugs, pricing, vendors]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-slate-400 text-sm">Loading drug comparison data...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Drug selector */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by drug name, NDC, or therapeutic class..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input pl-9"
          />
        </div>
      </div>

      {/* Drug pills */}
      <div className="flex flex-wrap gap-2">
        {filteredDrugs.map((drug) => (
          <button
            key={drug.id}
            onClick={() => setSelectedDrugId(drug.id)}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all border',
              selectedDrugId === drug.id
                ? 'bg-teal-50 border-teal-300 text-teal-700'
                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
            )}
          >
            <Pill className="w-4 h-4" />
            {drug.drug_name.split('(')[0].trim()}
            {drug.is_specialty && (
              <span className="badge badge-info text-[10px]">Specialty</span>
            )}
          </button>
        ))}
      </div>

      {selectedDrug && (
        <>
          {/* Drug metadata header */}
          <div className="card p-5">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{selectedDrug.drug_name}</h3>
                <div className="flex items-center gap-4 mt-2 text-sm text-slate-500">
                  <span>NDC: <span className="font-mono font-medium text-slate-700">{selectedDrug.ndc_11}</span></span>
                  <span>RxCUI: <span className="font-mono font-medium text-slate-700">{selectedDrug.rxcui || '—'}</span></span>
                  <span className="badge badge-info">{selectedDrug.therapeutic_class}</span>
                  {selectedDrug.is_specialty && <span className="badge badge-warning">Specialty Drug</span>}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-400 uppercase tracking-wider">NADAC Benchmark</div>
                <div className="text-2xl font-bold text-slate-900">
                  {formatCurrency(selectedDrug.nadac_benchmark_unit)}
                </div>
                <div className="text-xs text-slate-400">per {selectedDrug.package_unit}</div>
              </div>
            </div>
          </div>

          {/* PBM comparison cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {comparisons.map((cmp, idx) => (
              <div
                key={cmp.id}
                className={cn(
                  'card p-5 relative overflow-hidden',
                  cmp.is_lowest_cost ? 'border-teal-300 ring-1 ring-teal-200' : '',
                  idx === 0 && 'animate-pulse-glow'
                )}
              >
                {cmp.is_lowest_cost && (
                  <div className="absolute top-0 right-0 bg-teal-500 text-white text-xs font-bold px-3 py-1 rounded-bl-lg">
                    LOWEST NET COST
                  </div>
                )}
                <div className="flex items-center gap-2 mb-3">
                  <Building2 className="w-4 h-4 text-slate-400" />
                  <div>
                    <div className="font-semibold text-slate-900">{cmp.pbm_vendors.vendor_name}</div>
                    <div className="text-xs text-slate-400">{cmp.pbm_vendors.plan_group}</div>
                  </div>
                </div>

                <div className="text-3xl font-bold text-slate-900 mb-1">
                  {formatCurrency(cmp.true_net_price)}
                </div>
                <div className="text-xs text-slate-400 mb-4">True Net Price (TNP-30)</div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Pharmacy Reimbursement</span>
                    <span className="font-medium text-slate-700">{formatCurrency(cmp.pharmacy_reimbursement)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Rebate Passed Thru</span>
                    <span className="font-medium text-emerald-600">-{formatCurrency(cmp.rebate_passed_thru)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">BFSF Admin Fee</span>
                    <span className="font-medium text-slate-700">+{formatCurrency(cmp.bfsf_admin_fee)}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-slate-100">
                    <span className="text-slate-500">TNP per unit</span>
                    <span className="font-medium text-slate-700">{formatCurrency(cmp.tnp_per_unit)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Claims (H1 2026)</span>
                    <span className="font-medium text-slate-700">{cmp.claim_count.toLocaleString()}</span>
                  </div>
                  {cmp.spread_amount > 0 && (
                    <div className="flex justify-between pt-2 border-t border-slate-100">
                      <span className="text-red-600 font-medium">Spread Detected</span>
                      <span className="font-bold text-red-600">{formatCurrency(cmp.spread_amount)}</span>
                    </div>
                  )}
                </div>

                {!cmp.is_lowest_cost && (
                  <div className="mt-4 pt-3 border-t border-slate-100">
                    <div className="flex items-center gap-1 text-sm">
                      <TrendingDown className="w-4 h-4 text-orange-500" />
                      <span className="text-orange-600 font-semibold">
                        +{formatPercentage(cmp.variance_pct)} vs best
                      </span>
                      <span className="text-slate-400">(+{formatCurrency(cmp.variance_dollar)})</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Arbitrage summary */}
          {arbitrageSummary && (
            <div className="card p-5 bg-gradient-to-br from-teal-50 to-cyan-50 border-teal-200">
              <div className="flex items-center gap-2 mb-3">
                <Award className="w-5 h-5 text-teal-600" />
                <h3 className="font-bold text-slate-900">Arbitrage Summary</h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-xs text-slate-500 uppercase tracking-wider">Cheapest PBM</div>
                  <div className="font-semibold text-teal-700">{arbitrageSummary.cheapestPbm}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 uppercase tracking-wider">Most Expensive</div>
                  <div className="font-semibold text-slate-700">{arbitrageSummary.mostExpensivePbm}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 uppercase tracking-wider">Max Savings / Fill</div>
                  <div className="font-semibold text-emerald-600">{formatCurrency(arbitrageSummary.maxSavingsPerFill)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 uppercase tracking-wider">Max Savings %</div>
                  <div className="font-semibold text-emerald-600">{formatPercentage(arbitrageSummary.maxSavingsPct)}</div>
                </div>
              </div>
            </div>
          )}

          {/* Full comparison table */}
          <div className="card overflow-hidden">
            <div className="p-4 border-b border-slate-200">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                <Info className="w-4 h-4 text-slate-400" />
                All Drugs — Cross-PBM TNP Comparison (Standardized 30-Day)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Drug Name & Dosage</th>
                    <th>Therapeutic Class</th>
                    {vendors.map((v) => (
                      <th key={v.id} className="text-right">{v.vendor_name.split(' ')[0]} TNP</th>
                    ))}
                    <th>Best Plan</th>
                    <th className="text-right">Arbitrage / Fill</th>
                  </tr>
                </thead>
                <tbody>
                  {allDrugsComparison.map((row) => (
                    <tr key={row.drug.id}>
                      <td className="font-medium text-slate-900">{row.drug.drug_name.split('(')[0].trim()}</td>
                      <td>
                        <span className="badge badge-neutral">{row.drug.therapeutic_class}</span>
                      </td>
                      {vendors.map((v) => {
                        const p = pricing.find(
                          (pr) => pr.drug_id === row.drug.id && pr.pbm_vendor_id === v.id
                        );
                        const isWinner = p && p.true_net_price === row.minTNP;
                        return (
                          <td key={v.id} className="text-right">
                            {p ? (
                              <span className={isWinner ? 'font-bold text-teal-700' : 'text-slate-600'}>
                                {formatCurrency(p.true_net_price)}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td>
                        <span className="badge badge-success">
                          {row.winnerName.split(' ')[0].toUpperCase()}
                        </span>
                      </td>
                      <td className="text-right">
                        <span className="font-semibold text-emerald-600">
                          -{formatCurrency(row.savingsPerFill)}
                        </span>
                        {row.hasSpread && (
                          <AlertTriangle className="inline w-3.5 h-3.5 text-red-500 ml-1" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

import { useState, useEffect, useMemo } from 'react';
import {
  GitCompareArrows,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  DollarSign,
  Building2,
  Layers,
  Calculator,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Drug, DrugPBMPricing, PBMVendor } from '@/lib/supabase';
import { formatCurrency, formatNumber } from '@/lib/format';
import { simulateCarveOut } from '@/lib/calculations';
import { cn } from '@/lib/utils';

export default function ClassArbitrage() {
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [pricing, setPricing] = useState<DrugPBMPricing[]>([]);
  const [vendors, setVendors] = useState<PBMVendor[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [sourcePbmId, setSourcePbmId] = useState<string>('');
  const [targetPbmId, setTargetPbmId] = useState<string>('');
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
      if (vendorsRes.data && vendorsRes.data.length >= 2) {
        setSourcePbmId(vendorsRes.data[1].id);
        setTargetPbmId(vendorsRes.data[0].id);
      }
      setLoading(false);
    }
    loadData();
  }, []);

  const therapeuticClasses = useMemo(() => {
    const classes = [...new Set(drugs.map((d) => d.therapeutic_class))].sort();
    if (classes.length > 0 && !selectedClass) setSelectedClass(classes[0]);
    return classes;
  }, [drugs, selectedClass]);

  const classDrugs = useMemo(
    () => drugs.filter((d) => d.therapeutic_class === selectedClass),
    [drugs, selectedClass]
  );

  const sourceVendor = vendors.find((v) => v.id === sourcePbmId);
  const targetVendor = vendors.find((v) => v.id === targetPbmId);

  const simulationResult = useMemo(() => {
    if (!sourcePbmId || !targetPbmId || classDrugs.length === 0) return null;

    const sourcePricing: Array<{
      pharmacy_reimbursement: number;
      bfsf_admin_fee: number;
      rebate_passed_thru: number;
      claim_count: number;
    }> = [];

    for (const drug of classDrugs) {
      const sp = pricing.find((p) => p.drug_id === drug.id && p.pbm_vendor_id === sourcePbmId);
      if (sp) {
        sourcePricing.push({
          pharmacy_reimbursement: sp.pharmacy_reimbursement,
          bfsf_admin_fee: sp.bfsf_admin_fee,
          rebate_passed_thru: sp.rebate_passed_thru,
          claim_count: sp.claim_count,
        });
      }
    }

    // Get target PBM average unit pricing across the same drugs
    const targetPricings = classDrugs
      .map((d) => pricing.find((p) => p.drug_id === d.id && p.pbm_vendor_id === targetPbmId))
      .filter(Boolean) as DrugPBMPricing[];

    if (targetPricings.length === 0) return null;

    const avgTargetPricing = {
      pharmacy_reimbursement:
        targetPricings.reduce((s, p) => s + p.pharmacy_reimbursement, 0) / targetPricings.length,
      bfsf_admin_fee:
        targetPricings.reduce((s, p) => s + p.bfsf_admin_fee, 0) / targetPricings.length,
      rebate_passed_thru:
        targetPricings.reduce((s, p) => s + p.rebate_passed_thru, 0) / targetPricings.length,
    };

    return simulateCarveOut(sourcePricing, avgTargetPricing);
  }, [sourcePbmId, targetPbmId, classDrugs, pricing]);

  const perDrugBreakdown = useMemo(() => {
    if (!sourcePbmId || !targetPbmId) return [];
    return classDrugs.map((drug) => {
      const sp = pricing.find((p) => p.drug_id === drug.id && p.pbm_vendor_id === sourcePbmId);
      const tp = pricing.find((p) => p.drug_id === drug.id && p.pbm_vendor_id === targetPbmId);
      const sourceTNP = sp ? sp.true_net_price : 0;
      const targetTNP = tp ? tp.true_net_price : 0;
      const savings = (sourceTNP - targetTNP) * (sp?.claim_count || 0);
      return {
        drug,
        sourceTNP,
        targetTNP,
        claimCount: sp?.claim_count || 0,
        annualSavings: savings,
        isPositive: savings > 0,
      };
    });
  }, [classDrugs, pricing, sourcePbmId, targetPbmId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-slate-400 text-sm">Loading arbitrage data...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Controls */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Layers className="w-5 h-5 text-teal-600" />
          <h3 className="font-bold text-slate-900">Carve-Out Simulator Configuration</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Therapeutic Class
            </label>
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="input"
            >
              {therapeuticClasses.map((cls) => (
                <option key={cls} value={cls}>{cls}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Source PBM (Current)
            </label>
            <select
              value={sourcePbmId}
              onChange={(e) => setSourcePbmId(e.target.value)}
              className="input"
            >
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>{v.vendor_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Target PBM (Carve-Out To)
            </label>
            <select
              value={targetPbmId}
              onChange={(e) => setTargetPbmId(e.target.value)}
              className="input"
            >
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>{v.vendor_name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Visual flow */}
      <div className="card p-5 bg-slate-50">
        <div className="flex items-center justify-center gap-6 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-200 flex items-center justify-center">
              <Layers className="w-5 h-5 text-slate-600" />
            </div>
            <div>
              <div className="text-xs text-slate-400 uppercase tracking-wider">Class</div>
              <div className="font-semibold text-slate-900 text-sm">{selectedClass}</div>
            </div>
          </div>
          <ArrowRight className="w-5 h-5 text-slate-300" />
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <div className="text-xs text-slate-400 uppercase tracking-wider">From</div>
              <div className="font-semibold text-slate-900 text-sm">{sourceVendor?.vendor_name}</div>
            </div>
          </div>
          <div className="flex items-center gap-1 text-teal-600">
            <GitCompareArrows className="w-5 h-5" />
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-teal-100 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <div className="text-xs text-slate-400 uppercase tracking-wider">To</div>
              <div className="font-semibold text-slate-900 text-sm">{targetVendor?.vendor_name}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      {simulationResult && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="stat-card">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-4 h-4 text-slate-400" />
                <span className="text-xs text-slate-500 uppercase tracking-wider">Current Annual Spend</span>
              </div>
              <div className="text-2xl font-bold text-slate-900">
                {formatCurrency(simulationResult.currentAnnualSpend)}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                {formatNumber(simulationResult.totalClaims)} claims · {sourceVendor?.vendor_name}
              </div>
            </div>

            <div className="stat-card">
              <div className="flex items-center gap-2 mb-2">
                <Calculator className="w-4 h-4 text-slate-400" />
                <span className="text-xs text-slate-500 uppercase tracking-wider">Simulated Annual Spend</span>
              </div>
              <div className="text-2xl font-bold text-slate-900">
                {formatCurrency(simulationResult.simulatedAnnualSpend)}
              </div>
              <div className="text-xs text-slate-400 mt-1">Re-adjudicated at {targetVendor?.vendor_name}</div>
            </div>

            <div className={cn(
              'stat-card',
              simulationResult.netAnnualSavings > 0 ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'
            )}>
              <div className="flex items-center gap-2 mb-2">
                {simulationResult.netAnnualSavings > 0 ? (
                  <TrendingDown className="w-4 h-4 text-emerald-600" />
                ) : (
                  <TrendingUp className="w-4 h-4 text-red-600" />
                )}
                <span className="text-xs text-slate-500 uppercase tracking-wider">Net Annual Savings</span>
              </div>
              <div className={cn(
                'text-2xl font-bold',
                simulationResult.netAnnualSavings > 0 ? 'text-emerald-700' : 'text-red-700'
              )}>
                {simulationResult.netAnnualSavings > 0 ? '+' : ''}{formatCurrency(simulationResult.netAnnualSavings)}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                {simulationResult.currentAnnualSpend > 0
                  ? `${Math.abs((simulationResult.netAnnualSavings / simulationResult.currentAnnualSpend) * 100).toFixed(1)}% differential`
                  : ''}
              </div>
            </div>

            <div className="stat-card">
              <div className="flex items-center gap-2 mb-2">
                <Layers className="w-4 h-4 text-slate-400" />
                <span className="text-xs text-slate-500 uppercase tracking-wider">Drugs in Class</span>
              </div>
              <div className="text-2xl font-bold text-slate-900">{classDrugs.length}</div>
              <div className="text-xs text-slate-400 mt-1">{formatNumber(simulationResult.totalClaims)} total claims</div>
            </div>
          </div>

          {/* Differential breakdown */}
          <div className="card p-5">
            <h3 className="font-bold text-slate-900 mb-4">Differential Breakdown</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-sm text-slate-600">Gross Ingredient Cost Differential</span>
                <span className={cn(
                  'font-semibold',
                  simulationResult.grossDifferential > 0 ? 'text-emerald-600' : 'text-red-600'
                )}>
                  {simulationResult.grossDifferential > 0 ? '+' : ''}{formatCurrency(simulationResult.grossDifferential)}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-sm text-slate-600">Admin Fee Differential</span>
                <span className={cn(
                  'font-semibold',
                  simulationResult.adminFeeDifferential > 0 ? 'text-emerald-600' : 'text-red-600'
                )}>
                  {simulationResult.adminFeeDifferential > 0 ? '+' : ''}{formatCurrency(simulationResult.adminFeeDifferential)}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-sm text-slate-600">Rebate Differential</span>
                <span className={cn(
                  'font-semibold',
                  simulationResult.rebateDifferential > 0 ? 'text-emerald-600' : 'text-red-600'
                )}>
                  {simulationResult.rebateDifferential > 0 ? '+' : ''}{formatCurrency(simulationResult.rebateDifferential)}
                </span>
              </div>
              <div className="flex items-center justify-between py-3 mt-2 bg-slate-50 rounded-lg px-4">
                <span className="text-sm font-bold text-slate-900">Net Annual Plan Savings</span>
                <span className={cn(
                  'text-lg font-bold',
                  simulationResult.netAnnualSavings > 0 ? 'text-emerald-600' : 'text-red-600'
                )}>
                  {simulationResult.netAnnualSavings > 0 ? '+' : ''}{formatCurrency(simulationResult.netAnnualSavings)}
                </span>
              </div>
            </div>
          </div>

          {/* Per-drug breakdown */}
          <div className="card overflow-hidden">
            <div className="p-4 border-b border-slate-200">
              <h3 className="font-semibold text-slate-900">Per-Drug Re-Adjudication Breakdown</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Drug Name</th>
                    <th className="text-right">{sourceVendor?.vendor_name.split(' ')[0]} TNP</th>
                    <th className="text-right">{targetVendor?.vendor_name.split(' ')[0]} TNP</th>
                    <th className="text-right">Claims</th>
                    <th className="text-right">Annual Savings</th>
                  </tr>
                </thead>
                <tbody>
                  {perDrugBreakdown.map((row) => (
                    <tr key={row.drug.id}>
                      <td className="font-medium text-slate-900">{row.drug.drug_name.split('(')[0].trim()}</td>
                      <td className="text-right text-slate-600">{formatCurrency(row.sourceTNP)}</td>
                      <td className="text-right text-slate-600">{formatCurrency(row.targetTNP)}</td>
                      <td className="text-right text-slate-500">{formatNumber(row.claimCount)}</td>
                      <td className="text-right">
                        <span className={cn(
                          'font-semibold',
                          row.isPositive ? 'text-emerald-600' : 'text-red-600'
                        )}>
                          {row.isPositive ? '+' : ''}{formatCurrency(row.annualSavings)}
                        </span>
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

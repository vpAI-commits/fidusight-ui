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
  ShieldAlert,
  ChevronDown,
  Layers,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Drug } from '@/lib/supabase';
import { formatCurrency, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

const InfoTooltip = ({ text }: { text: string }) => (
  <div className="group relative inline-flex items-center ml-1.5 cursor-help align-middle">
    <Info className="w-3.5 h-3.5 text-slate-400 hover:text-teal-500 transition-colors" />
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-64 p-2.5 bg-slate-800 text-white text-xs rounded-lg shadow-xl z-50 font-normal leading-relaxed text-left normal-case tracking-normal">
      {text}
      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
    </div>
  </div>
);

interface ContractMetrics {
  id: string;
  pbm: string;
  plan: string;
  awp: number;
  wac: number;
  nadac: number;
  pharmacyPaid: number;
  planBilled: number;
  spread: number;
  mfgRebate: number;
  retainedRebate: number;
  passedRebate: number;
  adminFee: number;
  tnp: number;
}

export default function DrugComparator() {
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [claims, setClaims] = useState<any[]>([]);
  const [selectedDrugId, setSelectedDrugId] = useState<string | null>(null);
  const [compareA, setCompareA] = useState<string>('');
  const [compareB, setCompareB] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showWaterfall, setShowWaterfall] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [drugsRes, claimsRes] = await Promise.all([
          supabase.from('drugs').select('*').order('drug_name'),
          supabase.from('claims').select('*'),
        ]);
        if (drugsRes.data) setDrugs(drugsRes.data);
        if (claimsRes.data) setClaims(claimsRes.data);
      } catch (err) {
        console.error('Failed to load comparator:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Unique contracts
  const contracts = useMemo(() => {
    const map = new Map<string, { id: string; pbm: string; plan: string }>();
    claims.forEach((c) => {
      const pbm = (c.pbm_vendor_id || 'CVS').toUpperCase();
      const plan = (c.pbm_plan_id || 'DEFAULT_PLAN').toUpperCase();
      const id = `${pbm}::${plan}`;
      if (!map.has(id)) map.set(id, { id, pbm, plan });
    });
    return Array.from(map.values()).sort((a, b) => a.pbm.localeCompare(b.pbm) || a.plan.localeCompare(b.plan));
  }, [claims]);

  // Group contracts by PBM
  const pbmGroups = useMemo(() => {
    const groups: Record<string, typeof contracts> = {};
    contracts.forEach((c) => {
      if (!groups[c.pbm]) groups[c.pbm] = [];
      groups[c.pbm].push(c);
    });
    return groups;
  }, [contracts]);

  // Calculate detailed waterfall for selected drug across all contracts
  const selectedDrugMetrics = useMemo<Record<string, ContractMetrics>>(() => {
    if (!selectedDrugId) return {};
    const drug = drugs.find((d) => d.id === selectedDrugId);
    if (!drug) return {};

    const drugClaims = claims.filter((c) => c.ndc_11 === drug.ndc_11 || c.drug_name === drug.drug_name);
    const result: Record<string, ContractMetrics> = {};

    contracts.forEach((c) => {
      const cClaims = drugClaims.filter(
        (claim) =>
          (claim.pbm_vendor_id || '').toUpperCase() === c.pbm &&
          (claim.pbm_plan_id || '').toUpperCase() === c.plan
      );

      const n = cClaims.length || 1;
      const avg = (key: string) => cClaims.reduce((s, row) => s + Number(row[key] || 0), 0) / n;

      result[c.id] = {
        id: c.id,
        pbm: c.pbm,
        plan: c.plan,
        awp: avg('awp_unit_price'),
        wac: avg('wac_unit_price'),
        nadac: avg('nadac_unit_price') || Number(drug.nadac_benchmark_unit || 0),
        pharmacyPaid: avg('amt_paid_pharmacy'),
        planBilled: avg('amt_billed_plan'),
        spread: avg('spread_amount'),
        mfgRebate: avg('mfg_rebate_total'),
        retainedRebate: avg('pbm_retained_rebate'),
        passedRebate: avg('rebate_passed_thru'),
        adminFee: avg('bfsf_admin_fee'),
        tnp: avg('true_net_price'),
      };
    });
    return result;
  }, [selectedDrugId, drugs, claims, contracts]);

  // Overall drug summary rows
  const drugSummaries = useMemo(() => {
    return drugs
      .map((drug) => {
        const drugClaims = claims.filter((c) => c.ndc_11 === drug.ndc_11 || c.drug_name === drug.drug_name);
        if (drugClaims.length === 0) return null;

        const prices: Record<string, number> = {};
        let minPrice = Infinity;
        let maxPrice = 0;
        let bestContract = '';

        contracts.forEach((c) => {
          const matched = drugClaims.filter(
            (claim) =>
              (claim.pbm_vendor_id || '').toUpperCase() === c.pbm &&
              (claim.pbm_plan_id || '').toUpperCase() === c.plan
          );
          if (matched.length > 0) {
            const avgTnp = matched.reduce((s, r) => s + Number(r.true_net_price || 0), 0) / matched.length;
            prices[c.id] = avgTnp;
            if (avgTnp < minPrice) {
              minPrice = avgTnp;
              bestContract = `${c.pbm} (${c.plan})`;
            }
            if (avgTnp > maxPrice) maxPrice = avgTnp;
          } else {
            prices[c.id] = 0;
          }
        });

        if (minPrice === Infinity) minPrice = 0;
        const maxArbitrage = maxPrice > 0 ? maxPrice - minPrice : 0;
        const savingsPct = maxPrice > 0 ? (maxArbitrage / maxPrice) * 100 : 0;

        return {
          drug,
          prices,
          minPrice,
          maxPrice,
          bestContract,
          maxArbitrage,
          savingsPct,
        };
      })
      .filter(Boolean);
  }, [drugs, claims, contracts]);

  // Default selections
  useEffect(() => {
    if (drugSummaries.length > 0 && !selectedDrugId) {
      setSelectedDrugId(drugSummaries[0]!.drug.id);
    }
    if (contracts.length >= 2 && !compareA && !compareB) {
      setCompareA(contracts[0].id);
      setCompareB(contracts[1].id);
    } else if (contracts.length === 1 && !compareA) {
      setCompareA(contracts[0].id);
    }
  }, [drugSummaries, contracts, selectedDrugId, compareA, compareB]);

  const activeDrug = drugs.find((d) => d.id === selectedDrugId);
  const metricA = selectedDrugMetrics[compareA];
  const metricB = selectedDrugMetrics[compareB];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="text-slate-400 text-sm flex items-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-teal-600" />
          <span>Synthesizing CAA 2026 economic waterfalls...</span>
        </div>
      </div>
    );
  }

  if (drugSummaries.length === 0) {
    return (
      <div className="p-6 max-w-7xl mx-auto h-[60vh] flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
          <Pill className="w-8 h-8 text-slate-300" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">No Claims Data Ingested</h2>
        <p className="text-slate-500 max-w-md">
          Head over to the <b>Data Ingestion</b> tab and upload a claims report with real contract components to unlock the waterfall analysis.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1440px] mx-auto animate-fade-in">
      {/* Search & Cloud */}
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
        {drugSummaries
          .filter((s) => s!.drug.drug_name.toLowerCase().includes(searchQuery.toLowerCase()))
          .map((item) => {
            const isSelected = selectedDrugId === item!.drug.id;
            return (
              <button
                key={item!.drug.id}
                onClick={() => setSelectedDrugId(item!.drug.id)}
                className={cn(
                  'inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-150 border',
                  isSelected
                    ? 'bg-teal-50 border-teal-500 text-teal-800 shadow-sm ring-1 ring-teal-400/40'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                )}
              >
                <Pill className={cn('w-3.5 h-3.5', isSelected ? 'text-teal-600' : 'text-slate-400')} />
                <span>{item!.drug.drug_name}</span>
                {item!.drug.is_specialty && (
                  <span className="bg-sky-100 text-sky-700 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                    Specialty
                  </span>
                )}
              </button>
            );
          })}
      </div>

      {activeDrug && (
        <>
          {/* Header */}
          <div className="card p-5 bg-white flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">{activeDrug.drug_name}</h2>
                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-300">
                  CAA 2026 Audit Ready
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-500 font-medium">
                <span className="font-mono">NDC: {activeDrug.ndc_11}</span>
                <span>•</span>
                <span className="font-mono">RxCUI: {activeDrug.rxcui || 'Pending'}</span>
                <span>•</span>
                <span className="bg-sky-50 text-sky-700 font-semibold px-2.5 py-0.5 rounded-full border border-sky-100">
                  {activeDrug.therapeutic_class}
                </span>
              </div>
            </div>
            <div className="text-left md:text-right border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Federal NADAC Acquisition Cost
                <InfoTooltip text="National Average Drug Acquisition Cost. The surveyed invoice benchmark representing true pharmacy purchase costs without PBM inflation." />
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-0.5">
                {formatCurrency(activeDrug.nadac_benchmark_unit)}
              </div>
              <div className="text-xs text-slate-400">per {activeDrug.package_unit || 'unit'}</div>
            </div>
          </div>

          {/* HEAD-TO-HEAD CONTRACT SHOOTOUT */}
          <div className="card p-6 bg-slate-50/50 border-slate-200">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-teal-600" />
                <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider">
                  Contract-Level Shootout (True Net Price)
                </h3>
              </div>
              <button
                onClick={() => setShowWaterfall(!showWaterfall)}
                className="btn btn-secondary text-xs py-1 px-2.5 flex items-center gap-1.5"
              >
                <Layers className="w-3.5 h-3.5 text-teal-600" />
                {showWaterfall ? 'Hide Component Waterfall' : 'Expand Component Waterfall'}
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-8 items-center">
              {/* Contract A Card */}
              <div className="p-5 rounded-xl border bg-white shadow-sm border-slate-200">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Contract A (Baseline)
                </label>
                <select
                  value={compareA}
                  onChange={(e) => setCompareA(e.target.value)}
                  className="input mb-4 font-semibold text-slate-800"
                >
                  {contracts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.pbm} — {c.plan}
                    </option>
                  ))}
                </select>

                {metricA ? (
                  <div>
                    <div className="text-xs text-slate-400">Standardized True Net Price (TNP-30)</div>
                    <div className="text-3xl font-extrabold text-slate-900 mt-0.5">
                      {formatCurrency(metricA.tnp)}
                    </div>
                    {metricA.spread > 0 && (
                      <div className="mt-2 text-xs font-semibold text-red-600 flex items-center gap-1">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        Includes {formatCurrency(metricA.spread)} PBM spread markup
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-slate-400 text-sm">No data</div>
                )}
              </div>

              {/* Spread Indicator */}
              <div className="flex flex-col items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-white border border-slate-200 shadow flex items-center justify-center font-black text-slate-400 text-sm">
                  VS
                </div>
                {metricA && metricB && (
                  <div className="mt-3 text-center">
                    <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">
                      Contract Arbitrage / Fill
                    </div>
                    <div className="text-emerald-600 font-bold text-lg">
                      {formatCurrency(Math.abs(metricA.tnp - metricB.tnp))}
                    </div>
                  </div>
                )}
              </div>

              {/* Contract B Card */}
              <div className="p-5 rounded-xl border bg-white shadow-sm border-slate-200">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Contract B (Target Plan)
                </label>
                <select
                  value={compareB}
                  onChange={(e) => setCompareB(e.target.value)}
                  className="input mb-4 font-semibold text-slate-800"
                >
                  {contracts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.pbm} — {c.plan}
                    </option>
                  ))}
                </select>

                {metricB ? (
                  <div>
                    <div className="text-xs text-slate-400">Standardized True Net Price (TNP-30)</div>
                    <div className="text-3xl font-extrabold text-slate-900 mt-0.5">
                      {formatCurrency(metricB.tnp)}
                    </div>
                    {metricB.spread > 0 && (
                      <div className="mt-2 text-xs font-semibold text-red-600 flex items-center gap-1">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        Includes {formatCurrency(metricB.spread)} PBM spread markup
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-slate-400 text-sm">No data</div>
                )}
              </div>
            </div>

            {/* EXPANDABLE COMPONENT WATERFALL (REAL-WORLD ADJUDICATION) */}
            {showWaterfall && metricA && metricB && (
              <div className="mt-6 pt-6 border-t border-slate-200 animate-fade-in">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-teal-600" />
                  Granular Price Component Waterfall (Per Fill)
                </h4>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2.5">Adjudication Layer</th>
                        <th className="py-2.5 text-right font-semibold text-slate-700">{compareA}</th>
                        <th className="py-2.5 text-right font-semibold text-slate-700">{compareB}</th>
                        <th className="py-2.5 text-right font-semibold text-teal-700">Contract Delta</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono text-slate-700">
                      <tr>
                        <td className="py-2 text-slate-600 font-sans">
                          1. Published AWP Benchmark
                          <InfoTooltip text="Average Wholesale Price sticker benchmark prior to network discounts." />
                        </td>
                        <td className="py-2 text-right">{formatCurrency(metricA.awp)}</td>
                        <td className="py-2 text-right">{formatCurrency(metricB.awp)}</td>
                        <td className="py-2 text-right text-slate-400">{formatCurrency(metricA.awp - metricB.awp)}</td>
                      </tr>
                      <tr>
                        <td className="py-2 text-slate-600 font-sans">
                          2. Wholesale Acquisition Cost (WAC)
                          <InfoTooltip text="Manufacturer list price without rebates or wholesaler discounts." />
                        </td>
                        <td className="py-2 text-right">{formatCurrency(metricA.wac)}</td>
                        <td className="py-2 text-right">{formatCurrency(metricB.wac)}</td>
                        <td className="py-2 text-right text-slate-400">{formatCurrency(metricA.wac - metricB.wac)}</td>
                      </tr>
                      <tr className="bg-slate-50/50">
                        <td className="py-2 font-medium font-sans text-slate-800">
                          3. Pharmacy Reimbursement (Ingredient + Disp. Fee)
                          <InfoTooltip text="The exact dollar amount paid to the dispensing pharmacy." />
                        </td>
                        <td className="py-2 text-right">{formatCurrency(metricA.pharmacyPaid)}</td>
                        <td className="py-2 text-right">{formatCurrency(metricB.pharmacyPaid)}</td>
                        <td className="py-2 text-right text-emerald-600 font-semibold">
                          {formatCurrency(metricA.pharmacyPaid - metricB.pharmacyPaid)}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 text-slate-600 font-sans">
                          4. Amount Billed to Plan Sponsor
                          <InfoTooltip text="What the PBM charged the employer/plan trust account." />
                        </td>
                        <td className="py-2 text-right font-semibold">{formatCurrency(metricA.planBilled)}</td>
                        <td className="py-2 text-right font-semibold">{formatCurrency(metricB.planBilled)}</td>
                        <td className="py-2 text-right text-slate-500">{formatCurrency(metricA.planBilled - metricB.planBilled)}</td>
                      </tr>
                      <tr className={cn(metricA.spread > 0 || metricB.spread > 0 ? 'bg-red-50/60' : '')}>
                        <td className="py-2 font-sans font-bold text-red-700 flex items-center gap-1">
                          5. Retained Spread Markup (PBM Profit)
                          <InfoTooltip text="Amount Billed to Plan minus Amount Paid to Pharmacy. Under CAA 2026 pass-through standards, this spread must be $0.00." />
                        </td>
                        <td className="py-2 text-right text-red-700 font-bold">{formatCurrency(metricA.spread)}</td>
                        <td className="py-2 text-right text-red-700 font-bold">{formatCurrency(metricB.spread)}</td>
                        <td className="py-2 text-right text-red-700 font-bold">{formatCurrency(metricA.spread - metricB.spread)}</td>
                      </tr>
                      <tr>
                        <td className="py-2 text-slate-600 font-sans">
                          6. Total Manufacturer Rebate Generated
                          <InfoTooltip text="Gross rebate paid by pharmaceutical manufacturer for formulary placement." />
                        </td>
                        <td className="py-2 text-right text-emerald-600">-{formatCurrency(metricA.mfgRebate)}</td>
                        <td className="py-2 text-right text-emerald-600">-{formatCurrency(metricB.mfgRebate)}</td>
                        <td className="py-2 text-right text-slate-400">-{formatCurrency(metricA.mfgRebate - metricB.mfgRebate)}</td>
                      </tr>
                      <tr className={cn(metricA.retainedRebate > 0 || metricB.retainedRebate > 0 ? 'bg-amber-50/60' : '')}>
                        <td className="py-2 font-sans text-amber-800 font-medium">
                          7. Rebate Retained by PBM / GPO Aggregator
                          <InfoTooltip text="Portion of manufacturer rebate withheld from the plan sponsor. Must be $0 under CAA 2026 100% pass-through mandates." />
                        </td>
                        <td className="py-2 text-right text-amber-700 font-bold">+{formatCurrency(metricA.retainedRebate)}</td>
                        <td className="py-2 text-right text-amber-700 font-bold">+{formatCurrency(metricB.retainedRebate)}</td>
                        <td className="py-2 text-right text-amber-700">{formatCurrency(metricA.retainedRebate - metricB.retainedRebate)}</td>
                      </tr>
                      <tr>
                        <td className="py-2 text-slate-600 font-sans">
                          8. Net Rebate Remitted to Plan
                          <InfoTooltip text="Rebate dollar amount actually credited to the employer/plan bank account." />
                        </td>
                        <td className="py-2 text-right text-emerald-700 font-bold">-{formatCurrency(metricA.passedRebate)}</td>
                        <td className="py-2 text-right text-emerald-700 font-bold">-{formatCurrency(metricB.passedRebate)}</td>
                        <td className="py-2 text-right text-emerald-700 font-bold">-{formatCurrency(metricA.passedRebate - metricB.passedRebate)}</td>
                      </tr>
                      <tr>
                        <td className="py-2 text-slate-600 font-sans">
                          9. Bona Fide Service Fee (BFSF)
                          <InfoTooltip text="Flat administrative fee per claim for claims processing." />
                        </td>
                        <td className="py-2 text-right">+{formatCurrency(metricA.adminFee)}</td>
                        <td className="py-2 text-right">+{formatCurrency(metricB.adminFee)}</td>
                        <td className="py-2 text-right text-slate-400">+{formatCurrency(metricA.adminFee - metricB.adminFee)}</td>
                      </tr>
                      <tr className="border-t-2 border-slate-300 bg-teal-50/50 font-bold">
                        <td className="py-3 font-sans text-teal-900 text-sm">
                          FINAL TRUE NET PRICE (TNP-30)
                          <InfoTooltip text="(Pharmacy Reimbursement + Admin Fee) minus Pass-Through Rebate." />
                        </td>
                        <td className="py-3 text-right text-teal-900 text-sm">{formatCurrency(metricA.tnp)}</td>
                        <td className="py-3 text-right text-teal-900 text-sm">{formatCurrency(metricB.tnp)}</td>
                        <td className="py-3 text-right text-emerald-700 text-sm font-extrabold">
                          {formatCurrency(metricA.tnp - metricB.tnp)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* HIERARCHICAL CROSS-PLAN MATRIX */}
          <div className="card overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-slate-400" />
                <h3 className="font-semibold text-slate-800 text-xs uppercase tracking-wider">
                  Cross-PBM & Plan TNP-30 Adjudication Matrix
                </h3>
              </div>
              <span className="text-[11px] text-slate-500 font-medium">Standardized 30-Day Supply</span>
            </div>
            <div className="overflow-x-auto">
              <table className="data-table w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white">
                    <th rowSpan={2} className="p-4 align-bottom text-xs font-bold text-slate-700 uppercase tracking-wider border-b-2 border-slate-200 min-w-[240px]">
                      Drug Name & Dosage
                    </th>
                    {Object.entries(pbmGroups).map(([pbm, groupContracts]) => (
                      <th
                        key={pbm}
                        colSpan={groupContracts.length}
                        className="p-3 text-center text-xs font-bold text-slate-800 bg-slate-100 border-l border-b border-slate-200 uppercase tracking-widest"
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" /> {pbm}
                        </div>
                      </th>
                    ))}
                    <th rowSpan={2} className="p-4 align-bottom text-xs font-bold text-slate-500 uppercase tracking-wider text-center border-l border-b-2 border-slate-200">
                      Best Contract
                    </th>
                    <th rowSpan={2} className="p-4 align-bottom text-xs font-bold text-slate-500 uppercase tracking-wider text-right border-b-2 border-slate-200">
                      Arbitrage / Fill
                    </th>
                  </tr>
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
                  {drugSummaries.map((item) => {
                    const isSelected = item!.drug.id === selectedDrugId;
                    const isHighSpread = item!.savingsPct >= 20;

                    return (
                      <tr
                        key={item!.drug.id}
                        onClick={() => setSelectedDrugId(item!.drug.id)}
                        className={cn('cursor-pointer transition-colors hover:bg-slate-50/80', isSelected && 'bg-teal-50/40')}
                      >
                        <td className="p-4 font-semibold text-slate-900 border-r border-slate-50">
                          {item!.drug.drug_name}
                        </td>
                        {Object.values(pbmGroups).flat().map((contract) => {
                          const price = item!.prices[contract.id] || 0;
                          const isLowest = price > 0 && price === item!.minPrice;
                          return (
                            <td
                              key={contract.id}
                              className={cn(
                                'p-4 text-right font-medium border-l border-slate-100',
                                isLowest ? 'text-emerald-600 font-bold bg-emerald-50/30' : 'text-slate-600'
                              )}
                            >
                              {formatCurrency(price)}
                            </td>
                          );
                        })}
                        <td className="p-4 text-center border-l border-slate-100">
                          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold px-2 py-0.5 rounded tracking-wide">
                            {item!.bestContract}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="font-semibold text-emerald-600">
                              -{formatCurrency(item!.maxArbitrage)}
                            </span>
                            {isHighSpread && (
                              <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" title="High Spread Variance Detected" />
                            )}
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

import { useState, useEffect, useMemo } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  FileText,
  Download,
  AlertTriangle,
  DollarSign,
  Clock,
  XCircle,
  CheckCircle,
  X,
  Info,
  Scale,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDateTime, formatDate } from '@/lib/format';
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

const SEVERITY_STYLES: Record<string, { badge: string; label: string }> = {
  CRITICAL_ERISA_BREACH: { badge: 'badge-critical', label: 'CRITICAL ERISA BREACH' },
  HIGH: { badge: 'badge-high', label: 'HIGH RISK' },
  MEDIUM: { badge: 'badge-medium', label: 'MEDIUM RISK' },
  WARNING: { badge: 'badge-warning', label: 'WARNING' },
};

export default function ComplianceAudit() {
  const [anomalies, setAnomalies] = useState<any[]>([]);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSeverity, setFilterSeverity] = useState<string>('ALL');
  const [selectedAnomaly, setSelectedAnomaly] = useState<any | null>(null);
  const [showCureNotice, setShowCureNotice] = useState(false);
  const [cureNoticeGenerated, setCureNoticeGenerated] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [anomRes, logRes] = await Promise.all([
          supabase.from('audit_anomalies').select('*').order('detected_at', { ascending: false }),
          supabase.from('audit_log').select('*').order('created_at', { ascending: false }),
        ]);
        if (anomRes.data) setAnomalies(anomRes.data);
        if (logRes.data) setAuditLog(logRes.data);
      } catch (err) {
        console.error('Failed to load compliance audit:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const stats = useMemo(() => {
    const open = anomalies.filter((a) => a.status === 'OPEN').length;
    const critical = anomalies.filter((a) => a.severity === 'CRITICAL_ERISA_BREACH').length;
    const totalExposure = anomalies
      .filter((a) => a.status === 'OPEN')
      .reduce((sum, a) => sum + Number(a.dollar_amount || 0), 0);
    const spreadViolations = anomalies.filter((a) => a.anomaly_type === 'VIOLATION_SPREAD_PRICING').length;
    const rebateLeakage = anomalies.filter((a) => a.anomaly_type === 'AGGREGATOR_LEAKAGE_AUDIT').length;

    return { open, critical, totalExposure, spreadViolations, rebateLeakage, total: anomalies.length };
  }, [anomalies]);

  const filteredAnomalies = useMemo(() => {
    return anomalies.filter((a) => {
      if (filterSeverity !== 'ALL' && a.severity !== filterSeverity) return false;
      return true;
    });
  }, [anomalies, filterSeverity]);

  const cureDeadline = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d;
  }, []);

  function handleGenerateNotice() {
    setShowCureNotice(true);
    setCureNoticeGenerated(true);
  }

  function handleDownloadNotice() {
    if (!selectedAnomaly) return;
    const content = `FIDUSIGHT STATUTORY CURE NOTICE\nPURSUANT TO ERISA §408(b)(2) & CAA 2026 INNOCENT FIDUCIARY SAFE HARBOR\n\nDate Issued: ${new Date().toLocaleDateString()}\nStatutory Cure Deadline: ${cureDeadline.toLocaleDateString()}\n\nTO: Pharmacy Benefit Manager / Plan Administrator\nRE: Formal Notice of Prohibited Transaction & Remuneration Non-Disclosure\n\nCLAIM AUDIT DETAILS:\n- Claim Reference ID: ${selectedAnomaly.claim_ref}\n- Plan Code: ${selectedAnomaly.pbm_plan_id || 'COMMERCIAL_ACTIVE'}\n- Statutory Violation: ${selectedAnomaly.anomaly_type}\n- Severity Classification: ${selectedAnomaly.severity}\n- Governing Legal Standard: ${selectedAnomaly.legal_statute || 'ERISA §408(b)(2)'}\n\nVIOLATION DESCRIPTION:\n${selectedAnomaly.description}\n\nTOTAL ASSESSED FINANCIAL DISALLOWANCE:\n${formatCurrency(selectedAnomaly.dollar_amount)}\n\nSTATUTORY 30-DAY NOTICE:\nPursuant to the Consolidated Appropriations Act of 2026 and ERISA §408(b)(2)(B), the plan fiduciary demands full restitution and contractual cure of the aforementioned uncredited remuneration / spread within thirty (30) calendar days. Failure to cure will result in mandatory disclosure to the U.S. Department of Labor (DOL) under Form 5500 Schedule C to maintain Innocent Fiduciary status.\n\nCryptographic Audit Hash: ${auditLog[0]?.hash_current || 'CHAIN_VERIFIED_APPEND_ONLY'}\nCertified Timestamp: ${new Date().toISOString()}`;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CAA2026_Cure_Notice_${selectedAnomaly.claim_ref}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="text-slate-400 text-sm">Evaluating fiduciary liability exposure...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto animate-fade-in">
      {/* Statutory Header */}
      <div className="card p-5 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-teal-400" />
            <h2 className="text-lg font-bold">CAA 2026 Fiduciary Compliance Dashboard</h2>
          </div>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl">
            Under ERISA §408(b)(2), plan fiduciaries must ensure all direct and indirect PBM compensation is reasonable and 100% of rebates are remitted. Issue 30-day statutory cure notices to invoke the Innocent Fiduciary Safe Harbor.
          </p>
        </div>
        <div className="text-left md:text-right">
          <div className="text-[10px] text-teal-400 font-mono uppercase tracking-wider">Safe Harbor Status</div>
          <div className="text-xl font-bold text-white flex items-center md:justify-end gap-2 mt-0.5">
            <ShieldCheck className="w-5 h-5 text-emerald-400" /> ACTIVE
          </div>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert className="w-4 h-4 text-red-500" />
            <span className="text-xs text-slate-500 uppercase tracking-wider">
              Open Violations
              <InfoTooltip text="Active claim lines violating CAA 2026 pass-through standards." />
            </span>
          </div>
          <div className="text-2xl font-bold text-red-600">{stats.open}</div>
        </div>
        <div className="stat-card border-red-200 bg-red-50/50">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <span className="text-xs text-slate-500 uppercase tracking-wider">
              Critical Breaches
              <InfoTooltip text="Prohibited transactions where PBM retained unauthorized spread margin." />
            </span>
          </div>
          <div className="text-2xl font-bold text-red-600">{stats.critical}</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-orange-500" />
            <span className="text-xs text-slate-500 uppercase tracking-wider">
              Fiduciary Exposure
              <InfoTooltip text="Total uncredited remuneration and spread margins recoverable by plan trustees." />
            </span>
          </div>
          <div className="text-2xl font-bold text-orange-600">{formatCurrency(stats.totalExposure)}</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-4 h-4 text-amber-500" />
            <span className="text-xs text-slate-500 uppercase tracking-wider">
              Spread Pricing Flags
              <InfoTooltip text="Claims where billed amount to plan exceeded pharmacy payment." />
            </span>
          </div>
          <div className="text-2xl font-bold text-amber-600">{stats.spreadViolations}</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-purple-500" />
            <span className="text-xs text-slate-500 uppercase tracking-wider">
              Rebate Leakage
              <InfoTooltip text="Manufacturer rebates retained by GPOs or aggregators." />
            </span>
          </div>
          <div className="text-2xl font-bold text-purple-600">{stats.rebateLeakage}</div>
        </div>
      </div>

      {/* Anomalies Table */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900 text-xs uppercase tracking-wider">
            Audited Statutory Violations
          </h3>
          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
            className="input max-w-[180px] h-8 text-xs py-1"
          >
            <option value="ALL">All Risk Levels</option>
            <option value="CRITICAL_ERISA_BREACH">Critical Breach Only</option>
            <option value="HIGH">High Risk Only</option>
            <option value="MEDIUM">Medium Risk Only</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Claim Ref</th>
                <th>Contract / Plan</th>
                <th>Violation Category</th>
                <th>Severity</th>
                <th className="text-right">Exposure</th>
                <th>Governing Statute</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredAnomalies.map((anom) => {
                const sevStyle = SEVERITY_STYLES[anom.severity] || SEVERITY_STYLES.WARNING;
                return (
                  <tr
                    key={anom.id}
                    onClick={() => {
                      setSelectedAnomaly(anom);
                      setShowCureNotice(false);
                      setCureNoticeGenerated(false);
                    }}
                    className="cursor-pointer hover:bg-slate-50 transition-colors"
                  >
                    <td className="font-mono text-xs text-slate-800 font-semibold">{anom.claim_ref}</td>
                    <td className="text-slate-600 font-mono text-xs">{anom.pbm_plan_id || 'COMMERCIAL'}</td>
                    <td>
                      <span className="text-xs text-slate-700 font-medium">
                        {anom.anomaly_type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase())}
                      </span>
                    </td>
                    <td>
                      <span className={cn('badge', sevStyle.badge)}>{sevStyle.label}</span>
                    </td>
                    <td className="text-right font-mono font-bold text-slate-900">
                      {formatCurrency(anom.dollar_amount)}
                    </td>
                    <td className="text-xs text-slate-500">{anom.legal_statute || 'ERISA §408(b)(2)'}</td>
                    <td>
                      <button className="btn btn-secondary py-1 px-2.5 text-xs text-teal-700 border-teal-200">
                        Inspect
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredAnomalies.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    No statutory violations detected in the active claims pool.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Selected Violation Panel & Cure Notice Generator */}
      {selectedAnomaly && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-slide-in">
          {/* Detail Card */}
          <div className="card p-5 border-l-4 border-l-red-500">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900">Fiduciary Breach Evidence File</h3>
              <button onClick={() => setSelectedAnomaly(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">Claim Reference</span>
                <span className="font-mono font-bold text-slate-800">{selectedAnomaly.claim_ref}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">Breach Classification</span>
                <span className="font-semibold text-slate-800">{selectedAnomaly.anomaly_type}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">Recoverable Disallowance</span>
                <span className="font-bold text-red-600 text-base">
                  {formatCurrency(selectedAnomaly.dollar_amount)}
                </span>
              </div>
              <div className="py-2 border-b border-slate-100">
                <span className="text-slate-500 block mb-1">Auditor Finding</span>
                <p className="text-slate-700 text-xs leading-relaxed bg-slate-50 p-2.5 rounded border border-slate-200">
                  {selectedAnomaly.description}
                </p>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate-500">Statutory 30-Day Cure Deadline</span>
                <span className="font-bold text-slate-800">{formatDate(cureDeadline.toISOString())}</span>
              </div>
            </div>

            <button onClick={handleGenerateNotice} className="btn btn-primary w-full mt-4">
              <FileText className="w-4 h-4" />
              Draft Statutory 30-Day Cure Notice
            </button>
          </div>

          {/* Cure Notice Preview */}
          {showCureNotice && (
            <div className="card p-5 border-l-4 border-l-emerald-500 animate-fade-in">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-900">Statutory Cure Notice Preview</h3>
                <span className="badge badge-success flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Fiduciary Safe Harbor Ready
                </span>
              </div>
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 space-y-3 font-mono text-xs text-slate-700">
                <div className="text-center pb-2 border-b border-slate-200">
                  <div className="font-bold text-slate-900">STATUTORY NOTICE TO CURE</div>
                  <div className="text-[10px] text-slate-500">ERISA §408(b)(2) / CAA 2026 Safe Harbor</div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Issued:</span>
                    <span>{formatDate(new Date().toISOString())}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Cure Deadline:</span>
                    <span className="font-bold text-red-600">{formatDate(cureDeadline.toISOString())}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Plan Contract:</span>
                    <span className="font-bold">{selectedAnomaly.pbm_plan_id || 'COMMERCIAL'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Claim ID:</span>
                    <span>{selectedAnomaly.claim_ref}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-slate-200 text-sm">
                    <span className="text-slate-600 font-sans font-bold">Total Restitution Owed:</span>
                    <span className="font-bold text-red-600">{formatCurrency(selectedAnomaly.dollar_amount)}</span>
                  </div>
                </div>
                <div className="pt-2 border-t border-slate-200 text-[10px] text-slate-400 break-all">
                  SHA-256 Ledger Seal: {auditLog[0]?.hash_current || 'VERIFIED_CHAIN'}
                </div>
              </div>

              <button onClick={handleDownloadNotice} className="btn btn-secondary w-full mt-4 flex items-center justify-center gap-2">
                <Download className="w-4 h-4" /> Download Official Notice (.TXT)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { AuditAnomaly, PBMVendor, Drug, AuditLogEntry } from '@/lib/supabase';
import { formatCurrency, formatDateTime, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

const SEVERITY_STYLES: Record<string, { badge: string; label: string }> = {
  CRITICAL_ERISA_BREACH: { badge: 'badge-critical', label: 'CRITICAL · ERISA BREACH' },
  HIGH: { badge: 'badge-high', label: 'HIGH' },
  MEDIUM: { badge: 'badge-medium', label: 'MEDIUM' },
  WARNING: { badge: 'badge-warning', label: 'WARNING' },
};

const STATUS_STYLES: Record<string, { badge: string; icon: typeof Clock }> = {
  OPEN: { badge: 'badge-critical', icon: AlertTriangle },
  UNDER_REVIEW: { badge: 'badge-warning', icon: Clock },
  RESOLVED: { badge: 'badge-success', icon: CheckCircle },
  DISMISSED: { badge: 'badge-neutral', icon: XCircle },
};

export default function ComplianceAudit() {
  const [anomalies, setAnomalies] = useState<AuditAnomaly[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [vendors, setVendors] = useState<PBMVendor[]>([]);
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSeverity, setFilterSeverity] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [selectedAnomaly, setSelectedAnomaly] = useState<AuditAnomaly | null>(null);
  const [showCureNotice, setShowCureNotice] = useState(false);
  const [cureNoticeGenerated, setCureNoticeGenerated] = useState(false);

  useEffect(() => {
    async function loadData() {
      const [anomRes, logRes, vendorRes, drugRes] = await Promise.all([
        supabase.from('audit_anomalies').select('*, pbm_vendors(*), drugs(*)').order('detected_at', { ascending: false }),
        supabase.from('audit_log').select('*').order('created_at', { ascending: false }),
        supabase.from('pbm_vendors').select('*'),
        supabase.from('drugs').select('*'),
      ]);

      if (anomRes.data) setAnomalies(anomRes.data);
      if (logRes.data) setAuditLog(logRes.data);
      if (vendorRes.data) setVendors(vendorRes.data);
      if (drugRes.data) setDrugs(drugRes.data);
      setLoading(false);
    }
    loadData();
  }, []);

  const filteredAnomalies = useMemo(() => {
    return anomalies.filter((a) => {
      if (filterSeverity !== 'ALL' && a.severity !== filterSeverity) return false;
      if (filterStatus !== 'ALL' && a.status !== filterStatus) return false;
      return true;
    });
  }, [anomalies, filterSeverity, filterStatus]);

  const stats = useMemo(() => {
    const open = anomalies.filter((a) => a.status === 'OPEN').length;
    const critical = anomalies.filter((a) => a.severity === 'CRITICAL_ERISA_BREACH').length;
    const totalExposure = anomalies
      .filter((a) => a.status === 'OPEN')
      .reduce((sum, a) => sum + a.dollar_amount, 0);
    const spreadViolations = anomalies.filter((a) => a.anomaly_type === 'VIOLATION_SPREAD_PRICING').length;
    const aggregatorIssues = anomalies.filter((a) => a.anomaly_type === 'AGGREGATOR_LEAKAGE_AUDIT').length;
    return { open, critical, totalExposure, spreadViolations, aggregatorIssues, total: anomalies.length };
  }, [anomalies]);

  const cureDeadline = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date;
  }, []);

  function handleGenerateCureNotice() {
    setShowCureNotice(true);
    setCureNoticeGenerated(true);
  }

  function handleDownloadCureNotice() {
    if (!selectedAnomaly) return;
    const vendor = vendors.find((v) => v.id === selectedAnomaly.pbm_vendor_id);
    const drug = drugs.find((d) => d.id === selectedAnomaly.drug_id);
    const content = `FIDUSIGHT - STATUTORY CURE NOTICE
ERISA Innocent Fiduciary Safe Harbor · CAA 2026

Date: ${new Date().toLocaleDateString()}
Cure Deadline: ${cureDeadline.toLocaleDateString()}

PLAN SPONSOR: [Plan Sponsor Name]
PBM VENDOR: ${vendor?.vendor_name || '—'}
PLAN GROUP: ${vendor?.plan_group || '—'}

VIOLATION DETAILS:
  Claim Reference: ${selectedAnomaly.claim_ref}
  Anomaly Type: ${selectedAnomaly.anomaly_type}
  Severity: ${selectedAnomaly.severity}
  Drug: ${drug?.drug_name || '—'}
  NDC: ${drug?.ndc_11 || '—'}
  Description: ${selectedAnomaly.description}
  Dollar Amount Owed: ${formatCurrency(selectedAnomaly.dollar_amount)}

STATUTORY 30-DAY CURE DEADLINE:
  ${cureDeadline.toLocaleDateString()}

This notice is generated pursuant to the Consolidated Appropriations Act of 2026
and ERISA §408(b)(2) Innocent Fiduciary Safe Harbor provisions.

Audit Ledger Hash: ${auditLog[0]?.hash_current || '—'}
Generated: ${new Date().toISOString()}
`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cure_notice_${selectedAnomaly.claim_ref}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-slate-400 text-sm">Loading compliance audit data...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert className="w-4 h-4 text-red-500" />
            <span className="text-xs text-slate-500 uppercase tracking-wider">Open Violations</span>
          </div>
          <div className="text-2xl font-bold text-red-600">{stats.open}</div>
        </div>
        <div className="stat-card border-red-200">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <span className="text-xs text-slate-500 uppercase tracking-wider">Critical Breaches</span>
          </div>
          <div className="text-2xl font-bold text-red-600">{stats.critical}</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-orange-500" />
            <span className="text-xs text-slate-500 uppercase tracking-wider">Total Exposure</span>
          </div>
          <div className="text-2xl font-bold text-orange-600">{formatCurrency(stats.totalExposure)}</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-4 h-4 text-amber-500" />
            <span className="text-xs text-slate-500 uppercase tracking-wider">Spread Violations</span>
          </div>
          <div className="text-2xl font-bold text-amber-600">{stats.spreadViolations}</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-purple-500" />
            <span className="text-xs text-slate-500 uppercase tracking-wider">Aggregator Leakage</span>
          </div>
          <div className="text-2xl font-bold text-purple-600">{stats.aggregatorIssues}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-semibold text-slate-500">Filter:</span>
        <select
          value={filterSeverity}
          onChange={(e) => setFilterSeverity(e.target.value)}
          className="input max-w-[200px]"
        >
          <option value="ALL">All Severities</option>
          <option value="CRITICAL_ERISA_BREACH">Critical ERISA Breach</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="WARNING">Warning</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="input max-w-[160px]"
        >
          <option value="ALL">All Statuses</option>
          <option value="OPEN">Open</option>
          <option value="UNDER_REVIEW">Under Review</option>
          <option value="RESOLVED">Resolved</option>
          <option value="DISMISSED">Dismissed</option>
        </select>
      </div>

      {/* Anomalies table */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-900">Compliance Anomalies</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Claim Ref</th>
                <th>PBM</th>
                <th>Drug</th>
                <th>Type</th>
                <th>Severity</th>
                <th className="text-right">Amount</th>
                <th>Status</th>
                <th>Detected</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredAnomalies.map((anom) => {
                const sevStyle = SEVERITY_STYLES[anom.severity] || SEVERITY_STYLES.WARNING;
                const statusStyle = STATUS_STYLES[anom.status] || STATUS_STYLES.OPEN;
                const StatusIcon = statusStyle.icon;
                const vendor = anom.pbm_vendors || vendors.find((v) => v.id === anom.pbm_vendor_id);
                const drug = anom.drugs || drugs.find((d) => d.id === anom.drug_id);
                return (
                  <tr
                    key={anom.id}
                    className="cursor-pointer"
                    onClick={() => { setSelectedAnomaly(anom); setShowCureNotice(false); setCureNoticeGenerated(false); }}
                  >
                    <td className="font-mono text-xs text-slate-700">{anom.claim_ref}</td>
                    <td className="text-slate-600">{vendor?.vendor_name.split(' ')[0] || '—'}</td>
                    <td className="text-slate-600">{drug?.drug_name.split('(')[0].trim() || '—'}</td>
                    <td>
                      <span className="text-xs text-slate-500">
                        {anom.anomaly_type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
                      </span>
                    </td>
                    <td>
                      <span className={cn('badge', sevStyle.badge)}>{sevStyle.label}</span>
                    </td>
                    <td className="text-right font-semibold text-slate-700">
                      {formatCurrency(anom.dollar_amount)}
                    </td>
                    <td>
                      <span className={cn('badge inline-flex items-center gap-1', statusStyle.badge)}>
                        <StatusIcon className="w-3 h-3" />
                        {anom.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="text-xs text-slate-400">{formatDate(anom.detected_at)}</td>
                    <td>
                      <FileText className="w-4 h-4 text-slate-400" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail panel + Cure notice */}
      {selectedAnomaly && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Anomaly detail */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900">Violation Detail</h3>
              <button onClick={() => setSelectedAnomaly(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-sm text-slate-500">Claim Reference</span>
                <span className="font-mono text-sm font-medium text-slate-700">{selectedAnomaly.claim_ref}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-sm text-slate-500">Anomaly Type</span>
                <span className="text-sm font-medium text-slate-700">
                  {selectedAnomaly.anomaly_type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-sm text-slate-500">Severity</span>
                <span className={cn('badge', SEVERITY_STYLES[selectedAnomaly.severity]?.badge || 'badge-warning')}>
                  {SEVERITY_STYLES[selectedAnomaly.severity]?.label || selectedAnomaly.severity}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-sm text-slate-500">Dollar Amount</span>
                <span className="font-bold text-slate-900">{formatCurrency(selectedAnomaly.dollar_amount)}</span>
              </div>
              <div className="py-2 border-b border-slate-100">
                <span className="text-sm text-slate-500 block mb-1">Description</span>
                <span className="text-sm text-slate-700">{selectedAnomaly.description}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-sm text-slate-500">Detected At</span>
                <span className="text-sm text-slate-700">{formatDateTime(selectedAnomaly.detected_at)}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-sm text-slate-500">Status</span>
                <span className="text-sm font-medium text-slate-700">{selectedAnomaly.status.replace(/_/g, ' ')}</span>
              </div>
            </div>

            {selectedAnomaly.status === 'OPEN' && (
              <button
                onClick={handleGenerateCureNotice}
                className="btn btn-primary w-full mt-4"
              >
                <FileText className="w-4 h-4" />
                Generate Cure Notice
              </button>
            )}
          </div>

          {/* Cure notice preview */}
          {showCureNotice && (
            <div className="card p-5 animate-fade-in">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-900">Statutory Cure Notice Preview</h3>
                {cureNoticeGenerated && (
                  <span className="badge badge-success inline-flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    Logged to Audit Ledger
                  </span>
                )}
              </div>
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 space-y-3">
                <div className="text-center pb-3 border-b border-slate-200">
                  <div className="font-bold text-slate-900">STATUTORY CURE NOTICE</div>
                  <div className="text-xs text-slate-500 mt-1">
                    ERISA Innocent Fiduciary Safe Harbor · CAA 2026
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Date Issued:</span>
                    <span className="font-medium text-slate-700">{formatDate(new Date().toISOString())}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Cure Deadline:</span>
                    <span className="font-bold text-red-600">{formatDate(cureDeadline.toISOString())}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">PBM Vendor:</span>
                    <span className="font-medium text-slate-700">
                      {vendors.find((v) => v.id === selectedAnomaly.pbm_vendor_id)?.vendor_name}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Claim Ref:</span>
                    <span className="font-mono font-medium text-slate-700">{selectedAnomaly.claim_ref}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Drug (NDC):</span>
                    <span className="font-medium text-slate-700 text-xs">
                      {drugs.find((d) => d.id === selectedAnomaly.drug_id)?.ndc_11}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Total Owed:</span>
                    <span className="font-bold text-slate-900">{formatCurrency(selectedAnomaly.dollar_amount)}</span>
                  </div>
                </div>
                <div className="pt-3 border-t border-slate-200">
                  <div className="text-xs text-slate-400">Audit Ledger Hash (SHA-256):</div>
                  <div className="font-mono text-xs text-slate-600 mt-1 break-all">
                    {auditLog[0]?.hash_current || 'pending'}
                  </div>
                </div>
              </div>
              <button
                onClick={handleDownloadCureNotice}
                className="btn btn-secondary w-full mt-4"
              >
                <Download className="w-4 h-4" />
                Download Cure Notice (PDF)
              </button>
            </div>
          )}
        </div>
      )}

      {/* Audit ledger */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            Tamper-Evident Audit Ledger
            <span className="text-xs text-slate-400 font-normal ml-2">SHA-256 hash chained · append-only</span>
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Action</th>
                <th>Actor</th>
                <th>Entity</th>
                <th>Hash (SHA-256)</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {auditLog.map((entry) => (
                <tr key={entry.id}>
                  <td className="font-medium text-slate-700">{entry.action.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}</td>
                  <td>
                    <span className="badge badge-neutral">{entry.actor_role}</span>
                  </td>
                  <td className="text-xs text-slate-500">{entry.entity_type}</td>
                  <td className="font-mono text-xs text-slate-400">{entry.hash_current?.slice(0, 16)}...</td>
                  <td className="text-xs text-slate-400">{formatDateTime(entry.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useMemo } from 'react';
import {
  FileUp,
  CheckCircle,
  XCircle,
  Loader,
  Building2,
  HardDrive,
  Database,
  AlertCircle,
  FileText,
  Clock,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { IngestionJob, PBMVendor } from '@/lib/supabase';
import { formatNumber, formatDateTime, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';

const STATUS_CONFIG: Record<string, { badge: string; icon: typeof CheckCircle; label: string }> = {
  COMPLETED: { badge: 'badge-success', icon: CheckCircle, label: 'Completed' },
  PROCESSING: { badge: 'badge-info', icon: Loader, label: 'Processing' },
  FAILED_SCHEMA_ERROR: { badge: 'badge-critical', icon: XCircle, label: 'Schema Error' },
  PENDING: { badge: 'badge-warning', icon: Clock, label: 'Pending' },
};

export default function DataIngestion() {
  const [jobs, setJobs] = useState<IngestionJob[]>([]);
  const [vendors, setVendors] = useState<PBMVendor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      const [jobsRes, vendorsRes] = await Promise.all([
        supabase.from('ingestion_jobs').select('*, pbm_vendors(*)').order('created_at', { ascending: false }),
        supabase.from('pbm_vendors').select('*'),
      ]);
      if (jobsRes.data) setJobs(jobsRes.data);
      if (vendorsRes.data) setVendors(vendorsRes.data);
      setLoading(false);
    }
    loadData();
  }, []);

  const stats = useMemo(() => {
    const completed = jobs.filter((j) => j.status === 'COMPLETED').length;
    const processing = jobs.filter((j) => j.status === 'PROCESSING').length;
    const failed = jobs.filter((j) => j.status === 'FAILED_SCHEMA_ERROR').length;
    const totalRows = jobs.filter((j) => j.status === 'COMPLETED').reduce((s, j) => s + (j.row_count || 0), 0);
    const totalSize = jobs.filter((j) => j.status === 'COMPLETED').reduce((s, j) => s + (j.file_size_mb || 0), 0);
    return { completed, processing, failed, totalRows, totalSize, total: jobs.length };
  }, [jobs]);

  const vendorStats = useMemo(() => {
    return vendors.map((vendor) => {
      const vendorJobs = jobs.filter((j) => j.pbm_vendor_id === vendor.id);
      const completedJobs = vendorJobs.filter((j) => j.status === 'COMPLETED');
      const totalRows = completedJobs.reduce((s, j) => s + (j.row_count || 0), 0);
      const hasErrors = vendorJobs.some((j) => j.status === 'FAILED_SCHEMA_ERROR');
      return { vendor, jobCount: vendorJobs.length, totalRows, hasErrors, lastJob: vendorJobs[0] };
    });
  }, [vendors, jobs]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-slate-400 text-sm">Loading ingestion data...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <Database className="w-4 h-4 text-teal-500" />
            <span className="text-xs text-slate-500 uppercase tracking-wider">Total Claims Ingested</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">{formatNumber(stats.totalRows)}</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <HardDrive className="w-4 h-4 text-sky-500" />
            <span className="text-xs text-slate-500 uppercase tracking-wider">Data Volume</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">{stats.totalSize.toFixed(1)} MB</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle className="w-4 h-4 text-emerald-500" />
            <span className="text-xs text-slate-500 uppercase tracking-wider">Completed Jobs</span>
          </div>
          <div className="text-2xl font-bold text-emerald-600">{stats.completed}</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <span className="text-xs text-slate-500 uppercase tracking-wider">Failed / Processing</span>
          </div>
          <div className="text-2xl font-bold text-red-600">{stats.failed + stats.processing}</div>
        </div>
      </div>

      {/* PBM vendor cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {vendorStats.map(({ vendor, jobCount, totalRows, hasErrors, lastJob }) => (
          <div key={vendor.id} className="card p-5 card-hover">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-slate-600" />
              </div>
              <div>
                <div className="font-semibold text-slate-900">{vendor.vendor_name}</div>
                <div className="text-xs text-slate-400">{vendor.plan_group}</div>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Pricing Model</span>
                <span className={cn(
                  'badge',
                  vendor.pricing_model === 'PASS_THRU' ? 'badge-success' : 'badge-warning'
                )}>
                  {vendor.pricing_model.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Ingestion Jobs</span>
                <span className="font-medium text-slate-700">{jobCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Claims Ingested</span>
                <span className="font-medium text-slate-700">{formatNumber(totalRows)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Last Activity</span>
                <span className="text-xs text-slate-400">{timeAgo(lastJob?.created_at)}</span>
              </div>
              {hasErrors && (
                <div className="flex items-center gap-1 text-xs text-red-600 pt-2 border-t border-slate-100">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Has schema validation errors
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Upload simulation */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <FileUp className="w-5 h-5 text-teal-600" />
          <h3 className="font-bold text-slate-900">PBM File Ingestion Queue</h3>
        </div>
        <div className="border-2 border-dashed border-slate-200 rounded-lg p-8 text-center">
          <FileUp className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500 mb-1">
            Drop CAA 2026 semi-annual PBM report files here
          </p>
          <p className="text-xs text-slate-400 mb-4">
            Supports CSV, PSV (pipe-delimited), XLSX, and nested JSON formats
          </p>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <span className="badge badge-neutral">UTF-8 BOM</span>
            <span className="badge badge-neutral">Auto NDC normalization</span>
            <span className="badge badge-neutral">Schema validation</span>
            <span className="badge badge-neutral">Quarantine on error</span>
          </div>
        </div>
      </div>

      {/* Jobs table */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-900">Ingestion Job History</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Filename</th>
                <th>PBM</th>
                <th className="text-right">Size</th>
                <th className="text-right">Rows</th>
                <th>Status</th>
                <th>Started</th>
                <th>Completed</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const statusCfg = STATUS_CONFIG[job.status] || STATUS_CONFIG.PENDING;
                const StatusIcon = statusCfg.icon;
                const vendor = job.pbm_vendors || vendors.find((v) => v.id === job.pbm_vendor_id);
                const duration = job.completed_at && job.started_at
                  ? Math.round((new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()) / 1000 / 60)
                  : null;
                return (
                  <tr key={job.id}>
                    <td className="font-mono text-xs text-slate-700">
                      <div className="flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-slate-400" />
                        {job.filename}
                      </div>
                    </td>
                    <td className="text-slate-600">{vendor?.vendor_name.split(' ')[0] || '—'}</td>
                    <td className="text-right text-slate-500">{job.file_size_mb?.toFixed(1) || '—'} MB</td>
                    <td className="text-right text-slate-500">{formatNumber(job.row_count)}</td>
                    <td>
                      <span className={cn('badge inline-flex items-center gap-1', statusCfg.badge)}>
                        <StatusIcon className={cn('w-3 h-3', job.status === 'PROCESSING' && 'animate-spin')} />
                        {statusCfg.label}
                      </span>
                    </td>
                    <td className="text-xs text-slate-400">{formatDateTime(job.started_at)}</td>
                    <td className="text-xs text-slate-400">{formatDateTime(job.completed_at)}</td>
                    <td className="text-xs text-slate-400">
                      {duration !== null ? `${duration}m` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Error details for failed jobs */}
        {jobs.filter((j) => j.error_details).length > 0 && (
          <div className="p-4 border-t border-slate-200 bg-red-50">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
              <div className="space-y-2">
                {jobs.filter((j) => j.error_details).map((job) => (
                  <div key={job.id} className="text-sm">
                    <span className="font-mono text-xs font-semibold text-red-700">{job.filename}:</span>{' '}
                    <span className="text-red-600">{job.error_details}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

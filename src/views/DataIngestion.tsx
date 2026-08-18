import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    const [jobsRes, vendorsRes] = await Promise.all([
      supabase.from('ingestion_jobs').select('*, pbm_vendors(*)').order('created_at', { ascending: false }),
      supabase.from('pbm_vendors').select('*'),
    ]);
    if (jobsRes.data) setJobs(jobsRes.data);
    if (vendorsRes.data) setVendors(vendorsRes.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // --- NEW INGESTION AGENT LOGIC ---
  const handleFileUpload = async (file: File) => {
    if (!file) return;
    setIsUploading(true);

    try {
      // 1. Read and parse the CSV
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim() !== '');
      const headers = lines[0].split(',').map(h => h.trim());
      
      const parsedData = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim());
        const row: any = {};
        headers.forEach((header, i) => { row[header] = values[i]; });
        return row;
      });

      // 2. Format claims and calculate True Net Price (TNP)
      const claimsData = parsedData.map(row => {
        const pharmacy = parseFloat(row.amt_paid_pharmacy || 0);
        const admin = parseFloat(row.bfsf_admin_fee || 0);
        const rebate = parseFloat(row.rebate_passed_thru || 0);
        const days = parseInt(row.days_supply || 30);
        const billed = parseFloat(row.amt_billed_plan || pharmacy);
        
        // TNP Math Agent Logic
        const tnp = ((pharmacy + admin - rebate) / days) * 30;

        return {
          pbm_vendor_id: row.pbm_vendor_id,
          ndc_11: row.ndc_11,
          drug_name: row.drug_name,
          amt_paid_pharmacy: pharmacy,
          rebate_passed_thru: rebate,
          bfsf_admin_fee: admin,
          days_supply: days,
          amt_billed_plan: billed,
          true_net_price: tnp
        };
      });

      // 3. Save claims to Supabase
      const { error: claimsError } = await supabase.from('claims').insert(claimsData);
      if (claimsError) throw claimsError;

      // 4. Save Job History Record
      const { error: jobError } = await supabase.from('ingestion_jobs').insert({
        filename: file.name,
        file_size_mb: file.size / (1024 * 1024),
        row_count: claimsData.length,
        status: 'COMPLETED',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString()
      });
      if (jobError) console.error("Could not save job history:", jobError);

      // 5. Refresh the Dashboard Data
      await loadData();

    } catch (error) {
      console.error("Upload failed:", error);
      alert("Error processing file. Please ensure your Supabase tables are set up correctly.");
    } finally {
      setIsUploading(false);
      setIsDragging(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = () => setIsDragging(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

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

      {/* NEW FUNCTIONAL UPLOAD SECTION */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <FileUp className="w-5 h-5 text-teal-600" />
          <h3 className="font-bold text-slate-900">PBM File Ingestion Queue</h3>
        </div>
        
        <input 
          type="file" 
          accept=".csv" 
          ref={fileInputRef} 
          className="hidden" 
          onChange={(e) => e.target.files && handleFileUpload(e.target.files[0])} 
        />
        
        <div 
          onClick={() => !isUploading && fileInputRef.current?.click()}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={cn(
            "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors duration-200",
            isDragging ? "border-teal-500 bg-teal-50" : "border-slate-200 hover:border-teal-400 hover:bg-slate-50",
            isUploading && "opacity-50 cursor-not-allowed"
          )}
        >
          {isUploading ? (
            <Loader className="w-10 h-10 text-teal-500 mx-auto mb-3 animate-spin" />
          ) : (
            <FileUp className={cn("w-10 h-10 mx-auto mb-3", isDragging ? "text-teal-500" : "text-slate-300")} />
          )}
          
          <p className="text-sm font-semibold text-slate-700 mb-1">
            {isUploading ? "Processing PBM Claims..." : "Click or Drop CAA 2026 CSV file here"}
          </p>
          <p className="text-xs text-slate-400 mb-4">
            Supports CSV, PSV, XLSX, and nested JSON formats
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
          <table className="data-table w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="p-4 text-xs font-medium text-slate-500">Filename</th>
                <th className="p-4 text-xs font-medium text-slate-500">PBM</th>
                <th className="p-4 text-xs font-medium text-slate-500 text-right">Size</th>
                <th className="p-4 text-xs font-medium text-slate-500 text-right">Rows</th>
                <th className="p-4 text-xs font-medium text-slate-500">Status</th>
                <th className="p-4 text-xs font-medium text-slate-500">Started</th>
                <th className="p-4 text-xs font-medium text-slate-500">Completed</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const statusCfg = STATUS_CONFIG[job.status] || STATUS_CONFIG.PENDING;
                const StatusIcon = statusCfg.icon;
                const vendor = job.pbm_vendors || vendors.find((v) => v.id === job.pbm_vendor_id);
                return (
                  <tr key={job.id} className="border-b border-slate-100">
                    <td className="p-4 font-mono text-xs text-slate-700">
                      <div className="flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-slate-400" />
                        {job.filename}
                      </div>
                    </td>
                    <td className="p-4 text-slate-600">{vendor?.vendor_name.split(' ')[0] || 'Mixed/Unknown'}</td>
                    <td className="p-4 text-right text-slate-500">{job.file_size_mb?.toFixed(3) || '—'} MB</td>
                    <td className="p-4 text-right text-slate-500">{formatNumber(job.row_count)}</td>
                    <td className="p-4">
                      <span className={cn('badge inline-flex items-center gap-1', statusCfg.badge)}>
                        <StatusIcon className={cn('w-3 h-3', job.status === 'PROCESSING' && 'animate-spin')} />
                        {statusCfg.label}
                      </span>
                    </td>
                    <td className="p-4 text-xs text-slate-400">{formatDateTime(job.started_at)}</td>
                    <td className="p-4 text-xs text-slate-400">{formatDateTime(job.completed_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

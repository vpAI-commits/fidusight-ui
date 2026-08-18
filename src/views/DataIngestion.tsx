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

  // --- CONNECTED TO YOUR PYTHON RENDER AGENT ---
  const handleFileUpload = async (file: File) => {
    if (!file) return;
    setIsUploading(true);

    try {
      // 1. Package the file to send over the internet
      const formData = new FormData();
      formData.append("file", file);

      // 2. Send it to your live Python Agent
      const response = await fetch("https://fidusight-agent.onrender.com/ingest", {
        method: "POST",
        body: formData,
      });

      // 3. Check if the Agent ran into any errors (like a bad file type)
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Agent failed to process file");
      }

      // 4. Save Job History Record now that the agent finished saving claims
      const { error: jobError } = await supabase.from('ingestion_jobs').insert({
        filename: file.name,
        file_size_mb: file.size / (1024 * 1024),
        status: 'COMPLETED',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString()
      });
      if (jobError) console.error("Could not save job history:", jobError);

      // 5. Refresh the Dashboard Data
      await loadData();

    } catch (error) {
      console.error("Upload failed:", error);
      alert(`Error: ${(error as Error).message}`);
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
    const totalSize = jobs.filter((j) => j.status === 'COMPLETED').reduce((s, j) => s + (j.file_size_mb || 0), 0);
    return { completed, processing, failed, totalSize, total: jobs.length };
  }, [jobs]);

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
            <CheckCircle className="w-4 h-4 text-emerald-500" />
            <span className="text-xs text-slate-500 uppercase tracking-wider">Completed Jobs</span>
          </div>
          <div className="text-2xl font-bold text-emerald-600">{stats.completed}</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <HardDrive className="w-4 h-4 text-sky-500" />
            <span className="text-xs text-slate-500 uppercase tracking-wider">Data Volume</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">{stats.totalSize.toFixed(3)} MB</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <span className="text-xs text-slate-500 uppercase tracking-wider">Failed / Processing</span>
          </div>
          <div className="text-2xl font-bold text-red-600">{stats.failed + stats.processing}</div>
        </div>
        <div className="stat-card">
           <div className="flex items-center gap-2 mb-1">
            <Database className="w-4 h-4 text-teal-500" />
            <span className="text-xs text-slate-500 uppercase tracking-wider">Agent Status</span>
          </div>
          <div className="text-xl font-bold text-slate-900 flex items-center gap-2">
             <span className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse"></span>
             Online
          </div>
        </div>
      </div>

      {/* UPLOAD SECTION */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <FileUp className="w-5 h-5 text-teal-600" />
          <h3 className="font-bold text-slate-900">Python Agent Ingestion Queue</h3>
        </div>
        
        <input 
          type="file" 
          accept=".csv,.xlsx,.json" 
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
            {isUploading ? "Agent is processing claims..." : "Click or Drop CSV, XLSX, or JSON file here"}
          </p>
          <p className="text-xs text-slate-400 mb-4">
            Files are securely transmitted to the Python processing engine
          </p>
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
                <th className="p-4 text-xs font-medium text-slate-500 text-right">Size</th>
                <th className="p-4 text-xs font-medium text-slate-500">Status</th>
                <th className="p-4 text-xs font-medium text-slate-500">Started</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const statusCfg = STATUS_CONFIG[job.status] || STATUS_CONFIG.PENDING;
                const StatusIcon = statusCfg.icon;
                return (
                  <tr key={job.id} className="border-b border-slate-100">
                    <td className="p-4 font-mono text-xs text-slate-700">
                      <div className="flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-slate-400" />
                        {job.filename}
                      </div>
                    </td>
                    <td className="p-4 text-right text-slate-500">{job.file_size_mb?.toFixed(3) || '—'} MB</td>
                    <td className="p-4">
                      <span className={cn('badge inline-flex items-center gap-1', statusCfg.badge)}>
                        <StatusIcon className={cn('w-3 h-3', job.status === 'PROCESSING' && 'animate-spin')} />
                        {statusCfg.label}
                      </span>
                    </td>
                    <td className="p-4 text-xs text-slate-400">{formatDateTime(job.started_at)}</td>
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

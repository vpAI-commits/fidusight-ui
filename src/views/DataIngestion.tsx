import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  FileUp,
  CheckCircle,
  XCircle,
  Loader,
  HardDrive,
  Database,
  AlertCircle,
  FileText,
  Clock,
  Edit2,
  Save,
  CheckSquare
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { IngestionJob } from '@/lib/supabase';
import { formatNumber, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

const STATUS_CONFIG: Record<string, { badge: string; icon: typeof CheckCircle; label: string }> = {
  COMPLETED: { badge: 'badge-success', icon: CheckCircle, label: 'Completed' },
  PROCESSING: { badge: 'badge-info', icon: Loader, label: 'Processing' },
  PENDING: { badge: 'badge-warning', icon: Clock, label: 'Pending' },
};

export default function DataIngestion() {
  const [jobs, setJobs] = useState<IngestionJob[]>([]);
  const [quarantined, setQuarantined] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [activeTab, setActiveTab] = useState<'history' | 'review'>('history');
  
  // Review System State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    const [jobsRes, quarantineRes] = await Promise.all([
      supabase.from('ingestion_jobs').select('*').order('created_at', { ascending: false }),
      supabase.from('quarantined_claims').select('*').eq('status', 'NEEDS_REVIEW').order('created_at', { ascending: false }),
    ]);
    if (jobsRes.data) setJobs(jobsRes.data);
    if (quarantineRes.data) setQuarantined(quarantineRes.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleFileUpload = async (file: File) => {
    if (!file) return;
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("https://fidusight-agent.onrender.com/ingest", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Agent failed to process file");
      }

      await supabase.from('ingestion_jobs').insert({
        filename: file.name,
        file_size_mb: file.size / (1024 * 1024),
        status: 'COMPLETED',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString()
      });

      await loadData();
      
      // Auto-switch to review tab if quarantine items were found
      const result = await response.json();
      if (result.quarantined_rows > 0) {
        setActiveTab('review');
      }

    } catch (error) {
      console.error("Upload failed:", error);
      alert(`Error: ${(error as Error).message}`);
    } finally {
      setIsUploading(false);
      setIsDragging(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // --- REVIEW MANAGEMENT SYSTEM LOGIC ---
  const startEditing = (claim: any) => {
    setEditingId(claim.id);
    setEditForm({ ...claim });
  };

  const handleApprove = async () => {
    if (!editingId) return;
    
    try {
      // 1. Recalculate True Net Price with corrected values
      const pharmacyAmt = parseFloat(editForm.amt_paid_pharmacy || 0);
      const rebate = parseFloat(editForm.rebate_passed_thru || 0);
      const tnp = pharmacyAmt - rebate;

      const cleanClaim = {
        pbm_vendor_id: editForm.pbm_vendor_id,
        ndc_11: editForm.ndc_11,
        drug_name: editForm.drug_name,
        amt_paid_pharmacy: pharmacyAmt,
        rebate_passed_thru: rebate,
        true_net_price: tnp
      };

      // 2. Insert into the valid claims table
      await supabase.from('claims').insert([cleanClaim]);

      // 3. Delete from quarantine
      await supabase.from('quarantined_claims').delete().eq('id', editingId);

      // 4. Reset UI
      setEditingId(null);
      setEditForm({});
      await loadData();
      
    } catch (error) {
      alert("Failed to approve claim. Please check your inputs.");
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-slate-400 text-sm">Loading systems...</div>
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
          <div className="text-2xl font-bold text-emerald-600">{jobs.length}</div>
        </div>
        <div className="stat-card border-amber-200 bg-amber-50">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className="w-4 h-4 text-amber-500" />
            <span className="text-xs text-slate-500 uppercase tracking-wider">Requires Review</span>
          </div>
          <div className="text-2xl font-bold text-amber-600">{quarantined.length}</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <HardDrive className="w-4 h-4 text-sky-500" />
            <span className="text-xs text-slate-500 uppercase tracking-wider">Data Volume</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {jobs.reduce((s, j) => s + (j.file_size_mb || 0), 0).toFixed(3)} MB
          </div>
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
            {isUploading ? "Agent is processing and auditing claims..." : "Click or Drop CSV, XLSX, or JSON file here"}
          </p>
        </div>
      </div>

      {/* TABS: Job History vs Review Queue */}
      <div className="card overflow-hidden">
        <div className="flex border-b border-slate-200">
          <button 
            onClick={() => setActiveTab('history')}
            className={cn("p-4 text-sm font-medium transition-colors", activeTab === 'history' ? "text-teal-600 border-b-2 border-teal-600" : "text-slate-500 hover:text-slate-700")}
          >
            Ingestion Job History
          </button>
          <button 
            onClick={() => setActiveTab('review')}
            className={cn("p-4 text-sm font-medium transition-colors flex items-center gap-2", activeTab === 'review' ? "text-amber-600 border-b-2 border-amber-600" : "text-slate-500 hover:text-slate-700")}
          >
            Action Required 
            {quarantined.length > 0 && <span className="badge badge-warning">{quarantined.length}</span>}
          </button>
        </div>

        {/* TAB 1: HISTORY */}
        {activeTab === 'history' && (
          <div className="overflow-x-auto">
            <table className="data-table w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="p-4 text-xs font-medium text-slate-500">Filename</th>
                  <th className="p-4 text-xs font-medium text-slate-500 text-right">Size</th>
                  <th className="p-4 text-xs font-medium text-slate-500">Status</th>
                  <th className="p-4 text-xs font-medium text-slate-500">Started</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className="border-b border-slate-100">
                    <td className="p-4 font-mono text-xs text-slate-700">
                      <div className="flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-slate-400" />
                        {job.filename}
                      </div>
                    </td>
                    <td className="p-4 text-right text-slate-500">{job.file_size_mb?.toFixed(3) || '—'} MB</td>
                    <td className="p-4">
                      <span className="badge badge-success inline-flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> Completed
                      </span>
                    </td>
                    <td className="p-4 text-xs text-slate-400">{formatDateTime(job.started_at)}</td>
                  </tr>
                ))}
                {jobs.length === 0 && (
                  <tr><td colSpan={4} className="p-8 text-center text-slate-500 text-sm">No ingestion jobs yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 2: QUARANTINE REVIEW MANAGEMENT */}
        {activeTab === 'review' && (
          <div className="overflow-x-auto">
            <table className="data-table w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-amber-50/50">
                  <th className="p-4 text-xs font-medium text-amber-700">Audit Flag / Error Reason</th>
                  <th className="p-4 text-xs font-medium text-slate-500">Drug Name</th>
                  <th className="p-4 text-xs font-medium text-slate-500">NDC-11</th>
                  <th className="p-4 text-xs font-medium text-slate-500">Paid Amount</th>
                  <th className="p-4 text-xs font-medium text-slate-500 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {quarantined.map((claim) => {
                  const isEditing = editingId === claim.id;
                  
                  return (
                    <tr key={claim.id} className={cn("border-b border-slate-100", isEditing && "bg-slate-50")}>
                      <td className="p-4">
                        <div className="text-xs font-semibold text-red-600 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> {claim.error_reason}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">PBM: {claim.pbm_vendor_id}</div>
                      </td>
                      
                      <td className="p-4 text-sm text-slate-700">{claim.drug_name}</td>
                      
                      <td className="p-4">
                        {isEditing ? (
                          <input 
                            type="text" 
                            className="border border-slate-300 rounded px-2 py-1 text-sm w-32 focus:outline-teal-500"
                            value={editForm.ndc_11 || ''}
                            onChange={(e) => setEditForm({...editForm, ndc_11: e.target.value})}
                          />
                        ) : (
                          <span className="text-sm font-mono text-slate-600">{claim.ndc_11 || '—'}</span>
                        )}
                      </td>

                      <td className="p-4">
                        {isEditing ? (
                          <input 
                            type="number" 
                            className="border border-slate-300 rounded px-2 py-1 text-sm w-24 focus:outline-teal-500"
                            value={editForm.amt_paid_pharmacy || ''}
                            onChange={(e) => setEditForm({...editForm, amt_paid_pharmacy: e.target.value})}
                          />
                        ) : (
                          <span className="text-sm text-slate-600">${claim.amt_paid_pharmacy || '—'}</span>
                        )}
                      </td>

                      <td className="p-4 text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => setEditingId(null)} className="text-xs text-slate-500 hover:text-slate-700">Cancel</button>
                            <button onClick={handleApprove} className="btn-primary py-1 px-3 text-xs flex items-center gap-1">
                              <CheckSquare className="w-3 h-3" /> Approve
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => startEditing(claim)} className="text-teal-600 hover:text-teal-700 flex items-center gap-1 ml-auto text-sm font-medium">
                            <Edit2 className="w-3 h-3" /> Fix Data
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {quarantined.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-12 text-center">
                      <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
                      <div className="text-slate-700 font-medium">Review Queue is Empty</div>
                      <div className="text-slate-500 text-sm">All ingested claims have passed schema validation.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

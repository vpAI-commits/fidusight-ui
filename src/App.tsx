import { useState } from 'react';
import { 
  Activity, 
  Pill, 
  ShieldAlert, 
  FileUp, 
  Layers, 
  Scale,
  Bell,
  Search,
  Settings,
  User,
  ChevronDown
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Import your views
import DashboardOverview from './views/DashboardOverview';
import DrugComparator from './views/DrugComparator';
import ComplianceAudit from './views/ComplianceAudit';
import DataIngestion from './views/DataIngestion';

export default function App() {
  const [activeView, setActiveView] = useState('dashboard');

  const navigation = [
    { id: 'dashboard', label: 'Platform Overview', icon: Activity },
    { id: 'comparator', label: 'Drug Comparator', icon: Pill },
    { id: 'arbitrage', label: 'Class Arbitrage', icon: Layers },
    { id: 'compliance', label: 'Compliance Audit', icon: ShieldAlert },
    { id: 'ingestion', label: 'Data Ingestion', icon: FileUp },
  ];

  const renderView = () => {
    switch (activeView) {
      case 'dashboard': return <DashboardOverview onNavigate={setActiveView} />;
      case 'comparator': return <DrugComparator />;
      case 'compliance': return <ComplianceAudit />;
      case 'ingestion': return <DataIngestion />;
      default: return (
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-slate-400 text-center animate-fade-in">
            <Layers className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <h2 className="text-lg font-bold text-slate-900">Module in Development</h2>
            <p>This module is currently being provisioned.</p>
          </div>
        </div>
      );
    }
  };

  return (
    <div className="flex h-screen bg-[#F8FAFC] font-sans overflow-hidden">
      
      {/* PREMIUM SIDEBAR */}
      <aside className="w-72 bg-[#0B1120] text-slate-300 flex flex-col shadow-2xl relative z-20">
        {/* Brand Header */}
        <div className="h-16 flex items-center px-6 border-b border-white/10 shrink-0">
          <div className="w-8 h-8 bg-gradient-to-br from-teal-400 to-emerald-500 rounded-lg flex items-center justify-center mr-3 shadow-lg shadow-teal-500/20">
            <Scale className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-white tracking-wide text-lg leading-tight">FiduSight</h1>
            <p className="text-[10px] uppercase tracking-widest text-teal-400 font-semibold">CAA 2026 Engine</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-6 space-y-1.5 overflow-y-auto">
          <div className="px-3 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-widest">Intelligence Menu</div>
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group relative',
                  isActive 
                    ? 'bg-teal-500/10 text-teal-300' 
                    : 'hover:bg-white/5 hover:text-white'
                )}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-teal-400 rounded-r-full" />
                )}
                <Icon className={cn("w-5 h-5 transition-colors", isActive ? 'text-teal-400' : 'text-slate-500 group-hover:text-slate-300')} />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* User Profile Area */}
        <div className="p-4 m-3 bg-white/5 rounded-xl border border-white/5 shrink-0 hover:bg-white/10 transition-colors cursor-pointer flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 flex items-center justify-center text-white font-bold text-sm shadow-md">
            VP
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white truncate">Varun Priyadarshan</p>
            <p className="text-xs text-slate-400 truncate">Plan Fiduciary</p>
          </div>
          <Settings className="w-4 h-4 text-slate-500" />
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col h-full relative overflow-hidden">
        
        {/* FROSTED GLASS TOP NAVIGATION */}
        <header className="h-16 bg-white/70 backdrop-blur-xl border-b border-slate-200/80 flex items-center justify-between px-8 sticky top-0 z-10 shrink-0">
          
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-800">
              {navigation.find(n => n.id === activeView)?.label || 'Overview'}
            </h2>
          </div>

          <div className="flex items-center gap-4">
            {/* Global Search */}
            <div className="relative hidden md:block group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-teal-500 transition-colors" />
              <input 
                type="text" 
                placeholder="Search NDCs, Plans, or Rules..." 
                className="pl-9 pr-4 py-1.5 bg-slate-100/50 border border-slate-200 rounded-full text-sm w-64 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all focus:bg-white"
              />
            </div>

            {/* Notifications */}
            <button className="relative p-2 text-slate-400 hover:text-teal-600 transition-colors rounded-full hover:bg-slate-100">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
            </button>
            
            <div className="h-6 w-px bg-slate-200"></div>
            
            <div className="flex items-center gap-2 text-sm font-medium text-slate-600 cursor-pointer hover:text-slate-900">
              Workspace <ChevronDown className="w-4 h-4" />
            </div>
          </div>
        </header>

        {/* SCROLLABLE VIEW PORT */}
        <div className="flex-1 overflow-y-auto">
          {renderView()}
        </div>
        
      </main>
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  Pill,
  GitCompareArrows,
  ShieldAlert,
  FileUp,
  Scale,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import DrugComparator from '@/views/DrugComparator';
import ClassArbitrage from '@/views/ClassArbitrage';
import ComplianceAudit from '@/views/ComplianceAudit';
import DataIngestion from '@/views/DataIngestion';
import DashboardOverview from '@/views/DashboardOverview';

type ViewId = 'overview' | 'comparator' | 'arbitrage' | 'compliance' | 'ingestion';

interface NavItem {
  id: ViewId;
  label: string;
  icon: typeof Activity;
  description: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Dashboard', icon: Activity, description: 'Platform overview & KPIs' },
  { id: 'comparator', label: 'Drug Comparator', icon: Pill, description: 'Cross-PBM price comparison' },
  { id: 'arbitrage', label: 'Class Arbitrage', icon: GitCompareArrows, description: 'Carve-out simulator' },
  { id: 'compliance', label: 'Compliance Audit', icon: ShieldAlert, description: 'ERISA violations & cure notices' },
  { id: 'ingestion', label: 'Data Ingestion', icon: FileUp, description: 'PBM file processing' },
];

function App() {
  const [activeView, setActiveView] = useState<ViewId>('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') setSidebarCollapsed(false);
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const activeNavItem = NAV_ITEMS.find((item) => item.id === activeView)!;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Sidebar */}
      <aside
        className={cn(
          'flex flex-col bg-white border-r border-slate-200 transition-all duration-200 flex-shrink-0',
          sidebarCollapsed ? 'w-16' : 'w-64'
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 h-16 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-teal-500 to-cyan-600 flex-shrink-0">
            <Scale className="w-5 h-5 text-white" />
          </div>
          {!sidebarCollapsed && (
            <div className="animate-slide-in">
              <h1 className="text-sm font-bold text-slate-900 leading-tight">FiduSight</h1>
              <p className="text-xs text-slate-500 leading-tight">Multi-PBM Intelligence</p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                className={cn('nav-item w-full', isActive ? 'nav-item-active' : 'nav-item-inactive')}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {!sidebarCollapsed && (
                  <div className="text-left animate-slide-in">
                    <div className="leading-tight">{item.label}</div>
                    <div className="text-xs text-slate-400 font-normal leading-tight">{item.description}</div>
                  </div>
                )}
              </button>
            );
          })}
        </nav>

        {/* Collapse toggle */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="flex items-center justify-center py-3 border-t border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <ChevronRight className={cn('w-4 h-4 transition-transform', sidebarCollapsed ? '' : 'rotate-180')} />
        </button>

        {/* Compliance footer */}
        {!sidebarCollapsed && (
          <div className="p-3 border-t border-slate-200">
            <div className="rounded-lg bg-slate-50 p-3 space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                <ShieldAlert className="w-3.5 h-3.5 text-emerald-600" />
                CAA 2026 Compliant
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                HIPAA · SOC2 Type II · ERISA §408(b)(2)
              </p>
            </div>
          </div>
        )}
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between h-16 px-6 bg-white border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-slate-900">{activeNavItem.label}</h2>
            <span className="text-slate-300">|</span>
            <span className="text-sm text-slate-500">{activeNavItem.description}</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs text-slate-500 font-medium">Engine Online</span>
            </div>
            <div className="w-px h-6 bg-slate-200" />
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-white text-xs font-semibold">
                LA
              </div>
              <div className="text-right">
                <div className="text-xs font-semibold text-slate-700">Legal Auditor</div>
                <div className="text-xs text-slate-400">PAYER_CFO role</div>
              </div>
            </div>
          </div>
        </header>

        {/* View content */}
        <main className="flex-1 overflow-auto">
          <div key={activeView} className="animate-fade-in">
            {activeView === 'overview' && <DashboardOverview onNavigate={(v) => setActiveView(v as ViewId)} />}
            {activeView === 'comparator' && <DrugComparator />}
            {activeView === 'arbitrage' && <ClassArbitrage />}
            {activeView === 'compliance' && <ComplianceAudit />}
            {activeView === 'ingestion' && <DataIngestion />}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;

{/* Logo */}
        <div className="flex items-center gap-3 px-4 h-16 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-teal-500 to-cyan-600 flex-shrink-0">
            <Scale className="w-5 h-5 text-white" />
          </div>
          {!sidebarCollapsed && (
            <div className="animate-slide-in">
              <h1 className="text-sm font-bold text-slate-900 leading-tight">Rebate Guard</h1>
              <p className="text-xs text-slate-500 leading-tight">Multi-PBM Intelligence</p>
            </div>
          )}
        </div>

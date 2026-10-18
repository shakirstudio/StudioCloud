import React from 'react';
import { 
  LayoutDashboard, 
  Images, 
  Layout,
  Users, 
  UserCheck, 
  HardDrive, 
  Palette, 
  Settings, 
  ShieldAlert, 
  Camera,
  ExternalLink,
  Lock,
  CheckSquare,
  Bell
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { formatBytes } from '../../services/studioService';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  mobileOpen,
  onCloseMobile,
}) => {
  const { activeStudio, isSuperAdmin } = useAuth();

  const navItems = [
    { id: 'overview', label: 'Workspace', icon: LayoutDashboard },
    { id: 'galleries', label: 'Galleries & Proofs', icon: Images },
    { id: 'templates', label: 'Gallery Templates', icon: Layout },
    { id: 'clients', label: 'Client CRM', icon: Users },
    { id: 'tasks', label: 'Production Tasks', icon: CheckSquare },
    { id: 'activity', label: 'Activity & Alerts', icon: Bell },
    { id: 'team', label: 'Studio Team', icon: UserCheck },
    { id: 'storage', label: 'Storage & Quota', icon: HardDrive },
    { id: 'branding', label: 'Studio & Branding', icon: Palette },
    { id: 'settings', label: 'Preferences', icon: Settings },
  ];

  const usedBytes = activeStudio?.storageUsedBytes || 0;
  const allocBytes = activeStudio?.storageAllocationBytes || 10737418240; // 10 GB
  const usedPercent = Math.min(100, (usedBytes / allocBytes) * 100);

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div 
          onClick={onCloseMobile}
          className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-xs"
        />
      )}

      <aside className={`fixed lg:sticky top-0 lg:top-16 z-40 h-full lg:h-[calc(100vh-4rem)] w-64 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col justify-between transition-transform duration-200 ease-in-out ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}>
        <div className="p-4 space-y-6 overflow-y-auto">
          {/* Brand Logo in Sidebar for mobile or standalone */}
          <div className="flex items-center gap-2.5 px-2">
            <div className="w-8 h-8 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center shadow-md">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <div className="font-serif font-bold text-base tracking-tight text-zinc-900 dark:text-white flex items-center gap-1.5">
                StudioCloud
                <span className="text-[10px] uppercase font-sans font-semibold px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">
                  SaaS
                </span>
              </div>
              <div className="text-[10px] text-zinc-400 font-sans tracking-wide">
                Photography Management
              </div>
            </div>
          </div>

          {/* Navigation Menu */}
          <nav className="space-y-1">
            <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Studio Operations
            </div>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    onCloseMobile();
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-semibold shadow-xs'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-amber-400 dark:text-amber-600' : 'text-zinc-400 dark:text-zinc-500'}`} />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}

            {/* Super Admin Section */}
            <div className="pt-4 px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-purple-500/80 dark:text-purple-400/80 flex items-center justify-between">
              <span>Platform Control</span>
              {isSuperAdmin && (
                <span className="text-[9px] bg-purple-500/20 text-purple-400 px-1.5 rounded">SuperAdmin</span>
              )}
            </div>

            <button
              onClick={() => {
                setActiveTab('superadmin');
                onCloseMobile();
              }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'superadmin'
                  ? 'bg-purple-600 text-white font-semibold shadow-sm'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-purple-600 dark:hover:text-purple-300 hover:bg-purple-500/10'
              }`}
            >
              <div className="flex items-center gap-3">
                <ShieldAlert className={`w-4 h-4 ${activeTab === 'superadmin' ? 'text-white' : 'text-purple-400'}`} />
                <span>Super Admin</span>
              </div>
              {!isSuperAdmin && (
                <Lock className="w-3 h-3 text-zinc-400" />
              )}
            </button>
          </nav>
        </div>

        {/* Sidebar Footer: Storage Allocation Widget */}
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-amber-500" />
              Default 10 GB Allocation
            </span>
            <span className="text-[10px] font-mono text-zinc-400">
              {usedPercent.toFixed(1)}%
            </span>
          </div>

          <div className="w-full h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-300 ${
                usedPercent > 80 ? 'bg-rose-500' : 'bg-gradient-to-r from-amber-500 to-amber-400'
              }`}
              style={{ width: `${Math.max(2, usedPercent)}%` }}
            />
          </div>

          <div className="flex justify-between text-[10px] text-zinc-500 dark:text-zinc-400">
            <span>Used: {formatBytes(usedBytes)}</span>
            <span>Allocated: 10 GB</span>
          </div>

          <button
            onClick={() => setActiveTab('storage')}
            className="w-full text-center py-1.5 text-[11px] font-medium text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 border border-amber-500/20 hover:border-amber-500/40 rounded-md transition-colors bg-amber-500/5 hover:bg-amber-500/10"
          >
            Manage Storage & Plans
          </button>
        </div>
      </aside>
    </>
  );
};

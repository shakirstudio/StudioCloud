import React, { useState, useEffect } from 'react';
import { 
  Images, 
  Users, 
  UserCheck, 
  HardDrive, 
  Plus, 
  ArrowUpRight, 
  Clock, 
  ShieldAlert, 
  CheckCircle2, 
  AlertCircle,
  ExternalLink,
  Sparkles,
  Info,
  Camera,
  CheckSquare
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { 
  getGalleries, 
  getClients, 
  getTeamMembers, 
  getActivityLogs, 
  getTasks,
  formatBytes,
  DEFAULT_ALLOCATION_BYTES
} from '../../services/studioService';
import { Gallery, Client, StudioMember, ActivityLog, ProductionTask } from '../../types';
import { Badge } from '../common/Badge';

interface DashboardModuleProps {
  onNavigate: (tab: string) => void;
  onOpenCreateGallery: () => void;
  onOpenCreateClient: () => void;
}

export const DashboardModule: React.FC<DashboardModuleProps> = ({
  onNavigate,
  onOpenCreateGallery,
  onOpenCreateClient,
}) => {
  const { activeStudio } = useAuth();
  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [members, setMembers] = useState<StudioMember[]>([]);
  const [tasks, setTasks] = useState<ProductionTask[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeStudio) return;

    let isMounted = true;
    async function loadWorkspaceData() {
      setLoading(true);
      try {
        const [gRes, cRes, mRes, aRes, tRes] = await Promise.allSettled([
          getGalleries(activeStudio!.id),
          getClients(activeStudio!.id),
          getTeamMembers(activeStudio!.id),
          getActivityLogs(activeStudio!.id, 10),
          getTasks(activeStudio!.id),
        ]);
        if (isMounted) {
          if (gRes.status === 'fulfilled' && gRes.value) setGalleries(gRes.value);
          if (cRes.status === 'fulfilled' && cRes.value) setClients(cRes.value);
          if (mRes.status === 'fulfilled' && mRes.value) setMembers(mRes.value);
          if (aRes.status === 'fulfilled' && aRes.value) setActivityLogs(aRes.value);
          if (tRes.status === 'fulfilled' && tRes.value) setTasks(tRes.value);
        }
      } catch (err) {
        console.error('Error loading workspace metrics:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadWorkspaceData();
    return () => { isMounted = false; };
  }, [activeStudio]);

  if (!activeStudio) {
    return (
      <div className="p-8 text-center text-zinc-500">
        No active studio selected. Please select or register a photography studio.
      </div>
    );
  }

  const usedBytes = activeStudio.storageUsedBytes || 0;
  const allocBytes = activeStudio.storageAllocationBytes || DEFAULT_ALLOCATION_BYTES;
  const remainingBytes = Math.max(0, allocBytes - usedBytes);
  const percentUsed = Math.min(100, (usedBytes / allocBytes) * 100);

  const publishedGalleries = galleries.filter(g => g.status === 'published').length;
  const activeClients = clients.filter(c => c.status === 'active' || c.status === 'lead').length;
  const totalPhotos = galleries.reduce((acc, g) => acc + (g.photoCount || 0), 0);
  const totalVideos = galleries.reduce((acc, g) => acc + (g.videoCount || 0), 0);

  return (
    <div className="space-y-6 pb-12">
      {/* Studio Banner & Welcome */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-gradient-to-br from-zinc-50 via-white to-zinc-100 dark:from-zinc-900/80 dark:via-zinc-950 dark:to-zinc-900/40 p-6 sm:p-8 relative overflow-hidden shadow-xs">
        <div 
          className="absolute -right-16 -top-16 w-64 h-64 rounded-full blur-3xl opacity-20 pointer-events-none"
          style={{ backgroundColor: activeStudio.branding?.accentColor || '#c5a059' }}
        />
        
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span 
                className="w-2.5 h-2.5 rounded-full" 
                style={{ backgroundColor: activeStudio.branding?.accentColor || '#c5a059' }}
              />
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Studio Workspace • {activeStudio.plan.toUpperCase()} TIER
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-serif font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
              {activeStudio.name}
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 max-w-xl">
              Multi-tenant photography operations, proofs delivery, and client relationship management. 
              Protected with server-enforced role-based access control.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={onOpenCreateGallery}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors shadow-xs flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              New Gallery
            </button>
            <button
              onClick={onOpenCreateClient}
              className="px-4 py-2 rounded-xl text-xs font-semibold border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 transition-colors flex items-center gap-2"
            >
              <Users className="w-4 h-4" />
              Add Client
            </button>
            <button
              onClick={() => onNavigate('tasks')}
              className="px-4 py-2 rounded-xl text-xs font-semibold border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 transition-colors flex items-center gap-2"
            >
              <CheckSquare className="w-4 h-4" />
              Task Board
            </button>
          </div>
        </div>
      </div>

      {/* Storage Transparency Notice */}
      <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 dark:bg-amber-950/20 flex items-start gap-3.5">
        <Info className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-zinc-700 dark:text-zinc-300 space-y-1">
          <div className="font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
            Planned 10 GB Storage Quota • Zero-Billing Mode (Phase 3A)
            <Badge variant="amber" size="sm">Not Connected</Badge>
          </div>
          <p className="leading-relaxed">
            Every studio tenant in StudioCloud is provisioned with a planned <strong>10,000,000,000 bytes (10 GB decimal)</strong> quota allocation. 
            In Phase 3A, real cloud object storage is not connected to preserve zero-billing status; usage is not yet measured, and no storage figures are fabricated.
          </p>
        </div>
      </div>

      {/* Real Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Metric 1: Galleries */}
        <div 
          onClick={() => onNavigate('galleries')}
          className="p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all cursor-pointer group shadow-2xs"
        >
          <div className="flex items-center justify-between text-zinc-400 mb-3">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">Galleries</span>
            <Images className="w-4 h-4 group-hover:text-amber-500 transition-colors" />
          </div>
          <div className="text-2xl font-bold font-serif text-zinc-900 dark:text-zinc-100">
            {loading ? '—' : galleries.length}
          </div>
          <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400 flex items-center justify-between">
            <span>{publishedGalleries} Published</span>
            <span className="text-amber-600 dark:text-amber-400 flex items-center text-[11px] font-medium">
              View all <ArrowUpRight className="w-3 h-3 ml-0.5" />
            </span>
          </div>
        </div>

        {/* Metric 2: Production Tasks */}
        <div 
          onClick={() => onNavigate('tasks')}
          className="p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all cursor-pointer group shadow-2xs"
        >
          <div className="flex items-center justify-between text-zinc-400 mb-3">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">Tasks</span>
            <CheckSquare className="w-4 h-4 group-hover:text-amber-500 transition-colors" />
          </div>
          <div className="text-2xl font-bold font-serif text-zinc-900 dark:text-zinc-100">
            {loading ? '—' : tasks.filter(t => !t.isArchived).length}
          </div>
          <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400 flex items-center justify-between">
            <span>{tasks.filter(t => !t.isArchived && t.status === 'in_progress').length} In Progress</span>
            <span className="text-amber-600 dark:text-amber-400 flex items-center text-[11px] font-medium">
              Board <ArrowUpRight className="w-3 h-3 ml-0.5" />
            </span>
          </div>
        </div>

        {/* Metric 3: Clients */}
        <div 
          onClick={() => onNavigate('clients')}
          className="p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all cursor-pointer group shadow-2xs"
        >
          <div className="flex items-center justify-between text-zinc-400 mb-3">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">Clients</span>
            <Users className="w-4 h-4 group-hover:text-amber-500 transition-colors" />
          </div>
          <div className="text-2xl font-bold font-serif text-zinc-900 dark:text-zinc-100">
            {loading ? '—' : clients.filter(c => !c.isArchived).length}
          </div>
          <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400 flex items-center justify-between">
            <span>Active Roster</span>
            <span className="text-amber-600 dark:text-amber-400 flex items-center text-[11px] font-medium">
              CRM <ArrowUpRight className="w-3 h-3 ml-0.5" />
            </span>
          </div>
        </div>

        {/* Metric 4: Team */}
        <div 
          onClick={() => onNavigate('team')}
          className="p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all cursor-pointer group shadow-2xs"
        >
          <div className="flex items-center justify-between text-zinc-400 mb-3">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">Studio Team</span>
            <UserCheck className="w-4 h-4 group-hover:text-amber-500 transition-colors" />
          </div>
          <div className="text-2xl font-bold font-serif text-zinc-900 dark:text-zinc-100">
            {loading ? '—' : members.length}
          </div>
          <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400 flex items-center justify-between">
            <span>Staff & Photographers</span>
            <span className="text-amber-600 dark:text-amber-400 flex items-center text-[11px] font-medium">
              Manage <ArrowUpRight className="w-3 h-3 ml-0.5" />
            </span>
          </div>
        </div>

        {/* Metric 5: Storage */}
        <div 
          onClick={() => onNavigate('storage')}
          className="p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all cursor-pointer group shadow-2xs"
        >
          <div className="flex items-center justify-between text-zinc-400 mb-3">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">Storage Allocation</span>
            <HardDrive className="w-4 h-4 group-hover:text-amber-500 transition-colors" />
          </div>
          <div className="text-2xl font-bold font-serif text-zinc-900 dark:text-zinc-100">
            10 GB
          </div>
          <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400 flex items-center justify-between">
            <span>Not yet measured</span>
            <span className="font-mono text-[11px] text-zinc-400 font-medium">Not Connected</span>
          </div>
        </div>
      </div>

      {/* Main Content Grid: Recent Galleries & Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Galleries List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Recent Collections & Proofs
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Galleries stored in studio tenant database
              </p>
            </div>
            <button
              onClick={() => onNavigate('galleries')}
              className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1"
            >
              All Galleries <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {galleries.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-800 p-8 text-center space-y-3 bg-zinc-50/50 dark:bg-zinc-900/30">
              <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-400 mx-auto flex items-center justify-center">
                <Images className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                  No Photography Galleries Yet
                </div>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                  Create your first client gallery to start proofing, sharing, and delivering high-res photos.
                </p>
              </div>
              <button
                onClick={onOpenCreateGallery}
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 hover:bg-zinc-800 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Create First Gallery
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {galleries.slice(0, 4).map((gallery) => (
                <div
                  key={gallery.id}
                  className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors shadow-2xs"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-14 h-14 rounded-lg bg-zinc-100 dark:bg-zinc-800 overflow-hidden flex-shrink-0 border border-zinc-200 dark:border-zinc-800">
                      {gallery.coverImageUrl ? (
                        <img 
                          src={gallery.coverImageUrl} 
                          alt={gallery.title} 
                          className="w-full h-full object-cover" 
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-400">
                          <Images className="w-5 h-5" />
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
                        {gallery.title}
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-2 mt-0.5">
                        <span>{gallery.clientName || 'General Client'}</span>
                        <span>•</span>
                        <span>{gallery.photoCount} assets</span>
                        <span>•</span>
                        <span>{formatBytes(gallery.storageBytes)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <Badge variant={
                      gallery.status === 'published' ? 'emerald' :
                      gallery.status === 'in_review' ? 'amber' :
                      gallery.status === 'archived' ? 'zinc' : 'slate'
                    }>
                      {gallery.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Real-time Audit Trail Activity Feed */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Clock className="w-4 h-4 text-zinc-400" />
                Audit Trail
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Real studio event logs
              </p>
            </div>
            <button
              onClick={() => onNavigate('activity')}
              className="text-xs font-semibold text-amber-500 hover:text-amber-400 flex items-center gap-1 transition-colors"
            >
              <span>View All</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3.5 shadow-2xs">
            {activityLogs.length === 0 ? (
              <div className="text-center py-8 text-xs text-zinc-400">
                No recent activity recorded yet.
              </div>
            ) : (
              activityLogs.map((log) => (
                <div key={log.id} className="flex items-start gap-3 text-xs pb-3 border-b border-zinc-100 dark:border-zinc-800/80 last:border-0 last:pb-0">
                  <div className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 flex-shrink-0" />
                  <div className="space-y-0.5 flex-1 min-w-0">
                    <div className="font-medium text-zinc-800 dark:text-zinc-200 truncate">
                      {log.action}
                    </div>
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                      {log.targetType}: <span className="text-zinc-700 dark:text-zinc-300 font-medium">{log.targetName}</span>
                    </div>
                    <div className="text-[10px] text-zinc-400 font-mono">
                      {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {log.userEmail.split('@')[0]}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

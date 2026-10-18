import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { DashboardModule } from './components/modules/DashboardModule';
import { GalleriesModule } from './components/modules/GalleriesModule';
import { GalleryTemplatesModule } from './components/modules/GalleryTemplatesModule';
import { ClientsModule } from './components/modules/ClientsModule';
import { TaskBoardModule } from './components/modules/TaskBoardModule';
import { TeamModule } from './components/modules/TeamModule';
import { StorageModule } from './components/modules/StorageModule';
import { BrandingModule } from './components/modules/BrandingModule';
import { SettingsModule } from './components/modules/SettingsModule';
import { NotificationsActivityModule } from './components/modules/NotificationsActivityModule';
import { SuperAdminModule } from './components/modules/SuperAdminModule';
import { NewStudioModal } from './components/modals/NewStudioModal';
import { AuthScreen } from './components/auth/AuthScreen';
import { ClientGalleryView } from './components/client/ClientGalleryView';
import { Studio } from './types';
import { 
  Building2, 
  Plus, 
  LogOut, 
  AlertTriangle, 
  RefreshCw, 
  ShieldCheck, 
  UserX,
  Sparkles
} from 'lucide-react';

function MainApp() {
  const { 
    user, 
    isLoading, 
    setActiveStudio, 
    activeStudio, 
    isSuperAdmin, 
    userStudios, 
    authError, 
    retryAuth, 
    reloadStudios, 
    signOut 
  } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [newStudioModalOpen, setNewStudioModalOpen] = useState(false);
  const [showLongLoadingNotice, setShowLongLoadingNotice] = useState(false);

  // Client Gallery Sharing Direct Access State from URL query params
  const [clientGalleryRoute, setClientGalleryRoute] = useState<{
    galleryId: string;
    studioId: string;
    shareToken: string | null;
  } | null>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const view = params.get('view');
      const galleryId = params.get('id');
      const studioId = params.get('studio');
      const token = params.get('token');
      if (view === 'gallery' && galleryId && studioId) {
        return {
          galleryId,
          studioId,
          shareToken: token,
        };
      }
    }
    return null;
  });

  // If visiting a shared client gallery link directly, render client view without studio staff dashboard login requirement
  if (clientGalleryRoute) {
    return (
      <ClientGalleryView
        galleryId={clientGalleryRoute.galleryId}
        studioId={clientGalleryRoute.studioId}
        shareToken={clientGalleryRoute.shareToken}
        onBackToStudio={() => {
          // Remove query params to return to main studio app
          if (typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            url.search = '';
            window.history.pushState({}, '', url.toString());
          }
          setClientGalleryRoute(null);
        }}
        isStudioPreview={false}
      />
    );
  }

  // Monitor loading duration to provide graceful escape if network/Firestore takes time
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (isLoading) {
      setShowLongLoadingNotice(false);
      timer = setTimeout(() => {
        setShowLongLoadingNotice(true);
      }, 3500);
    } else {
      setShowLongLoadingNotice(false);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isLoading]);

  // Default to superadmin tab if user is platform administrator without a selected studio
  useEffect(() => {
    if (isSuperAdmin && !activeStudio) {
      setActiveTab('superadmin');
    }
  }, [isSuperAdmin, activeStudio]);

  // 1. Loading State Screen with Graceful Fallback
  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-white text-center">
        <div className="w-12 h-12 border-2 border-amber-500/20 border-t-amber-500 rounded-full animate-spin mb-4" />
        <div className="font-serif font-bold text-xl tracking-tight">StudioCloud</div>
        <p className="text-xs text-zinc-400 font-mono mt-1">Authenticating session & tenant boundaries...</p>

        {showLongLoadingNotice && (
          <div className="mt-6 max-w-sm p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-3 animate-in fade-in">
            <p className="text-xs text-zinc-400 leading-relaxed">
              Verifying Firestore tenant partition is taking longer than expected.
            </p>
            <div className="flex items-center justify-center gap-2 pt-1">
              <button
                onClick={() => retryAuth()}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-white flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Retry
              </button>
              <button
                onClick={() => signOut()}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-400 hover:text-white flex items-center gap-1.5 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" /> Sign Out
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 2. Authentication or Tenant Error Screen
  if (authError && !activeStudio && !isSuperAdmin) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col justify-between p-6 sm:p-12 font-sans">
        <div className="flex items-center justify-between max-w-5xl mx-auto w-full">
          <div className="font-serif font-bold text-xl tracking-tight text-white">
            StudioCloud
          </div>
          <button
            onClick={() => signOut()}
            className="text-xs text-zinc-400 hover:text-white flex items-center gap-1.5 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign Out
          </button>
        </div>

        <div className="max-w-md mx-auto text-center space-y-5 my-auto animate-in fade-in">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20 mx-auto flex items-center justify-center">
            <AlertTriangle className="w-7 h-7" />
          </div>

          <div className="space-y-2">
            <h1 className="text-xl sm:text-2xl font-serif font-bold text-white tracking-tight">
              {authError.title}
            </h1>
            <p className="text-xs text-zinc-400 leading-relaxed">
              {authError.message}
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => retryAuth()}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-semibold text-zinc-950 bg-amber-400 hover:bg-amber-300 transition-colors shadow-xs flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" /> Retry Connection
            </button>
            <button
              onClick={() => signOut()}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 flex items-center justify-center gap-2 transition-colors"
            >
              <LogOut className="w-4 h-4" /> Sign Out
            </button>
          </div>
        </div>

        <div className="text-[11px] text-center text-zinc-500 font-mono">
          Tenant Isolation Guard Active • Error Code: {authError.code || 'SESSION_ERR'}
        </div>
      </div>
    );
  }

  // 3. Protected route enforcement: unauthenticated users cannot access dashboards
  if (!user) {
    return <AuthScreen />;
  }

  const handleInspectStudio = (studio: Studio) => {
    setActiveStudio(studio);
    setActiveTab('overview');
  };

  // 4. No studio membership screen: authenticated user with no active studio tenant
  if (!activeStudio && !isSuperAdmin) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col justify-between p-6 sm:p-12 font-sans">
        <div className="flex items-center justify-between max-w-5xl mx-auto w-full">
          <div className="font-serif font-bold text-xl tracking-tight text-white flex items-center gap-2">
            StudioCloud
            <span className="text-[10px] font-sans font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">
              Tenant Guard
            </span>
          </div>
          <button
            onClick={() => signOut()}
            className="text-xs text-zinc-400 hover:text-white flex items-center gap-1.5 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign Out
          </button>
        </div>

        <div className="max-w-md mx-auto text-center space-y-6 my-auto animate-in fade-in">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20 mx-auto flex items-center justify-center">
            <Building2 className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-serif font-bold text-white tracking-tight">
              No Studio Membership Found
            </h1>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Signed in as <span className="text-white font-medium">{user.displayName || user.email}</span> ({user.email}). 
              You are authenticated, but not currently assigned to an authorized photography studio tenant.
            </p>

            <div className="p-3 rounded-xl border border-zinc-800 bg-zinc-900/60 font-mono text-[11px] text-zinc-400 flex items-center justify-between gap-2 text-left">
              <div className="truncate">
                <span className="text-zinc-500">Your Account UID:</span> <span className="text-zinc-200 select-all">{user.uid}</span>
              </div>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(user.uid)}
                className="px-2.5 py-1 text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg border border-zinc-700 transition-colors flex-shrink-0"
              >
                Copy UID
              </button>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <button
              onClick={() => setNewStudioModalOpen(true)}
              className="w-full py-3 px-4 rounded-xl text-xs font-semibold text-zinc-950 bg-amber-400 hover:bg-amber-300 transition-colors shadow-xs flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Register Your Photography Studio (10 GB Decimal Included)
            </button>

            <button
              onClick={() => reloadStudios()}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-zinc-900 hover:bg-zinc-850 text-zinc-300 border border-zinc-800 transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Check Membership Again
            </button>
          </div>

          <div className="p-3.5 rounded-xl border border-zinc-800/80 bg-zinc-900/40 text-[11px] text-zinc-400 leading-relaxed text-left flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div>
              <strong className="text-zinc-200">Team Membership Note:</strong> If an owner recently added your email to their studio roster, click <em>Check Membership Again</em> to verify team clearance.
            </div>
          </div>
        </div>

        <div className="text-[11px] text-center text-zinc-500 font-mono">
          Tenant Isolation Guard Active • 10,000,000,000 Bytes Decimal Allocation
        </div>

        <NewStudioModal
          isOpen={newStudioModalOpen}
          onClose={() => setNewStudioModalOpen(false)}
        />
      </div>
    );
  }

  // 5. Authorized Studio Workspace
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col font-sans transition-colors">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenNewStudioModal={() => setNewStudioModalOpen(true)}
        onToggleMobileSidebar={() => setMobileSidebarOpen(!mobileSidebarOpen)}
      />

      <div className="flex-1 flex max-w-7xl w-full mx-auto">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 min-w-0 overflow-y-auto">
          {activeTab === 'overview' && (
            <DashboardModule
              onNavigate={(tab) => setActiveTab(tab)}
              onOpenCreateGallery={() => setActiveTab('galleries')}
              onOpenCreateClient={() => setActiveTab('clients')}
            />
          )}

          {activeTab === 'galleries' && <GalleriesModule />}

          {activeTab === 'templates' && (
            <GalleryTemplatesModule onNavigateToGalleries={() => setActiveTab('galleries')} />
          )}

          {activeTab === 'clients' && <ClientsModule />}

          {activeTab === 'tasks' && <TaskBoardModule />}

          {activeTab === 'activity' && (
            <NotificationsActivityModule onNavigate={(tab) => setActiveTab(tab)} />
          )}

          {activeTab === 'team' && <TeamModule />}

          {activeTab === 'storage' && <StorageModule />}

          {activeTab === 'branding' && <BrandingModule />}

          {activeTab === 'settings' && (
            <SettingsModule onNavigate={(tab) => setActiveTab(tab)} />
          )}

          {activeTab === 'superadmin' && (
            <SuperAdminModule onInspectStudio={handleInspectStudio} />
          )}
        </main>
      </div>

      <NewStudioModal
        isOpen={newStudioModalOpen}
        onClose={() => setNewStudioModalOpen(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}


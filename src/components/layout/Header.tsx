import React, { useState } from 'react';
import { 
  Camera, 
  ChevronDown, 
  Plus, 
  Sun, 
  Moon, 
  ShieldCheck, 
  LogOut, 
  Building2, 
  Check, 
  HardDrive,
  Menu,
  Sparkles,
  Bell,
  ExternalLink,
  CheckCheck
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { formatBytes } from '../../services/studioService';
import { 
  getNotifications, 
  markNotificationAsRead, 
  markAllNotificationsAsRead 
} from '../../services/notificationService';
import { AppNotification } from '../../types';

interface HeaderProps {
  onOpenNewStudioModal: () => void;
  onToggleMobileSidebar: () => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ 
  onOpenNewStudioModal,
  onToggleMobileSidebar,
  activeTab,
  setActiveTab
}) => {
  const { 
    user, 
    activeStudio, 
    activeRole,
    userStudios, 
    setActiveStudio, 
    theme, 
    toggleTheme, 
    isSuperAdmin, 
    signOut
  } = useAuth();
  const [studioDropdownOpen, setStudioDropdownOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  React.useEffect(() => {
    if (!activeStudio?.id) return;
    let isMounted = true;
    getNotifications(activeStudio.id, 10, false).then((data) => {
      if (isMounted) setNotifications(data);
    }).catch(() => null);
    return () => { isMounted = false; };
  }, [activeStudio?.id, notifDropdownOpen]);

  const unreadCount = notifications.filter((n) => !n.isRead && !n.isArchived).length;

  const usedBytes = activeStudio?.storageUsedBytes || 0;
  const allocBytes = activeStudio?.storageAllocationBytes || 10737418240;
  const usedPercent = Math.min(100, (usedBytes / allocBytes) * 100);

  return (
    <header className="sticky top-0 z-30 h-16 border-b border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between transition-colors">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleMobileSidebar}
          className="lg:hidden p-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
          title="Toggle Navigation"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Studio Switcher Dropdown */}
        <div className="relative">
          <button
            onClick={() => setStudioDropdownOpen(!studioDropdownOpen)}
            className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-zinc-50/90 dark:bg-zinc-900/90 hover:bg-zinc-100/90 dark:hover:bg-zinc-850/90 text-left transition-all shadow-2xs"
            aria-expanded={studioDropdownOpen}
            aria-haspopup="true"
          >
            <div 
              className="w-6.5 h-6.5 rounded-lg flex items-center justify-center text-xs font-bold text-white shadow-xs shrink-0 ring-1 ring-black/10 dark:ring-white/10"
              style={{ backgroundColor: activeStudio?.branding?.accentColor || '#c5a059' }}
            >
              {activeStudio?.name?.charAt(0) || 'S'}
            </div>
            <div className="hidden sm:block">
              <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 leading-tight flex items-center gap-1.5">
                <span className="truncate max-w-[140px] md:max-w-[190px]">
                  {activeStudio?.name || 'StudioCloud'}
                </span>
                {activeStudio?.status === 'suspended' ? (
                  <span className="text-[10px] px-1.5 py-0.5 bg-rose-500/15 text-rose-500 dark:text-rose-400 border border-rose-500/30 rounded font-mono font-medium leading-none">
                    Suspended
                  </span>
                ) : activeStudio?.subscription?.planName ? (
                  <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded font-medium leading-none capitalize">
                    {activeStudio.subscription.planName}
                  </span>
                ) : activeStudio?.plan ? (
                  <span className="text-[10px] px-1.5 py-0.5 bg-zinc-200/70 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-300 dark:border-zinc-700 rounded font-medium leading-none capitalize">
                    {activeStudio.plan}
                  </span>
                ) : null}
              </div>
              <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono">
                {activeStudio ? `@${activeStudio.slug}` : 'No Studio Selected'}
              </div>
            </div>
            <ChevronDown className={`w-4 h-4 text-zinc-400 ml-0.5 transition-transform duration-200 ${studioDropdownOpen ? 'rotate-180 text-zinc-700 dark:text-zinc-200' : ''}`} />
          </button>

          {studioDropdownOpen && (
            <>
              {/* Dismiss backdrop overlay */}
              <div 
                className="fixed inset-0 z-40 bg-transparent" 
                onClick={() => setStudioDropdownOpen(false)} 
              />
              <div 
                className="absolute left-0 mt-2 w-72 sm:w-80 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl py-2 z-50 animate-in fade-in slide-in-from-top-2 overflow-hidden"
              >
                <div className="px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800/80 mb-1">
                  <span>Tenant Studios</span>
                  <span className="text-[10px] font-mono normal-case text-zinc-400">
                    {((activeStudio && !userStudios.some(s => s.id === activeStudio.id)) ? [activeStudio, ...userStudios] : userStudios).length} Available
                  </span>
                </div>

                <div className="max-h-64 overflow-y-auto px-1 space-y-0.5">
                  {((activeStudio && !userStudios.some(s => s.id === activeStudio.id)) ? [activeStudio, ...userStudios] : userStudios).length === 0 ? (
                    <div className="px-3 py-4 text-center text-xs text-zinc-400">
                      No photography studios registered yet.
                    </div>
                  ) : (
                    ((activeStudio && !userStudios.some(s => s.id === activeStudio.id)) ? [activeStudio, ...userStudios] : userStudios).map((studio) => {
                      const isSelected = activeStudio?.id === studio.id;
                      return (
                        <button
                          key={studio.id}
                          onClick={() => {
                            setActiveStudio(studio);
                            setStudioDropdownOpen(false);
                          }}
                          className={`w-full px-3 py-2 text-left rounded-xl flex items-center justify-between transition-colors ${
                            isSelected 
                              ? 'bg-amber-500/10 text-amber-900 dark:text-amber-200' 
                              : 'hover:bg-zinc-100 dark:hover:bg-zinc-800/80 text-zinc-800 dark:text-zinc-200'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span 
                              className="w-3.5 h-3.5 rounded-md shrink-0 ring-1 ring-black/10 dark:ring-white/10"
                              style={{ backgroundColor: studio.branding?.accentColor || '#c5a059' }}
                            />
                            <div className="min-w-0">
                              <div className="text-xs font-medium truncate flex items-center gap-1.5">
                                <span className="truncate">{studio.name}</span>
                                {studio.status === 'suspended' && (
                                  <span className="text-[9px] px-1 py-0.5 bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded font-mono shrink-0 leading-none">
                                    Suspended
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-zinc-400 font-mono truncate">
                                @{studio.slug}
                              </div>
                            </div>
                          </div>
                          {isSelected && (
                            <Check className="w-4 h-4 text-amber-500 shrink-0 ml-2" />
                          )}
                        </button>
                      );
                    })
                  )}
                </div>

                <div className="mt-1 pt-1 border-t border-zinc-100 dark:border-zinc-800 px-1">
                  <button
                    onClick={() => {
                      setStudioDropdownOpen(false);
                      onOpenNewStudioModal();
                    }}
                    className="w-full px-3 py-2 text-left text-xs font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 rounded-xl flex items-center gap-2 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Register New Studio
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Quota indicator */}
        <div 
          onClick={() => setActiveTab('storage')}
          className="flex items-center gap-2 px-3 py-1.5 h-[38px] bg-zinc-100/90 hover:bg-zinc-200/80 dark:bg-zinc-900/90 dark:hover:bg-zinc-850/90 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-amber-500/40 text-xs cursor-pointer transition-all shadow-2xs select-none"
          title="Click to view full storage analytics and tier options"
        >
          <HardDrive className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" />
          <span className="text-xs text-zinc-700 dark:text-zinc-200 font-medium whitespace-nowrap">
            {formatBytes(usedBytes)} <span className="text-zinc-400 dark:text-zinc-500 font-normal">/ {formatBytes(allocBytes)}</span>
          </span>
          <div className="w-12 h-1.5 bg-zinc-200 dark:bg-zinc-750 rounded-full overflow-hidden shrink-0">
            <div 
              className={`h-full rounded-full transition-all duration-300 ${usedPercent > 80 ? 'bg-rose-500' : 'bg-amber-500'}`} 
              style={{ width: `${Math.max(4, Math.min(100, usedPercent))}%` }} 
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        {/* Super admin shortcut badge */}
        {isSuperAdmin && (
          <button
            onClick={() => setActiveTab('superadmin')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
              activeTab === 'superadmin'
                ? 'bg-purple-600 text-white border-purple-500 shadow-sm'
                : 'bg-purple-500/10 text-purple-600 dark:text-purple-300 border-purple-500/30 hover:bg-purple-500/20'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Super Admin</span>
          </button>
        )}

        {/* In-App Notifications Bell Dropdown */}
        <div className="relative">
          <button
            onClick={() => setNotifDropdownOpen(!notifDropdownOpen)}
            className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors relative"
            title="Notifications & Alerts"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-amber-500 text-zinc-950 font-bold text-[10px] flex items-center justify-center shadow-xs">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {notifDropdownOpen && (
            <div 
              className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl py-3 z-50 animate-in fade-in slide-in-from-top-2"
              onMouseLeave={() => setNotifDropdownOpen(false)}
            >
              <div className="px-4 pb-2.5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold font-serif text-zinc-900 dark:text-zinc-100">
                    Studio Notifications
                  </span>
                  {unreadCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                      {unreadCount} unread
                    </span>
                  )}
                </div>

                {unreadCount > 0 && (
                  <button
                    onClick={async () => {
                      if (activeStudio?.id) {
                        await markAllNotificationsAsRead(activeStudio.id);
                        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
                      }
                    }}
                    className="text-[11px] font-medium text-amber-500 hover:text-amber-400 flex items-center gap-1"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    Mark all read
                  </button>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800/80">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-xs text-zinc-400 space-y-1">
                    <Bell className="w-5 h-5 mx-auto text-zinc-300 dark:text-zinc-700 mb-1.5" />
                    <p className="font-medium text-zinc-700 dark:text-zinc-300">No notifications</p>
                    <p className="text-[11px]">Real alerts will appear here as galleries and tasks update.</p>
                  </div>
                ) : (
                  notifications.slice(0, 5).map((n) => (
                    <div 
                      key={n.id}
                      onClick={() => {
                        if (!n.isRead && activeStudio?.id) {
                          markNotificationAsRead(activeStudio.id, n.id).catch(() => null);
                          setNotifications((prev) => prev.map((item) => item.id === n.id ? { ...item, isRead: true } : item));
                        }
                        setNotifDropdownOpen(false);
                        if (n.linkTab) {
                          setActiveTab(n.linkTab);
                        } else {
                          setActiveTab('activity');
                        }
                      }}
                      className={`p-3.5 text-xs cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors flex items-start gap-3 ${
                        !n.isRead ? 'bg-amber-500/5 dark:bg-amber-950/10' : ''
                      }`}
                    >
                      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                        !n.isRead ? 'bg-amber-500' : 'bg-transparent'
                      }`} />
                      <div className="space-y-0.5 flex-1 min-w-0">
                        <div className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                          {n.title}
                        </div>
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2">
                          {n.message}
                        </div>
                        <div className="text-[10px] text-zinc-400 font-mono pt-0.5">
                          {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="pt-2 px-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                <button
                  onClick={() => {
                    setNotifDropdownOpen(false);
                    setActiveTab('activity');
                  }}
                  className="w-full py-1.5 text-center text-xs font-semibold text-amber-500 hover:text-amber-400 hover:bg-amber-500/5 rounded-xl transition-colors flex items-center justify-center gap-1.5"
                >
                  <span>Open Full Activity Center</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Theme Toggle (Darkroom Noir vs Gallery White) */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          title={theme === 'dark' ? 'Switch to Gallery White (Light)' : 'Switch to Darkroom Noir (Dark)'}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-zinc-600" />}
        </button>

        {/* Persona quick-switch test helper for reviewer */}
        <div className="relative">
          <button
            onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
            className="flex items-center gap-2 p-1 pl-2 rounded-full border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-left transition-all"
          >
            <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 max-w-[120px] truncate hidden sm:inline">
              {user?.displayName || user?.email?.split('@')[0] || 'Studio User'}
            </span>
            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-amber-600 to-amber-400 text-white flex items-center justify-center text-xs font-semibold shadow-xs">
              {(user?.displayName || user?.email || 'U').charAt(0).toUpperCase()}
            </div>
          </button>

          {profileDropdownOpen && (
            <div 
              className="absolute right-0 mt-2 w-72 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xl py-2 z-50 animate-in fade-in slide-in-from-top-2"
              onMouseLeave={() => setProfileDropdownOpen(false)}
            >
              <div className="px-4 py-2 border-b border-zinc-100 dark:border-zinc-800">
                <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  {user?.displayName || 'Studio Member'}
                </div>
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                  {user?.email || ''}
                </div>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium capitalize">
                    {isSuperAdmin 
                      ? 'Platform Super Administrator' 
                      : activeRole === 'owner' || activeStudio?.ownerId === user?.uid
                      ? 'Studio Owner' 
                      : activeRole
                      ? activeRole.replace(/_/g, ' ')
                      : 'Studio Team Member'}
                  </span>
                </div>
              </div>

              <div className="px-4 py-2 bg-zinc-50 dark:bg-zinc-950/60 border-b border-zinc-100 dark:border-zinc-800 text-[11px] text-zinc-500 space-y-1">
                <div>Studio: <span className="font-semibold text-zinc-700 dark:text-zinc-300">{activeStudio?.name || 'None'}</span></div>
                <div>Tenant Slug: <span className="font-mono text-zinc-600 dark:text-zinc-400">@{activeStudio?.slug || 'none'}</span></div>
              </div>

              <button
                onClick={() => {
                  setProfileDropdownOpen(false);
                  signOut();
                }}
                className="w-full px-4 py-2 text-left text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 flex items-center gap-2 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

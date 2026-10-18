import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Bell, 
  Check, 
  CheckCheck, 
  Archive, 
  Trash2, 
  Filter, 
  Search, 
  Clock, 
  User, 
  Images, 
  Users, 
  CheckSquare, 
  DollarSign, 
  ShieldAlert, 
  ShieldCheck, 
  Sliders, 
  Layers, 
  ExternalLink, 
  RotateCcw, 
  AlertCircle, 
  Info, 
  Sparkles,
  Mail,
  Smartphone,
  Eye,
  CheckCircle2,
  Calendar,
  Lock,
  X
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { 
  AppNotification, 
  NotificationCategory, 
  ActivityLog, 
  UserNotificationPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES 
} from '../../types';
import { 
  getNotifications, 
  markNotificationAsRead, 
  markAllNotificationsAsRead, 
  archiveNotification, 
  deleteNotification,
  getUserNotificationPreferences,
  saveUserNotificationPreferences
} from '../../services/notificationService';
import { getActivityLogs } from '../../services/studioService';
import { Badge } from '../common/Badge';

interface NotificationsActivityModuleProps {
  onNavigate?: (tab: string, relatedId?: string) => void;
}

export const NotificationsActivityModule: React.FC<NotificationsActivityModuleProps> = ({ 
  onNavigate 
}) => {
  const { user, activeStudio, isSuperAdmin } = useAuth();

  // Navigation Sub-Tabs
  const [activeTab, setActiveTab] = useState<'notifications' | 'activity' | 'preferences'>('notifications');

  // Notifications State
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<'all' | NotificationCategory>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unread' | 'read' | 'archived'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Activity Log State
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(true);
  const [activityTargetFilter, setActivityTargetFilter] = useState<string>('all');
  const [activitySearchQuery, setActivitySearchQuery] = useState('');

  // Preferences State
  const [preferences, setPreferences] = useState<UserNotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const [loadingPreferences, setLoadingPreferences] = useState(true);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [prefSaveSuccess, setPrefSaveSuccess] = useState(false);

  // Load Notifications
  const loadNotificationsData = useCallback(async () => {
    if (!activeStudio) return;
    setLoadingNotifications(true);
    try {
      const data = await getNotifications(activeStudio.id, 100, true);
      setNotifications(data);
    } catch (err: any) {
      console.warn('Error loading notifications:', err);
    } finally {
      setLoadingNotifications(false);
    }
  }, [activeStudio?.id]);

  // Load Activity Logs
  const loadActivityData = useCallback(async () => {
    if (!activeStudio) return;
    setLoadingActivity(true);
    try {
      const data = await getActivityLogs(activeStudio.id, 100);
      setActivityLogs(data);
    } catch (err: any) {
      console.warn('Error loading activity logs:', err);
    } finally {
      setLoadingActivity(false);
    }
  }, [activeStudio?.id]);

  // Load User Preferences
  const loadPreferencesData = useCallback(async () => {
    if (!user) return;
    setLoadingPreferences(true);
    try {
      const data = await getUserNotificationPreferences(user.uid);
      setPreferences(data);
    } catch (err: any) {
      console.warn('Error loading preferences:', err);
    } finally {
      setLoadingPreferences(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    loadNotificationsData();
    loadActivityData();
    loadPreferencesData();
  }, [loadNotificationsData, loadActivityData, loadPreferencesData]);

  // Count Unread
  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !n.isRead && !n.isArchived).length;
  }, [notifications]);

  // Filtered Notifications
  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      // Status filter
      if (statusFilter === 'unread' && (n.isRead || n.isArchived)) return false;
      if (statusFilter === 'read' && (!n.isRead || n.isArchived)) return false;
      if (statusFilter === 'archived' && !n.isArchived) return false;
      if (statusFilter === 'all' && n.isArchived) return false; // Default hides archived

      // Category filter
      if (categoryFilter !== 'all' && n.category !== categoryFilter) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesTitle = n.title.toLowerCase().includes(q);
        const matchesMessage = n.message.toLowerCase().includes(q);
        const matchesActor = n.actorName?.toLowerCase().includes(q) || false;
        if (!matchesTitle && !matchesMessage && !matchesActor) return false;
      }

      return true;
    });
  }, [notifications, statusFilter, categoryFilter, searchQuery]);

  // Filtered Activity Logs
  const filteredActivityLogs = useMemo(() => {
    return activityLogs.filter((log) => {
      if (activityTargetFilter !== 'all' && log.targetType !== activityTargetFilter) {
        return false;
      }
      if (activitySearchQuery.trim()) {
        const q = activitySearchQuery.toLowerCase().trim();
        const matchesAction = log.action.toLowerCase().includes(q);
        const matchesTarget = log.targetName.toLowerCase().includes(q);
        const matchesUser = log.userEmail.toLowerCase().includes(q);
        if (!matchesAction && !matchesTarget && !matchesUser) return false;
      }
      return true;
    });
  }, [activityLogs, activityTargetFilter, activitySearchQuery]);

  // Handle Mark Single Notification Read/Unread
  const handleToggleRead = async (notification: AppNotification) => {
    if (!activeStudio) return;
    try {
      const nextReadState = !notification.isRead;
      if (nextReadState) {
        await markNotificationAsRead(activeStudio.id, notification.id);
      } else {
        // Revert to unread
        const { updateDoc, doc } = await import('firebase/firestore');
        const { db } = await import('../../firebase/config');
        await updateDoc(doc(db, 'studios', activeStudio.id, 'notifications', notification.id), {
          isRead: false,
          readAt: null,
        });
      }

      setNotifications((prev) =>
        prev.map((item) =>
          item.id === notification.id ? { ...item, isRead: nextReadState } : item
        )
      );
    } catch (err: any) {
      setActionError('Could not update notification read status.');
    }
  };

  // Handle Mark All As Read
  const handleMarkAllRead = async () => {
    if (!activeStudio) return;
    try {
      await markAllNotificationsAsRead(activeStudio.id);
      setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })));
      setActionSuccess('All notifications marked as read.');
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err: any) {
      setActionError('Failed to mark all as read.');
    }
  };

  // Handle Archive Notification
  const handleArchive = async (notificationId: string, currentArchived: boolean = false) => {
    if (!activeStudio) return;
    try {
      await archiveNotification(activeStudio.id, notificationId, !currentArchived);
      setNotifications((prev) =>
        prev.map((item) =>
          item.id === notificationId ? { ...item, isArchived: !currentArchived } : item
        )
      );
    } catch (err: any) {
      setActionError('Failed to archive notification.');
    }
  };

  // Handle Delete Notification
  const handleDelete = async (notificationId: string) => {
    if (!activeStudio) return;
    try {
      await deleteNotification(activeStudio.id, notificationId);
      setNotifications((prev) => prev.filter((item) => item.id !== notificationId));
    } catch (err: any) {
      setActionError('Failed to remove notification.');
    }
  };

  // Handle Preferences Save
  const handleTogglePreference = async (key: keyof UserNotificationPreferences) => {
    if (!user) return;
    const nextPrefs = {
      ...preferences,
      [key]: !preferences[key],
    };
    setPreferences(nextPrefs);
    setSavingPreferences(true);
    try {
      await saveUserNotificationPreferences(user.uid, nextPrefs);
      setPrefSaveSuccess(true);
      setTimeout(() => setPrefSaveSuccess(false), 2500);
    } catch (err: any) {
      setActionError('Failed to persist notification preferences.');
    } finally {
      setSavingPreferences(false);
    }
  };

  // Navigate to Related Record
  const handleNavigateToRecord = (notification: AppNotification) => {
    // Automatically mark read when clicking through
    if (!notification.isRead && activeStudio) {
      markNotificationAsRead(activeStudio.id, notification.id).catch(() => null);
      setNotifications((prev) =>
        prev.map((item) => (item.id === notification.id ? { ...item, isRead: true } : item))
      );
    }

    if (notification.linkTab && onNavigate) {
      onNavigate(notification.linkTab, notification.relatedId);
    }
  };

  const getCategoryIcon = (category: NotificationCategory) => {
    switch (category) {
      case 'gallery':
        return <Images className="w-4 h-4 text-amber-500" />;
      case 'client':
        return <Users className="w-4 h-4 text-blue-500" />;
      case 'task':
        return <CheckSquare className="w-4 h-4 text-emerald-500" />;
      case 'payment':
        return <DollarSign className="w-4 h-4 text-purple-500" />;
      case 'system':
      default:
        return <ShieldCheck className="w-4 h-4 text-zinc-400" />;
    }
  };

  const getCategoryBadgeVariant = (category: NotificationCategory): 'gold' | 'blue' | 'emerald' | 'amber' | 'slate' => {
    switch (category) {
      case 'gallery': return 'gold';
      case 'client': return 'blue';
      case 'task': return 'emerald';
      case 'payment': return 'amber';
      case 'system':
      default: return 'slate';
    }
  };

  return (
    <div className="space-y-6 pb-16 max-w-6xl">
      {/* Top Header & Overview */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-serif font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
              Notifications & Activity Center
            </h1>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500 text-zinc-950 shadow-2xs">
                {unreadCount} Unread
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Real-time studio alerts, immutable audit event history, and personalized alert preferences for {activeStudio?.name || 'StudioCloud'}.
          </p>
        </div>

        {/* Global Bulk Actions */}
        {activeTab === 'notifications' && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleMarkAllRead}
              disabled={unreadCount === 0}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 disabled:opacity-50 transition-colors flex items-center gap-1.5 shadow-2xs"
            >
              <CheckCheck className="w-4 h-4 text-amber-500" />
              Mark All as Read
            </button>
            <button
              onClick={loadNotificationsData}
              className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
              title="Refresh notifications"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        )}

        {activeTab === 'activity' && (
          <button
            onClick={loadActivityData}
            className="px-3 py-2 rounded-xl text-xs font-semibold border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors flex items-center gap-1.5 shadow-2xs"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Refresh Audit Logs
          </button>
        )}
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-2 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveTab('notifications')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'notifications'
              ? 'bg-amber-500 text-zinc-950 font-bold shadow-2xs'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white bg-zinc-100 dark:bg-zinc-850/60'
          }`}
        >
          <Bell className="w-4 h-4" />
          In-App Notifications
          {unreadCount > 0 && (
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
              activeTab === 'notifications' ? 'bg-zinc-950 text-amber-400' : 'bg-amber-500 text-zinc-950'
            }`}>
              {unreadCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('activity')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'activity'
              ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-2xs'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white bg-zinc-100 dark:bg-zinc-850/60'
          }`}
        >
          <Clock className="w-4 h-4" />
          Audit Activity History
        </button>

        <button
          onClick={() => setActiveTab('preferences')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'preferences'
              ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-2xs'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white bg-zinc-100 dark:bg-zinc-850/60'
          }`}
        >
          <Sliders className="w-4 h-4" />
          Alert Preferences
        </button>
      </div>

      {/* Error & Success Feedback Banners */}
      {actionError && (
        <div className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs text-rose-500 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-rose-400 hover:text-rose-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {actionSuccess && (
        <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* ==================================================== */}
      {/* SUB-TAB 1: IN-APP NOTIFICATIONS */}
      {/* ==================================================== */}
      {activeTab === 'notifications' && (
        <div className="space-y-4">
          {/* Controls Bar: Category Filters, Status Toggle & Search */}
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3 shadow-2xs">
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              {/* Category Filter Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1 md:pb-0">
                {(['all', 'gallery', 'client', 'task', 'payment'] as const).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all capitalize whitespace-nowrap ${
                      categoryFilter === cat
                        ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-bold shadow-xs'
                        : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    {cat === 'all' ? 'All Alerts' : cat}
                  </button>
                ))}
              </div>

              {/* Status Selector & Search */}
              <div className="flex items-center gap-2.5">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="px-3 py-1.5 rounded-xl text-xs border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                >
                  <option value="all">Active (Unread & Read)</option>
                  <option value="unread">Unread Only</option>
                  <option value="read">Read Only</option>
                  <option value="archived">Archived</option>
                </select>

                <div className="relative flex-1 sm:w-48">
                  <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search notifications..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Notifications List */}
          {loadingNotifications ? (
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-12 text-center text-xs text-zinc-400 space-y-2">
              <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p>Loading studio notifications...</p>
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-12 text-center space-y-3 shadow-2xs">
              <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-400 mx-auto flex items-center justify-center">
                <Bell className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {searchQuery || categoryFilter !== 'all' || statusFilter !== 'all'
                    ? 'No matching notifications found'
                    : 'No notifications in this collection'}
                </h3>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                  {searchQuery || categoryFilter !== 'all' || statusFilter !== 'all'
                    ? 'Try clearing active search terms or category filters.'
                    : 'Notifications are generated automatically when client profiles, collections, and production tasks are updated in your studio.'}
                </p>
              </div>
              {(searchQuery || categoryFilter !== 'all' || statusFilter !== 'all') && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setCategoryFilter('all');
                    setStatusFilter('all');
                  }}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 text-zinc-700 dark:text-zinc-300"
                >
                  Clear Filters
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredNotifications.map((notification) => {
                const isUnread = !notification.isRead;
                return (
                  <div
                    key={notification.id}
                    className={`rounded-2xl border transition-all p-4.5 space-y-2.5 ${
                      isUnread
                        ? 'border-amber-500/40 bg-amber-500/5 dark:bg-amber-950/10 shadow-xs'
                        : 'border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 opacity-90'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
                          isUnread
                            ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                        }`}>
                          {getCategoryIcon(notification.category)}
                        </div>

                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                              {notification.title}
                            </span>
                            <Badge variant={getCategoryBadgeVariant(notification.category)} size="sm">
                              {notification.category}
                            </Badge>
                            {isUnread && (
                              <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" title="Unread" />
                            )}
                          </div>

                          <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
                            {notification.message}
                          </p>

                          <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-400 font-mono pt-0.5">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-zinc-400" />
                              {new Date(notification.createdAt).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                            {notification.actorName && (
                              <span>• By: {notification.actorName}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right Action Buttons */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {notification.linkTab && (
                          <button
                            onClick={() => handleNavigateToRecord(notification)}
                            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 hover:bg-amber-500 hover:text-zinc-950 text-zinc-700 dark:text-zinc-300 transition-colors flex items-center gap-1"
                            title="Navigate to related record"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">View</span>
                          </button>
                        )}

                        <button
                          onClick={() => handleToggleRead(notification)}
                          className={`p-1.5 rounded-lg border transition-colors ${
                            notification.isRead
                              ? 'border-zinc-200 dark:border-zinc-800 text-zinc-400 hover:text-zinc-700'
                              : 'border-amber-500/30 text-amber-500 hover:bg-amber-500/10'
                          }`}
                          title={notification.isRead ? 'Mark as Unread' : 'Mark as Read'}
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleArchive(notification.id, notification.isArchived)}
                          className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                          title={notification.isArchived ? 'Restore notification' : 'Archive notification'}
                        >
                          <Archive className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleDelete(notification.id)}
                          className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                          title="Delete notification permanently"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ==================================================== */}
      {/* SUB-TAB 2: AUDIT ACTIVITY HISTORY */}
      {/* ==================================================== */}
      {activeTab === 'activity' && (
        <div className="space-y-4">
          {/* Immutability & Security Notice */}
          <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xs space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span>Append-Only Studio Security Audit Log</span>
              </div>
              <Badge variant="emerald" size="sm">Immutable Invariant</Badge>
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Every sensitive change in this studio is permanently recorded under the tenant path 
              <code className="mx-1 px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-mono text-[11px]">
                /studios/{activeStudio?.id}/activityLogs
              </code>.
              Per Firestore Security Rules, ordinary users cannot edit, tamper with, or delete past audit entries.
            </p>
          </div>

          {/* Activity Filters */}
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none w-full sm:w-auto pb-1 sm:pb-0">
              {(['all', 'Gallery', 'Client', 'Task', 'Member'] as const).map((tgt) => (
                <button
                  key={tgt}
                  onClick={() => setActivityTargetFilter(tgt)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                    activityTargetFilter === tgt
                      ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-bold shadow-xs'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  {tgt === 'all' ? 'All Targets' : tgt}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search audit actions..."
                value={activitySearchQuery}
                onChange={(e) => setActivitySearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400"
              />
            </div>
          </div>

          {/* Activity Timeline */}
          {loadingActivity ? (
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-12 text-center text-xs text-zinc-400 space-y-2">
              <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p>Loading studio audit log...</p>
            </div>
          ) : filteredActivityLogs.length === 0 ? (
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-12 text-center space-y-2 shadow-2xs">
              <Clock className="w-8 h-8 text-zinc-400 mx-auto" />
              <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                No audit events recorded
              </h3>
              <p className="text-xs text-zinc-500">
                Events will appear chronologically as studio staff manage galleries, clients, and tasks.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 divide-y divide-zinc-100 dark:divide-zinc-800/80 shadow-2xs overflow-hidden">
              {filteredActivityLogs.map((log) => (
                <div key={log.id} className="p-4 sm:p-5 flex items-start justify-between gap-4 hover:bg-zinc-50/50 dark:hover:bg-zinc-850/30 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500 mt-1.5 flex-shrink-0" />
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                          {log.action}
                        </span>
                        <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                          {log.targetType}
                        </span>
                      </div>

                      <div className="text-xs text-zinc-600 dark:text-zinc-300">
                        Target Record: <strong className="text-zinc-900 dark:text-zinc-100">{log.targetName}</strong>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-[10px] text-zinc-400 font-mono">
                        <span>Actor: {log.userEmail}</span>
                        <span>•</span>
                        <span>UID: {log.userId.substring(0, 10)}...</span>
                        <span>•</span>
                        <span>Studio: @{activeStudio?.slug}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right text-[11px] text-zinc-400 font-mono flex-shrink-0">
                    <div>{new Date(log.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
                    <div>{new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ==================================================== */}
      {/* SUB-TAB 3: NOTIFICATION PREFERENCES */}
      {/* ==================================================== */}
      {activeTab === 'preferences' && (
        <div className="space-y-6">
          {/* User Preferences Card */}
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-5 shadow-2xs">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div>
                <h2 className="text-base font-serif font-bold text-zinc-900 dark:text-zinc-100">
                  Notification Category Preferences
                </h2>
                <p className="text-xs text-zinc-500">
                  Choose which application events generate in-app alerts on your personal roster
                </p>
              </div>

              {prefSaveSuccess && (
                <Badge variant="emerald" size="sm">Preferences Saved</Badge>
              )}
            </div>

            <div className="space-y-4">
              {/* Category 1: Galleries */}
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-850/40">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
                    <Images className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                      Gallery & Collection Alerts
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      Notifications when galleries are published, client photo selections are submitted, or proof comments are added
                    </div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={preferences.galleryNotifications}
                  onChange={() => handleTogglePreference('galleryNotifications')}
                  className="rounded text-amber-500 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                />
              </div>

              {/* Category 2: Client CRM */}
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-850/40">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
                    <Users className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                      Client CRM & Booking Alerts
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      Alerts when new clients are registered, booking details are edited, or client profiles are archived
                    </div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={preferences.clientNotifications}
                  onChange={() => handleTogglePreference('clientNotifications')}
                  className="rounded text-amber-500 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                />
              </div>

              {/* Category 3: Production Tasks */}
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-850/40">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                    <CheckSquare className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                      Production Task Board Alerts
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      Alerts on task assignments, column progression (Editing, Revisions, Delivery), and status changes
                    </div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={preferences.taskNotifications}
                  onChange={() => handleTogglePreference('taskNotifications')}
                  className="rounded text-amber-500 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                />
              </div>

              {/* Category 4: Payments & Ledger */}
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-850/40">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-500 flex items-center justify-center">
                    <DollarSign className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                      Payment & Ledger Entries
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      Pre-configured alerts for client retainer payments, balance receipts, and invoice status
                    </div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={preferences.paymentNotifications}
                  onChange={() => handleTogglePreference('paymentNotifications')}
                  className="rounded text-amber-500 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                />
              </div>

              {/* Category 5: System & Security */}
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-850/40">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-zinc-500/10 text-zinc-500 flex items-center justify-center">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                      System & Quota Diagnostic Warnings
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      10 GB planned limit threshold warnings and studio membership roster additions
                    </div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={preferences.systemNotifications}
                  onChange={() => handleTogglePreference('systemNotifications')}
                  className="rounded text-amber-500 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Delivery Channels Realism & Honesty Enforcement */}
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-4 shadow-2xs">
            <div className="border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <h2 className="text-base font-serif font-bold text-zinc-900 dark:text-zinc-100">
                Delivery Channels & Gateways Status
              </h2>
              <p className="text-xs text-zinc-500">
                Architectural status of outbound notification gateways
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              {/* In-App Notifications: Active */}
              <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/20 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <Bell className="w-4 h-4" /> In-App Alerts
                  </span>
                  <Badge variant="emerald" size="sm">Active</Badge>
                </div>
                <p className="text-zinc-500 text-[11px]">
                  Real-time in-app notification center powered by tenant-isolated Cloud Firestore.
                </p>
              </div>

              {/* Email Notifications: Not Configured */}
              <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/5 dark:bg-amber-950/20 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                    <Mail className="w-4 h-4" /> Email (SMTP / SendGrid)
                  </span>
                  <Badge variant="amber" size="sm">Not Configured</Badge>
                </div>
                <p className="text-zinc-500 text-[11px]">
                  To maintain zero-billing status, automated outbound SMTP mailers are not connected.
                </p>
              </div>

              {/* SMS / WhatsApp: Not Configured */}
              <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/5 dark:bg-amber-950/20 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                    <Smartphone className="w-4 h-4" /> SMS & WhatsApp
                  </span>
                  <Badge variant="amber" size="sm">Not Configured</Badge>
                </div>
                <p className="text-zinc-500 text-[11px]">
                  External telecom SMS gateways (e.g. Twilio) require paid carrier billing and are unconfigured.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

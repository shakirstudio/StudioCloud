import React, { useState } from 'react';
import { 
  Settings, 
  Sun, 
  Moon, 
  Bell, 
  ShieldCheck, 
  HardDrive, 
  Check, 
  Lock,
  Layers,
  Database,
  Palette,
  ArrowUpRight
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Badge } from '../common/Badge';

interface SettingsModuleProps {
  onNavigate?: (tab: string) => void;
}

export const SettingsModule: React.FC<SettingsModuleProps> = ({ onNavigate }) => {
  const { theme, toggleTheme, activeStudio } = useAuth();
  const [quotaAlertThreshold, setQuotaAlertThreshold] = useState('80');
  const [downloadNotification, setDownloadNotification] = useState(true);
  const [dateFormat, setDateFormat] = useState('YYYY-MM-DD');

  return (
    <div className="space-y-6 pb-12 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
            Application Preferences
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            User interface themes, notification thresholds, and security diagnostic status
          </p>
        </div>

        {onNavigate && (
          <button
            onClick={() => onNavigate('branding')}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold transition-colors shadow-2xs flex items-center gap-2"
          >
            <Palette className="w-4 h-4" />
            Studio Branding & Identity
          </button>
        )}
      </div>

      {/* Theme selection */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-4 shadow-2xs">
        <h2 className="text-base font-serif font-bold text-zinc-900 dark:text-zinc-100">
          Visual Aesthetics & Photography Display
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Darkroom Noir */}
          <div 
            onClick={() => { if (theme !== 'dark') toggleTheme(); }}
            className={`p-4 rounded-xl border-2 transition-all cursor-pointer space-y-3 ${
              theme === 'dark' 
                ? 'border-amber-500 bg-zinc-950 text-white shadow-xs' 
                : 'border-zinc-200 bg-zinc-900 text-zinc-300 opacity-60 hover:opacity-90'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <Moon className="w-4 h-4" /> Darkroom Noir (Dark)
              </span>
              {theme === 'dark' && <Badge variant="gold">Active</Badge>}
            </div>
            <p className="text-xs text-zinc-400">
              Deep obsidian interface engineered for low reflection and high contrast photography viewing.
            </p>
          </div>

          {/* Gallery White */}
          <div 
            onClick={() => { if (theme !== 'light') toggleTheme(); }}
            className={`p-4 rounded-xl border-2 transition-all cursor-pointer space-y-3 ${
              theme === 'light' 
                ? 'border-amber-500 bg-white text-zinc-900 shadow-xs' 
                : 'border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-800/40 text-zinc-600 dark:text-zinc-400 opacity-60 hover:opacity-90'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                <Sun className="w-4 h-4" /> Gallery White (Light)
              </span>
              {theme === 'light' && <Badge variant="gold">Active</Badge>}
            </div>
            <p className="text-xs text-zinc-500">
              Crisp editorial white layout ideal for daytime studio client proofing and presentations.
            </p>
          </div>
        </div>
      </div>

      {/* Quota & Notification Preferences */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-4 shadow-2xs">
        <h2 className="text-base font-serif font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
          <Bell className="w-4 h-4 text-amber-500" />
          Tenant Storage & Delivery Notifications
        </h2>

        <div className="space-y-4 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-zinc-100 dark:border-zinc-800">
            <div>
              <span className="font-semibold text-zinc-800 dark:text-zinc-200">10 GB Quota Warning Trigger</span>
              <p className="text-zinc-500">Alert studio owner when aggregate storage usage crosses threshold</p>
            </div>
            <select
              value={quotaAlertThreshold}
              onChange={(e) => setQuotaAlertThreshold(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200"
            >
              <option value="75">75% (7.5 GB)</option>
              <option value="80">80% (8.0 GB - Recommended)</option>
              <option value="90">90% (9.0 GB)</option>
              <option value="95">95% (9.5 GB)</option>
            </select>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-zinc-100 dark:border-zinc-800">
            <div>
              <span className="font-semibold text-zinc-800 dark:text-zinc-200">Client Download Alert</span>
              <p className="text-zinc-500">Log audit event whenever a client downloads original high-res ZIP</p>
            </div>
            <input
              type="checkbox"
              checked={downloadNotification}
              onChange={(e) => setDownloadNotification(e.target.checked)}
              className="rounded text-amber-500 focus:ring-amber-500"
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="font-semibold text-zinc-800 dark:text-zinc-200">Date Display Standard</span>
              <p className="text-zinc-500">Standardized timestamp format across client bookings & galleries</p>
            </div>
            <select
              value={dateFormat}
              onChange={(e) => setDateFormat(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-mono"
            >
              <option value="YYYY-MM-DD">ISO 8601 (YYYY-MM-DD)</option>
              <option value="DD MMM YYYY">Editorial (DD MMM YYYY)</option>
              <option value="MM/DD/YYYY">US Standard (MM/DD/YYYY)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Security Diagnostics & Isolation Verification */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-4 shadow-2xs">
        <h2 className="text-base font-serif font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          Security Architecture Diagnostics
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3.5 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30 space-y-1">
            <div className="font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-emerald-500" />
              Tenant Isolation Enforced
            </div>
            <p className="text-zinc-500 text-[11px]">
              Studio documents are partitioned by studio ID. Unauthenticated cross-tenant queries are blocked at the Cloud Firestore engine.
            </p>
          </div>

          <div className="p-3.5 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30 space-y-1">
            <div className="font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-amber-500" />
              Cloud Firestore Enterprise
            </div>
            <p className="text-zinc-500 text-[11px]">
              Project: <span className="font-mono text-zinc-700 dark:text-zinc-300">totemic-metric-wmzf6</span>. Rules version 2 deployed.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

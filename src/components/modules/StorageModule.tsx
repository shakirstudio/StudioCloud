import React, { useState, useEffect } from 'react';
import { 
  HardDrive, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldCheck, 
  Layers, 
  Cpu, 
  Sparkles, 
  Info,
  Database,
  CloudOff,
  FolderOpen
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { 
  formatBytes, 
  verifyStorageQuotaBackend,
  getGalleries,
  DEFAULT_ALLOCATION_BYTES,
  getSubscriptionPlans
} from '../../services/studioService';
import { Gallery, QuotaCheckResult, SubscriptionPlan } from '../../types';
import { Badge } from '../common/Badge';

export const StorageModule: React.FC = () => {
  const { activeStudio } = useAuth();
  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [dbPlans, setDbPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);

  // Architecture Quota Simulation Sandbox
  const [testPayloadMB, setTestPayloadMB] = useState(1500); // 1.5 GB
  const [verifyingQuota, setVerifyingQuota] = useState(false);
  const [testResult, setTestResult] = useState<QuotaCheckResult | null>(null);

  useEffect(() => {
    if (!activeStudio) return;
    async function loadData() {
      setLoading(true);
      try {
        const [galleryList, planList] = await Promise.all([
          getGalleries(activeStudio!.id),
          getSubscriptionPlans()
        ]);
        setGalleries(galleryList);
        setDbPlans(planList || []);
      } catch (err) {
        console.error('Error fetching galleries for storage overview:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [activeStudio]);

  const allocBytes = activeStudio?.storageAllocationBytes || DEFAULT_ALLOCATION_BYTES;

  const handleRunQuotaTest = async () => {
    setVerifyingQuota(true);
    try {
      const incomingBytes = testPayloadMB * 1024 * 1024;
      // In Phase 3A: Test with 0 used bytes since usage is not yet measured
      const res = await verifyStorageQuotaBackend(0, allocBytes, incomingBytes);
      setTestResult(res);
    } catch (err) {
      console.error('Error testing quota backend:', err);
    } finally {
      setVerifyingQuota(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-500 font-mono">
            Phase 3A
          </span>
          <Badge variant="zinc">Zero Billing Mode</Badge>
        </div>
        <h1 className="text-2xl font-serif font-bold text-zinc-900 dark:text-zinc-100 tracking-tight mt-1">
          Storage Allocation & Quota Architecture
        </h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Planned 10 GB default studio allocation, cloud connection status, and server enforcement pipeline
        </p>
      </div>

      {/* PHASE 3A STORAGE TRANSPARENCY BANNER */}
      <div className="p-4 sm:p-5 rounded-2xl border border-amber-500/30 bg-amber-500/5 dark:bg-amber-950/20 text-xs text-zinc-700 dark:text-zinc-300 space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <CloudOff className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <span className="font-semibold text-amber-600 dark:text-amber-400">
              Cloud Storage Status: Not Connected (Zero-Billing Upgrade Preserved)
            </span>
          </div>
          <Badge variant="amber" size="sm">Not Connected</Badge>
        </div>
        <p className="leading-relaxed text-zinc-600 dark:text-zinc-400">
          In Phase 3A, real Google Cloud Storage is intentionally not connected to prevent requiring a paid Google Cloud billing account or payment method. 
          Storage usage is <strong>not yet measured</strong> and <strong>not active</strong>. 
          StudioCloud does not fabricate used-storage numbers or fake upload figures. 
          Every studio is configured with a planned allocation of <strong>10,000,000,000 bytes (10 GB decimal)</strong> ready for when cloud object storage is attached.
        </p>
      </div>

      {/* Main Quota Overview Card */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 sm:p-8 space-y-6 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
              <HardDrive className="w-4 h-4" /> Planned Storage Allocation
            </span>
            <h2 className="text-xl font-bold font-serif text-zinc-900 dark:text-zinc-100">
              10 GB Default Studio Allocation
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <Badge variant="zinc">
              Usage Not Yet Measured
            </Badge>
            <span className="text-xs font-mono text-zinc-500">
              Allocation: 10.0 GB Decimal
            </span>
          </div>
        </div>

        {/* Visual Allocation Representation */}
        <div className="space-y-3">
          <div className="w-full h-4 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden p-0.5 border border-zinc-200 dark:border-zinc-700/60">
            {/* Dashed blueprint bar showing planned allocation */}
            <div className="h-full rounded-full bg-zinc-300 dark:bg-zinc-700 opacity-60 w-full" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-zinc-600 dark:text-zinc-400 font-medium pt-1">
            <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800">
              <div className="text-[11px] text-zinc-400 uppercase font-mono">Planned Quota</div>
              <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5">
                10 GB (10,000,000,000 bytes)
              </div>
            </div>

            <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800">
              <div className="text-[11px] text-zinc-400 uppercase font-mono">Measured Usage</div>
              <div className="text-sm font-semibold text-amber-600 dark:text-amber-400 mt-0.5">
                Not yet measured
              </div>
            </div>

            <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800">
              <div className="text-[11px] text-zinc-400 uppercase font-mono">Storage Engine</div>
              <div className="text-sm font-semibold text-zinc-600 dark:text-zinc-300 mt-0.5">
                Not connected (Phase 3A)
              </div>
            </div>
          </div>
        </div>

        {/* Architecture Blueprint Explanation */}
        <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 flex items-start gap-3.5">
          <Info className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-zinc-600 dark:text-zinc-400 space-y-1.5">
            <div className="font-semibold text-zinc-800 dark:text-zinc-200">
              Planned Quota Enforcement Architecture
            </div>
            <p className="leading-relaxed">
              When Google Cloud Storage is attached in a future phase, quota enforcement will be implemented across two layers:
            </p>
            <ul className="space-y-1 pl-3 text-[11px] list-disc">
              <li>
                <strong>Server Pre-Flight Quota Check:</strong> Express backend endpoint (<code>/api/quota/verify</code>) checks the studio's recorded byte footprint against the 10 GB limit before generating upload permissions.
              </li>
              <li>
                <strong>Storage Security Rules:</strong> Studio-isolated bucket hierarchy (<code>studios/&#123;studioId&#125;/galleries/&#123;galleryId&#125;/...</code>) ensuring tenant isolation.
              </li>
              <li>
                <strong>Storage Quota Tracking:</strong> Real byte counts incremented only upon confirmed binary upload completion.
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Quota Engine Architecture Simulation Sandbox */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-4 shadow-2xs">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-amber-500" />
            <h2 className="text-base font-serif font-bold text-zinc-900 dark:text-zinc-100">
              Quota Engine Simulation Calculator (Formula Evaluation Demo)
            </h2>
          </div>
          <Badge variant="zinc">Simulation Sandbox — Not Live Enforcement</Badge>
        </div>
        <p className="text-xs text-zinc-500 max-w-2xl">
          Simulate how the server mathematical calculation endpoint (<code>/api/quota/verify</code>) evaluates proposed asset sizes against the studio's 10 GB planned quota.
        </p>
        <div className="p-3 rounded-xl border border-amber-500/20 bg-amber-500/5 text-[11px] text-zinc-600 dark:text-zinc-400">
          <strong>Notice:</strong> This calculator is an architectural formula demo. It does <strong>not</strong> enforce real object storage upload limits while cloud storage is Not Connected.
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 pt-1">
          <div className="w-full sm:w-64">
            <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block mb-1">
              Simulated Ingestion Batch (MB)
            </label>
            <input
              type="number"
              min="50"
              max="20000"
              step="50"
              value={testPayloadMB}
              onChange={(e) => setTestPayloadMB(Number(e.target.value))}
              className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 font-mono text-zinc-900 dark:text-zinc-100"
            />
          </div>

          <button
            onClick={handleRunQuotaTest}
            disabled={verifyingQuota}
            className="w-full sm:w-auto mt-auto px-5 py-2 rounded-xl text-xs font-semibold text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 hover:bg-zinc-800 transition-colors shadow-xs"
          >
            {verifyingQuota ? 'Calculating Formula...' : 'Run Simulation Check'}
          </button>
        </div>

        {testResult && (
          <div className={`p-4 rounded-xl border text-xs space-y-2 mt-3 animate-in fade-in ${
            testResult.allowed 
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' 
              : 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'
          }`}>
            <div className="font-semibold flex items-center gap-2">
              {testResult.allowed ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span>Mathematical Simulation: Proposed Batch Fits Within 10 GB Allocation</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-rose-500" />
                  <span>Mathematical Simulation: Proposed Batch Exceeds 10 GB Allocation Ceiling</span>
                </>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px]">
              <div>Current Used: {formatBytes(testResult.currentUsedBytes)}</div>
              <div>Simulated Request: {formatBytes(testResult.requestedBytes)}</div>
              <div>Projected: {formatBytes(testResult.projectedBytes)}</div>
              <div>Remaining: {formatBytes(testResult.remainingBytes)}</div>
            </div>
            <p className="text-[11px] font-sans opacity-90">
              {testResult.message} (Note: Cloud storage is Not Connected; this test does not enforce real live uploads).
            </p>
          </div>
        )}
      </div>

      {/* Collection Asset Overview (Firestore Persisted) */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-4 shadow-2xs">
        <h2 className="text-base font-serif font-bold text-zinc-900 dark:text-zinc-100">
          Studio Gallery Collections Overview
        </h2>
        
        {loading ? (
          <div className="py-8 text-center text-xs text-zinc-400">Loading collection records...</div>
        ) : galleries.length === 0 ? (
          <div className="p-8 text-center rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 text-xs text-zinc-400 space-y-1">
            <FolderOpen className="w-6 h-6 mx-auto mb-2 text-zinc-400" />
            <p>No gallery collections created in this studio yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {galleries.map((gallery) => (
              <div key={gallery.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                <div className="min-w-0">
                  <div className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                    {gallery.title}
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    Shoot: {gallery.shootDate || 'Unscheduled'} • {gallery.clientName || 'General Client'} • {gallery.eventType || 'Event'}
                  </div>
                </div>

                <div className="text-right flex items-center gap-2">
                  <Badge variant="zinc" size="sm">
                    Metadata Only
                  </Badge>
                  <span className="text-[11px] text-zinc-400 font-mono hidden sm:inline">
                    Storage: Not Connected
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Current Studio Subscription Record */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-4 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-mono">
                Verified Tenant Status
              </span>
            </div>
            <h2 className="text-base font-serif font-bold text-zinc-900 dark:text-zinc-100 mt-1">
              Current Studio Plan & Subscription Record
            </h2>
            <p className="text-xs text-zinc-500">
              Persisted subscription status stored in Firestore for this studio tenant
            </p>
          </div>

          <Badge variant={activeStudio?.subscription?.status === 'suspended' || activeStudio?.status === 'suspended' ? 'rose' : 'emerald'}>
            Status: {((activeStudio?.subscription?.status || activeStudio?.status || 'active')).toUpperCase()}
          </Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800">
            <div className="text-[10px] uppercase font-semibold text-zinc-400">Assigned Plan</div>
            <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100 capitalize mt-1">
              {activeStudio?.subscription?.planName || activeStudio?.plan || 'Studio Starter'}
            </div>
            <div className="text-[10px] text-zinc-400 mt-0.5">
              {activeStudio?.subscription ? 'Super Admin Assigned' : 'Initial Registration'}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800">
            <div className="text-[10px] uppercase font-semibold text-zinc-400">Planned Quota</div>
            <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mt-1">
              {formatBytes(allocBytes)}
            </div>
            <div className="text-[10px] text-zinc-400 mt-0.5">
              Usage: <span className="text-amber-500">Not Measured</span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800">
            <div className="text-[10px] uppercase font-semibold text-zinc-400">Cloud Storage</div>
            <div className="text-sm font-bold text-amber-500 mt-1">
              Not Connected
            </div>
            <div className="text-[10px] text-zinc-400 mt-0.5">
              Zero-billing mode preserved
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800">
            <div className="text-[10px] uppercase font-semibold text-zinc-400">Payment Gateway</div>
            <div className="text-sm font-bold text-zinc-600 dark:text-zinc-300 mt-1">
              Not Connected
            </div>
            <div className="text-[10px] text-zinc-400 mt-0.5">
              Manual Admin Override
            </div>
          </div>
        </div>

        {activeStudio?.subscription?.administrativeNotes && (
          <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-600 dark:text-zinc-400">
            <span className="font-semibold text-zinc-800 dark:text-zinc-200">Administrative Note: </span>
            {activeStudio.subscription.administrativeNotes}
          </div>
        )}
      </div>

      {/* Subscription Plans Catalog */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-6 shadow-2xs">
        <div>
          <h2 className="text-base font-serif font-bold text-zinc-900 dark:text-zinc-100">
            {dbPlans.length > 0 ? 'Platform Subscription Plans Catalog' : 'Illustrative Plan Models (UI Examples — Not Persisted)'}
          </h2>
          <p className="text-xs text-zinc-500">
            {dbPlans.length > 0 
              ? 'Persisted platform plans defined in Firestore catalog'
              : 'Below are illustrative reference specifications only. No subscription plans are currently configured in Firestore. An authorized Super Admin can configure and persist plans in the Super Admin Platform Control.'}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {dbPlans.length > 0 ? (
            dbPlans.filter(p => p.status === 'active').map((p) => {
              const isCurrent = (activeStudio?.subscription?.planId === p.id) || (activeStudio?.plan === p.id);
              return (
                <div 
                  key={p.id}
                  className={`rounded-xl p-5 space-y-4 relative ${
                    isCurrent 
                      ? 'border-2 border-emerald-500/40 bg-emerald-500/5 dark:bg-emerald-950/10' 
                      : 'border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30'
                  }`}
                >
                  <div className="absolute top-3 right-3">
                    {isCurrent ? (
                      <Badge variant="emerald">Current Assigned Plan</Badge>
                    ) : (
                      <Badge variant="zinc">Platform Plan</Badge>
                    )}
                  </div>

                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                      {p.name}
                    </div>
                    <div className="text-2xl font-bold font-serif text-zinc-900 dark:text-zinc-100 mt-1">
                      ${p.priceMonthly} <span className="text-xs font-sans font-normal text-zinc-500">/ mo</span>
                    </div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">
                      ${p.priceAnnual} / yr
                    </div>
                  </div>

                  <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                    {formatBytes(p.storageLimitBytes)} Cloud Storage Allocation
                  </div>

                  <div className="text-[11px] text-zinc-500 font-medium">
                    {p.maxTeamMembers === -1 ? 'Unlimited Team Members' : `Up to ${p.maxTeamMembers || 3} Team Members`}
                  </div>

                  <ul className="text-[11px] text-zinc-600 dark:text-zinc-400 space-y-1.5 pt-1">
                    {p.supportedFeatures?.map((f, i) => (
                      <li key={i}>• {f}</li>
                    ))}
                  </ul>
                </div>
              );
            })
          ) : (
            <>
              {/* Reference Starter Plan */}
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30 p-5 space-y-4 relative">
                <div className="absolute top-3 right-3">
                  <Badge variant="zinc">Reference Example</Badge>
                </div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                    Studio Starter (Example)
                  </div>
                  <div className="text-2xl font-bold font-serif text-zinc-900 dark:text-zinc-100 mt-1">
                    $29 <span className="text-xs font-sans font-normal text-zinc-500">/ mo</span>
                  </div>
                </div>
                <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                  10 GB Default Cloud Storage Allocation
                </div>
                <div className="text-[11px] text-zinc-500 font-medium">
                  Up to 3 Team Members
                </div>
                <ul className="text-[11px] text-zinc-600 dark:text-zinc-400 space-y-1.5">
                  <li>• Full Gallery Client Delivery</li>
                  <li>• Client CRM & Shoot Tracking</li>
                  <li>• Custom Watermark & Proofing</li>
                  <li>• Up to 3 Team Members</li>
                </ul>
              </div>

              {/* Reference Pro Plan */}
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30 p-5 space-y-4 relative">
                <div className="absolute top-3 right-3">
                  <Badge variant="zinc">Reference Example</Badge>
                </div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                    Studio Pro (Example)
                  </div>
                  <div className="text-2xl font-bold font-serif text-zinc-900 dark:text-zinc-100 mt-1">
                    $79 <span className="text-xs font-sans font-normal text-zinc-500">/ mo</span>
                  </div>
                </div>
                <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                  250 GB High-Res Cloud Storage
                </div>
                <div className="text-[11px] text-zinc-500 font-medium">
                  Up to 10 Team Members
                </div>
                <ul className="text-[11px] text-zinc-600 dark:text-zinc-400 space-y-1.5">
                  <li>• Everything in Starter</li>
                  <li>• Custom Vanity Subdomain</li>
                  <li>• VIP Favorite Proofing</li>
                  <li>• Up to 10 Team Members</li>
                </ul>
              </div>

              {/* Reference Enterprise Plan */}
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30 p-5 space-y-4 relative">
                <div className="absolute top-3 right-3">
                  <Badge variant="zinc">Reference Example</Badge>
                </div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                    Studio Enterprise (Example)
                  </div>
                  <div className="text-2xl font-bold font-serif text-zinc-900 dark:text-zinc-100 mt-1">
                    $199 <span className="text-xs font-sans font-normal text-zinc-500">/ mo</span>
                  </div>
                </div>
                <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                  2 TB Dedicated Object Storage
                </div>
                <div className="text-[11px] text-zinc-500 font-medium">
                  Up to 50 Team Members
                </div>
                <ul className="text-[11px] text-zinc-600 dark:text-zinc-400 space-y-1.5">
                  <li>• Everything in Pro</li>
                  <li>• Multi-Location Hubs</li>
                  <li>• Dedicated Bucket Isolation</li>
                  <li>• Up to 50 Team Members</li>
                </ul>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

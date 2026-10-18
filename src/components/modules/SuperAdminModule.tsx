import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
  Building2, 
  HardDrive, 
  Users, 
  CheckCircle2, 
  AlertOctagon, 
  RefreshCw,
  Search,
  Lock,
  Sparkles,
  ArrowRight,
  X,
  Layers,
  Plus,
  Edit3,
  Clock,
  CreditCard,
  Calendar,
  Check,
  Eye,
  FileText,
  AlertTriangle,
  DollarSign,
  CloudOff,
  SlidersHorizontal,
  ChevronRight,
  Trash2,
  ExternalLink,
  Info
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { 
  getSuperAdminStudios, 
  formatBytes, 
  SUPER_ADMIN_EMAIL,
  getSubscriptionPlans,
  createSubscriptionPlan,
  updateSubscriptionPlan,
  toggleSubscriptionPlanStatus,
  deleteSubscriptionPlan,
  updateStudioSubscription,
  updateTenantStatus,
  getPlatformAuditLogs,
  canTransitionSubscriptionStatus,
  checkAdminBillingStatusBackend,
  validateSubscriptionPlanInput
} from '../../services/studioService';
import { 
  Studio, 
  SubscriptionPlan, 
  SubscriptionStatus, 
  SubscriptionAuditRecord,
  VALID_SUBSCRIPTION_TRANSITIONS,
  PlanBillingInterval,
  PlanStatus
} from '../../types';
import { Badge } from '../common/Badge';

interface SuperAdminModuleProps {
  onInspectStudio: (studio: Studio) => void;
}

type SuperAdminTab = 'subscriptions' | 'plans' | 'audit' | 'boundary';

const DEFAULT_PLAN_TEMPLATES: Array<Omit<SubscriptionPlan, 'id' | 'createdAt' | 'updatedAt'>> = [
  {
    name: 'Studio Starter',
    description: 'Essential client delivery & proofing for independent photographers',
    priceMonthly: 29,
    priceAnnual: 290,
    currency: 'USD',
    storageLimitBytes: 10000000000, // 10 GB decimal
    galleryLimit: 15,
    maxTeamMembers: 3,
    supportedFeatures: [
      'Full Gallery Client Delivery',
      'Client Proofing & Favourites',
      'Custom Brand Watermark',
      'Default 10 GB Allocation'
    ],
    billingInterval: 'both',
    status: 'active'
  },
  {
    name: 'Studio Pro',
    description: 'High-volume workflow for busy portrait and wedding studios',
    priceMonthly: 79,
    priceAnnual: 790,
    currency: 'USD',
    storageLimitBytes: 100000000000, // 100 GB decimal
    galleryLimit: 50,
    maxTeamMembers: 10,
    supportedFeatures: [
      'Everything in Starter',
      'Custom Vanity Subdomain',
      'RAW & 4K Preview Delivery',
      'Production Task Workflows',
      '100 GB High-Res Allocation'
    ],
    billingInterval: 'both',
    status: 'active'
  },
  {
    name: 'Studio Enterprise',
    description: 'Dedicated infrastructure for multi-photographer commercial agencies',
    priceMonthly: 199,
    priceAnnual: 1990,
    currency: 'USD',
    storageLimitBytes: 1000000000000, // 1 TB decimal
    galleryLimit: -1, // Unlimited
    maxTeamMembers: -1, // Unlimited
    supportedFeatures: [
      'Everything in Pro',
      'Multi-Location Hubs',
      'Dedicated Bucket Isolation',
      'Custom White-Label Branding',
      '1 TB Dedicated Storage'
    ],
    billingInterval: 'both',
    status: 'active'
  }
];

export const SuperAdminModule: React.FC<SuperAdminModuleProps> = ({ onInspectStudio }) => {
  const { isSuperAdmin, user } = useAuth();
  const [activeTab, setActiveTab] = useState<SuperAdminTab>('subscriptions');
  
  // Data states
  const [studios, setStudios] = useState<Studio[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [auditLogs, setAuditLogs] = useState<SubscriptionAuditRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Plan Form / Modal State
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [planFormName, setPlanFormName] = useState('');
  const [planFormDesc, setPlanFormDesc] = useState('');
  const [planFormPriceMonthly, setPlanFormPriceMonthly] = useState<number>(29);
  const [planFormPriceAnnual, setPlanFormPriceAnnual] = useState<number>(290);
  const [planFormCurrency, setPlanFormCurrency] = useState('USD');
  const [planFormStorageGB, setPlanFormStorageGB] = useState<number>(10);
  const [planFormGalleryLimit, setPlanFormGalleryLimit] = useState<number>(15);
  const [planFormTeamLimit, setPlanFormTeamLimit] = useState<number>(3);
  const [planFormInterval, setPlanFormInterval] = useState<PlanBillingInterval>('both');
  const [planFormStatus, setPlanFormStatus] = useState<PlanStatus>('active');
  const [planFormFeatures, setPlanFormFeatures] = useState<string[]>([
    'Full Gallery Client Delivery',
    'Client CRM & Proofing',
    'Custom Brand Watermark'
  ]);
  const [newFeatureInput, setNewFeatureInput] = useState('');
  const [planFormError, setPlanFormError] = useState<string | null>(null);
  const [savingPlan, setSavingPlan] = useState(false);

  // Studio Subscription Management Modal State
  const [subModalStudio, setSubModalStudio] = useState<Studio | null>(null);
  const [subTargetPlanId, setSubTargetPlanId] = useState('');
  const [subTargetStatus, setSubTargetStatus] = useState<SubscriptionStatus>('active');
  const [subTargetStorageGB, setSubTargetStorageGB] = useState<number>(10);
  const [subTargetExpiry, setSubTargetExpiry] = useState('');
  const [subTargetBillingInterval, setSubTargetBillingInterval] = useState<'monthly' | 'annual'>('monthly');
  const [subReason, setSubReason] = useState('');
  const [subModalError, setSubModalError] = useState<string | null>(null);
  const [savingSubscription, setSavingSubscription] = useState(false);
  const [subConfirmStep, setSubConfirmStep] = useState(false);

  // Studio Tenant Details & Status Inspection Modal State
  const [detailStudio, setDetailStudio] = useState<Studio | null>(null);
  const [statusChangeReason, setStatusChangeReason] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [statusUpdateError, setStatusUpdateError] = useState<string | null>(null);

  // Audit filter state
  const [auditFilter, setAuditFilter] = useState<'all' | 'subscription' | 'plan' | 'tenant'>('all');

  // Billing Boundary Status State
  const [billingInfo, setBillingInfo] = useState<{
    paymentGateway: string;
    recurringBilling: string;
    automaticRenewals: string;
    invoiceGeneration: string;
    zeroBillingPreserved: boolean;
    message: string;
  } | null>(null);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [studioList, planList, logs, billingStatus] = await Promise.all([
        getSuperAdminStudios(),
        getSubscriptionPlans(),
        getPlatformAuditLogs(100),
        checkAdminBillingStatusBackend()
      ]);
      setStudios(studioList || []);
      setPlans(planList || []);
      setAuditLogs(logs || []);
      setBillingInfo(billingStatus);
    } catch (err) {
      console.error('Super Admin query error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) {
      loadAllData();
    }
  }, [isSuperAdmin]);

  // Access Denial Screen if ordinary studio user
  if (!isSuperAdmin) {
    return (
      <div className="p-8 max-w-xl mx-auto rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-center space-y-5 shadow-xl my-12 animate-in fade-in">
        <div className="w-14 h-14 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 mx-auto flex items-center justify-center">
          <Lock className="w-7 h-7" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-xl font-serif font-bold text-zinc-900 dark:text-zinc-100">
            Platform Super Admin Restricted
          </h2>
          <p className="text-xs text-zinc-500 leading-relaxed max-w-md mx-auto">
            This module is reserved strictly for verified platform administrators registered in the system registry or authenticated as <span className="font-mono text-zinc-800 dark:text-zinc-200">{SUPER_ADMIN_EMAIL}</span>. Ordinary studio accounts are blocked from platform inspection and plan management.
          </p>
        </div>

        <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 text-xs text-zinc-600 dark:text-zinc-400 space-y-1 text-center">
          <div className="font-semibold text-zinc-800 dark:text-zinc-200">
            Current Authenticated User: {user?.email || 'Anonymous'}
          </div>
          <p className="text-[11px]">
            To access this platform dashboard, log out and sign in with the administrator Google account or email.
          </p>
        </div>
      </div>
    );
  }

  const totalStudios = studios.length;
  const activeCount = studios.filter(s => (s.subscription?.status || s.status) === 'active').length;
  const suspendedCount = studios.filter(s => (s.subscription?.status || s.status) === 'suspended').length;
  const trialCount = studios.filter(s => s.subscription?.status === 'trial').length;
  const totalAllocatedBytes = studios.reduce((acc, s) => acc + (s.storageAllocationBytes || 10000000000), 0);
  const totalUsedBytes = studios.reduce((acc, s) => acc + (s.storageUsedBytes || 0), 0);

  // Filtered studios
  const filteredStudios = studios.filter(s => {
    const currentStatus = s.subscription?.status || s.status;
    const matchesSearch = 
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.id.toLowerCase().includes(search.toLowerCase()) ||
      s.slug.toLowerCase().includes(search.toLowerCase()) ||
      (s.branding?.contactEmail && s.branding.contactEmail.toLowerCase().includes(search.toLowerCase()));
    
    const matchesStatus = filterStatus === 'all' || currentStatus === filterStatus;
    return matchesSearch && matchesStatus;
  });

  // Filtered audit logs with robust action and targetType normalization
  const matchesAuditFilter = (log: SubscriptionAuditRecord, filter: 'all' | 'subscription' | 'plan' | 'tenant') => {
    if (filter === 'all') return true;
    const act = (log.action || '').toLowerCase();
    const target = (log.targetType || '').toLowerCase();

    if (filter === 'subscription') {
      return (
        act.startsWith('subscription_') ||
        act === 'storage_quota_updated' ||
        target === 'studio_subscription' ||
        (target.includes('subscription') && !target.includes('plan'))
      );
    }
    if (filter === 'plan') {
      return (
        act.startsWith('plan_') ||
        target === 'plan' ||
        target === 'subscription_plan' ||
        target.includes('plan')
      );
    }
    if (filter === 'tenant') {
      return (
        act.startsWith('tenant_') ||
        target === 'studio_tenant' ||
        target.includes('tenant')
      );
    }
    return true;
  };

  const auditSubscriptionsCount = auditLogs.filter(l => matchesAuditFilter(l, 'subscription')).length;
  const auditPlansCount = auditLogs.filter(l => matchesAuditFilter(l, 'plan')).length;
  const auditTenantsCount = auditLogs.filter(l => matchesAuditFilter(l, 'tenant')).length;
  const filteredAuditLogs = auditLogs.filter(l => matchesAuditFilter(l, auditFilter));

  // Open Plan Modal for Create
  const handleOpenCreatePlan = (template?: Omit<SubscriptionPlan, 'id' | 'createdAt' | 'updatedAt'>) => {
    const t = template || {
      name: '',
      description: '',
      priceMonthly: 29,
      priceAnnual: 290,
      currency: 'USD',
      storageLimitBytes: 10000000000,
      galleryLimit: 15,
      maxTeamMembers: 3,
      supportedFeatures: ['Full Gallery Client Delivery', 'Client Proofing & Favourites'],
      billingInterval: 'both',
      status: 'active'
    };

    setEditingPlan(null);
    setPlanFormName(t.name);
    setPlanFormDesc(t.description);
    setPlanFormPriceMonthly(t.priceMonthly);
    setPlanFormPriceAnnual(t.priceAnnual);
    setPlanFormCurrency(t.currency);
    setPlanFormStorageGB(Math.round(t.storageLimitBytes / 1000000000));
    setPlanFormGalleryLimit(t.galleryLimit);
    setPlanFormTeamLimit(t.maxTeamMembers !== undefined ? t.maxTeamMembers : 3);
    setPlanFormInterval(t.billingInterval);
    setPlanFormStatus(t.status);
    setPlanFormFeatures([...t.supportedFeatures]);
    setPlanFormError(null);
    setIsPlanModalOpen(true);
  };

  // Open Plan Modal for Edit
  const handleOpenEditPlan = (plan: SubscriptionPlan) => {
    setEditingPlan(plan);
    setPlanFormName(plan.name);
    setPlanFormDesc(plan.description);
    setPlanFormPriceMonthly(plan.priceMonthly);
    setPlanFormPriceAnnual(plan.priceAnnual);
    setPlanFormCurrency(plan.currency);
    setPlanFormStorageGB(Math.round(plan.storageLimitBytes / 1000000000));
    setPlanFormGalleryLimit(plan.galleryLimit);
    setPlanFormTeamLimit(plan.maxTeamMembers !== undefined ? plan.maxTeamMembers : -1);
    setPlanFormInterval(plan.billingInterval);
    setPlanFormStatus(plan.status);
    setPlanFormFeatures([...plan.supportedFeatures]);
    setPlanFormError(null);
    setIsPlanModalOpen(true);
  };

  // Save Plan (Create or Update)
  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setPlanFormError(null);

    const storageBytes = planFormStorageGB * 1000000000;
    const planPayload = {
      name: planFormName.trim(),
      description: planFormDesc.trim(),
      priceMonthly: Number(planFormPriceMonthly),
      priceAnnual: Number(planFormPriceAnnual),
      currency: planFormCurrency.toUpperCase().trim(),
      storageLimitBytes: storageBytes,
      galleryLimit: Number(planFormGalleryLimit),
      maxTeamMembers: Number(planFormTeamLimit),
      supportedFeatures: planFormFeatures,
      billingInterval: planFormInterval,
      status: planFormStatus
    };

    const validation = validateSubscriptionPlanInput(planPayload);
    if (!validation.valid) {
      setPlanFormError(validation.errors.join(' '));
      return;
    }

    setSavingPlan(true);
    try {
      const actor = user ? { uid: user.uid, email: user.email || 'superadmin' } : undefined;
      if (editingPlan) {
        await updateSubscriptionPlan(editingPlan.id, planPayload, actor, 'Super Admin edited plan in Plan Management');
      } else {
        await createSubscriptionPlan(planPayload, undefined, actor);
      }
      setIsPlanModalOpen(false);
      await loadAllData();
    } catch (err: any) {
      setPlanFormError(err.message || 'Failed to save subscription plan');
    } finally {
      setSavingPlan(false);
    }
  };

  // Quick Create Studio Starter Plan (Option C)
  const handleQuickCreateStarterPlan = async () => {
    setSavingPlan(true);
    try {
      const template = DEFAULT_PLAN_TEMPLATES[0];
      const actor = user ? { uid: user.uid, email: user.email || 'superadmin' } : undefined;
      await createSubscriptionPlan(template, 'studio_starter', actor);
      await loadAllData();
    } catch (err: any) {
      console.error('Failed to create Studio Starter plan:', err);
    } finally {
      setSavingPlan(false);
    }
  };

  // Toggle Plan Status
  const handleTogglePlan = async (plan: SubscriptionPlan) => {
    const nextStatus: PlanStatus = plan.status === 'active' ? 'inactive' : 'active';
    try {
      const actor = user ? { uid: user.uid, email: user.email || 'superadmin' } : undefined;
      await toggleSubscriptionPlanStatus(plan.id, nextStatus, actor);
      await loadAllData();
    } catch (err) {
      console.error('Error toggling plan status:', err);
    }
  };

  // Delete Inactive Plan from Catalog
  const handleDeletePlan = async (plan: SubscriptionPlan) => {
    try {
      const actor = user ? { uid: user.uid, email: user.email || 'superadmin' } : undefined;
      await deleteSubscriptionPlan(plan.id, actor);
      await loadAllData();
    } catch (err: any) {
      console.error('Error deleting plan:', err);
    }
  };

  // Open Studio Tenant Details & Status Inspection Modal
  const handleOpenTenantDetails = (studio: Studio) => {
    setDetailStudio(studio);
    setStatusChangeReason('');
    setStatusUpdateError(null);
  };

  // Toggle Tenant Status (Active / Suspended)
  const handleToggleTenantStatus = async (targetStatus: 'active' | 'suspended') => {
    if (!detailStudio || !user) return;
    if (!statusChangeReason.trim() || statusChangeReason.trim().length < 3) {
      setStatusUpdateError('An administrative note / reason is required to update tenant status.');
      return;
    }
    setUpdatingStatus(true);
    setStatusUpdateError(null);
    try {
      const updated = await updateTenantStatus(detailStudio.id, targetStatus, statusChangeReason.trim(), {
        uid: user.uid,
        email: user.email || 'superadmin'
      });
      if (updated) {
        setDetailStudio(updated);
      }
      setStatusChangeReason('');
      await loadAllData();
    } catch (err: any) {
      setStatusUpdateError(err.message || 'Failed to update tenant status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Auto-fill storage limit when choosing plan
  const handleSelectPlanForSubscription = (planId: string) => {
    setSubTargetPlanId(planId);
    const matched = plans.find(p => p.id === planId);
    if (matched) {
      setSubTargetStorageGB(Math.round(matched.storageLimitBytes / 1000000000));
    }
  };

  // Open Studio Subscription Modal
  const handleOpenSubscriptionModal = (studio: Studio) => {
    setSubModalStudio(studio);
    setSubConfirmStep(false);
    setSubTargetPlanId(studio.subscription?.planId || studio.plan || (plans.length > 0 ? plans[0].id : 'starter'));
    setSubTargetStatus(studio.subscription?.status || (studio.status === 'suspended' ? 'suspended' : 'active'));
    setSubTargetStorageGB(Math.round((studio.storageAllocationBytes || 10000000000) / 1000000000));
    setSubTargetExpiry(studio.subscription?.expiryDate ? studio.subscription.expiryDate.split('T')[0] : '');
    setSubTargetBillingInterval(studio.subscription?.billingInterval || 'monthly');
    setSubReason('');
    setSubModalError(null);
  };

  // Step 1: Validate Form and Proceed to Confirmation Screen
  const handleProceedToConfirmSubscription = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subModalStudio || !user) return;
    setSubModalError(null);

    const currentStatus: SubscriptionStatus = subModalStudio.subscription?.status || (subModalStudio.status === 'suspended' ? 'suspended' : 'active');
    if (subTargetStatus !== currentStatus) {
      const valid = canTransitionSubscriptionStatus(currentStatus, subTargetStatus);
      if (!valid) {
        setSubModalError(
          `Invalid transition from '${currentStatus}' to '${subTargetStatus}'. Allowed: ${(VALID_SUBSCRIPTION_TRANSITIONS[currentStatus] || []).join(', ')}`
        );
        return;
      }
    }

    if (!subTargetPlanId || !plans.some(p => p.id === subTargetPlanId)) {
      setSubModalError('Please select a valid subscription plan from the catalog (e.g. Basic).');
      return;
    }

    if (!subReason.trim() || subReason.trim().length < 3) {
      setSubModalError('Administrative note / reason is required for privileged subscription changes.');
      return;
    }

    setSubConfirmStep(true);
  };

  // Step 2: Execute Confirmed Studio Subscription Assignment
  const handleExecuteSubscriptionUpdate = async () => {
    if (!subModalStudio || !user) return;
    setSubModalError(null);
    setSavingSubscription(true);

    try {
      const storageBytes = subTargetStorageGB * 1000000000;
      const matchedPlan = plans.find(p => p.id === subTargetPlanId);

      await updateStudioSubscription(subModalStudio.id, {
        planId: subTargetPlanId,
        planName: matchedPlan ? matchedPlan.name : subTargetPlanId,
        status: subTargetStatus,
        storageAllocationBytes: storageBytes,
        expiryDate: subTargetExpiry ? new Date(subTargetExpiry).toISOString() : undefined,
        billingInterval: subTargetBillingInterval,
        reason: subReason.trim(),
        actor: { uid: user.uid, email: user.email || 'superadmin' }
      });

      setSubModalStudio(null);
      setSubConfirmStep(false);
      await loadAllData();
    } catch (err: any) {
      setSubModalError(err.message || 'Error updating studio subscription');
      setSubConfirmStep(false);
    } finally {
      setSavingSubscription(false);
    }
  };

  // Add Feature Tag to Plan Form
  const handleAddFeature = () => {
    if (newFeatureInput.trim() && !planFormFeatures.includes(newFeatureInput.trim())) {
      setPlanFormFeatures([...planFormFeatures, newFeatureInput.trim()]);
      setNewFeatureInput('');
    }
  };

  const handleRemoveFeature = (feat: string) => {
    setPlanFormFeatures(planFormFeatures.filter(f => f !== feat));
  };

  // Status Badge Helper
  const getStatusBadge = (status: SubscriptionStatus | string) => {
    switch (status) {
      case 'active':
        return <Badge variant="emerald">Active</Badge>;
      case 'trial':
        return <Badge variant="blue">Trial</Badge>;
      case 'past_due':
        return <Badge variant="amber">Past Due</Badge>;
      case 'suspended':
        return <Badge variant="rose">Suspended</Badge>;
      case 'expired':
        return <Badge variant="zinc">Expired</Badge>;
      case 'cancelled':
        return <Badge variant="zinc">Cancelled</Badge>;
      default:
        return <Badge variant="zinc">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Platform Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-purple-600 dark:text-purple-400 font-mono">
              Platform Administration
            </span>
            <Badge variant="blue">Super Admin Module</Badge>
          </div>
          <h1 className="text-2xl font-serif font-bold text-zinc-900 dark:text-zinc-100 tracking-tight mt-1">
            Subscription & Plan Management
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Trusted plan catalog definitions, studio tenant subscriptions, and immutable audit logs
          </p>
        </div>

        <button
          onClick={loadAllData}
          className="px-3.5 py-1.5 rounded-xl text-xs font-semibold border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700 flex items-center gap-1.5 self-start sm:self-auto shadow-2xs"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh Data
        </button>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('subscriptions')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
            activeTab === 'subscriptions'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>Studio Subscriptions</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/20 text-white">
            {studios.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('plans')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
            activeTab === 'plans'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Subscription Plans Catalog</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/20 text-white">
            {plans.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
            activeTab === 'audit'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Subscription Audit Trail</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/20 text-white">
            {auditLogs.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('boundary')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
            activeTab === 'boundary'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800'
          }`}
        >
          <CreditCard className="w-3.5 h-3.5" />
          <span>Billing & Storage Boundary</span>
        </button>
      </div>

      {/* PLATFORM KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xs">
          <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 mb-1 flex items-center justify-between">
            <span>Registered Studios</span>
            <Building2 className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-2xl font-bold font-serif text-zinc-900 dark:text-zinc-100">{totalStudios}</div>
          <div className="text-[11px] text-zinc-400 mt-1 flex items-center gap-2">
            <span className="text-emerald-500 font-semibold">{activeCount} Active</span>
            <span>•</span>
            <span className="text-rose-500">{suspendedCount} Suspended</span>
            {trialCount > 0 && <span>• <span className="text-blue-500">{trialCount} Trial</span></span>}
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xs">
          <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 mb-1 flex items-center justify-between">
            <span>Configured Plans</span>
            <Layers className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold font-serif text-zinc-900 dark:text-zinc-100">{plans.length}</div>
          <div className="text-[11px] text-zinc-400 mt-1">
            {plans.filter(p => p.status === 'active').length} Active in catalog
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xs">
          <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 mb-1 flex items-center justify-between">
            <span>Platform Storage Used</span>
            <HardDrive className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold font-serif text-zinc-900 dark:text-zinc-100">{formatBytes(totalUsedBytes)}</div>
          <div className="text-[11px] text-zinc-400 mt-1">
            Total Allocated: {formatBytes(totalAllocatedBytes)}
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xs">
          <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 mb-1 flex items-center justify-between">
            <span>Billing Gateway</span>
            <CloudOff className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="text-base font-bold font-serif text-amber-500">Not Connected</div>
          <div className="text-[11px] text-zinc-400 mt-1">
            Zero-billing mode preserved
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* TAB 1: STUDIO SUBSCRIPTIONS */}
      {/* ========================================================= */}
      {activeTab === 'subscriptions' && (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden shadow-2xs space-y-4 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-serif font-bold text-zinc-900 dark:text-zinc-100">
                Studio Tenant Subscriptions
              </h2>
              <p className="text-xs text-zinc-500">
                Manage assigned plans, subscription lifecycles, and storage quota allocations per studio
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="trial">Trial</option>
                <option value="past_due">Past Due</option>
                <option value="suspended">Suspended</option>
                <option value="expired">Expired</option>
                <option value="cancelled">Cancelled</option>
              </select>

              <div className="relative w-full sm:w-60">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Search studios..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          {loading ? (
            <div className="py-16 text-center text-xs text-zinc-400">Loading studio subscriptions from Cloud Firestore...</div>
          ) : studios.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-400 mx-auto flex items-center justify-center">
                <Building2 className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  No Registered Studio Tenants Found
                </div>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                  There are currently no photography studios in the Firestore database. As new studio owners register, their isolated tenant records will appear here in real time.
                </p>
              </div>
            </div>
          ) : filteredStudios.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-400">No studios matching filter "{search || filterStatus}".</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 dark:bg-zinc-800/40 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 font-semibold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-4 py-3">Studio & ID</th>
                    <th className="px-4 py-3">Plan Tier</th>
                    <th className="px-4 py-3">Subscription Status</th>
                    <th className="px-4 py-3">Storage Allocation</th>
                    <th className="px-4 py-3">Payment Status</th>
                    <th className="px-4 py-3">Start / Expiry</th>
                    <th className="px-4 py-3 text-right">Administrative Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                  {filteredStudios.map((s) => {
                    const alloc = s.storageAllocationBytes || 10000000000;
                    const subStatus: SubscriptionStatus = s.subscription?.status || (s.status === 'suspended' ? 'suspended' : 'active');
                    const planName = s.subscription?.planName || s.plan;
                    const startDate = s.subscription?.startDate || s.createdAt;
                    const expiryDate = s.subscription?.expiryDate;

                    return (
                      <tr key={s.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors">
                        <td className="px-4 py-3.5">
                          <button
                            onClick={() => handleOpenTenantDetails(s)}
                            className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2 hover:text-purple-600 dark:hover:text-purple-400 text-left transition-colors"
                          >
                            <span 
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: s.branding?.accentColor || '#c5a059' }} 
                            />
                            <span>{s.name}</span>
                          </button>
                          <div className="text-[10px] font-mono text-zinc-400 mt-0.5">
                            ID: {s.id}
                          </div>
                        </td>

                        <td className="px-4 py-3.5">
                          <span className="font-semibold text-zinc-800 dark:text-zinc-200 capitalize">
                            {planName}
                          </span>
                          <div className="text-[10px] text-zinc-400 capitalize">
                            {s.subscription?.billingInterval || 'Monthly'}
                          </div>
                        </td>

                        <td className="px-4 py-3.5">
                          {getStatusBadge(subStatus)}
                        </td>

                        <td className="px-4 py-3.5">
                          <div className="font-mono text-zinc-800 dark:text-zinc-200 font-semibold">
                            {formatBytes(alloc)}
                          </div>
                          <div className="text-[10px] text-zinc-400">
                            Usage: <span className="text-amber-500 font-medium">Not Connected</span>
                          </div>
                        </td>

                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300">
                            <Badge variant="zinc">Manual Admin Override</Badge>
                          </div>
                          <div className="text-[10px] text-zinc-400 mt-0.5">
                            Gateway Not Connected
                          </div>
                        </td>

                        <td className="px-4 py-3.5 text-[11px] text-zinc-500">
                          <div>Start: {new Date(startDate).toLocaleDateString()}</div>
                          <div>
                            Expiry: {expiryDate ? new Date(expiryDate).toLocaleDateString() : <span className="text-zinc-400">None</span>}
                          </div>
                        </td>

                        <td className="px-4 py-3.5 text-right space-x-1.5 whitespace-nowrap">
                          <button
                            onClick={() => handleOpenTenantDetails(s)}
                            className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 transition-colors inline-flex items-center gap-1"
                          >
                            <Eye className="w-3 h-3" /> Details
                          </button>

                          <button
                            onClick={() => handleOpenSubscriptionModal(s)}
                            className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400 hover:bg-purple-100 transition-colors inline-flex items-center gap-1"
                          >
                            <SlidersHorizontal className="w-3 h-3" /> Subscription
                          </button>

                          <button
                            onClick={() => onInspectStudio(s)}
                            className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 transition-colors inline-flex items-center gap-1"
                          >
                            Inspect <ArrowRight className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: SUBSCRIPTION PLANS CATALOG */}
      {/* ========================================================= */}
      {activeTab === 'plans' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xs">
            <div>
              <h2 className="text-base font-serif font-bold text-zinc-900 dark:text-zinc-100">
                Platform Subscription Plans Catalog
              </h2>
              <p className="text-xs text-zinc-500">
                Define platform pricing tiers, storage quotas, gallery limits, and enabled features stored in Firestore
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleOpenCreatePlan(DEFAULT_PLAN_TEMPLATES[0])}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Load Template into Form
              </button>

              <button
                onClick={() => handleOpenCreatePlan()}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" /> + Create New Plan
              </button>
            </div>
          </div>

          {/* Option C: Studio Starter Action Banner */}
          {!plans.some(p => p.id === 'studio_starter') && plans.length > 0 && (
            <div className="p-4 rounded-2xl border border-purple-500/30 bg-purple-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-purple-700 dark:text-purple-300 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-500" /> Option C: Add Studio Starter ($29/mo, 10 GB) Alongside Existing Plans
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Retain your existing custom tier <strong>{plans[0]?.name}</strong> (${plans[0]?.priceMonthly}/mo) and add the official <strong>Studio Starter</strong> tier ($29/mo, $290/yr, 10 GB decimal allocation).
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleQuickCreateStarterPlan}
                  disabled={savingPlan}
                  className="px-4 py-2 text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white rounded-xl shadow-xs flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" /> {savingPlan ? 'Creating...' : '1-Click Create Studio Starter'}
                </button>
              </div>
            </div>
          )}

          {plans.length === 0 ? (
            /* REQUIRED EMPTY STATE: No predefined plans automatically inserted into Firestore */
            <div className="p-12 text-center rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-4 shadow-2xs">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-500 mx-auto flex items-center justify-center">
                <Layers className="w-7 h-7" />
              </div>
              <div className="space-y-1.5 max-w-md mx-auto">
                <h3 className="text-base font-serif font-bold text-zinc-900 dark:text-zinc-100">
                  No Subscription Plans in Firestore Catalog
                </h3>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  The database currently has no platform subscription plans. In accordance with zero-fabrication rules, default plans are not automatically seeded as database records. Authorized Super Admins can configure and save plans using the button below.
                </p>
              </div>

              <div className="pt-2 flex justify-center gap-3">
                <button
                  onClick={() => handleOpenCreatePlan(DEFAULT_PLAN_TEMPLATES[0])}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-2 shadow-xs"
                >
                  <Plus className="w-4 h-4" /> Create First Platform Plan
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {plans.map((p) => (
                <div
                  key={p.id}
                  className={`rounded-2xl border p-5 flex flex-col justify-between space-y-4 transition-all ${
                    p.status === 'active'
                      ? 'border-purple-500/30 bg-white dark:bg-zinc-900 shadow-sm'
                      : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 opacity-75'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] text-zinc-400">ID: {p.id}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        p.status === 'active'
                          ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                          : 'bg-zinc-500/10 text-zinc-500 border border-zinc-500/20'
                      }`}>
                        {p.status.toUpperCase()}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-lg font-serif font-bold text-zinc-900 dark:text-zinc-100">
                        {p.name}
                      </h3>
                      <p className="text-xs text-zinc-500 mt-1 line-clamp-2">
                        {p.description || 'No description provided.'}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
                      <div className="text-2xl font-bold font-serif text-zinc-900 dark:text-zinc-100">
                        {p.currency === 'USD' ? '$' : `${p.currency} `}{p.priceMonthly}
                        <span className="text-xs font-sans font-normal text-zinc-500"> / month</span>
                      </div>
                      <div className="text-[11px] text-zinc-400 mt-0.5">
                        Annual: {p.currency === 'USD' ? '$' : `${p.currency} `}{p.priceAnnual} / yr
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-2 text-xs">
                      <div className="flex items-center justify-between text-zinc-700 dark:text-zinc-300 font-medium">
                        <span className="flex items-center gap-1.5">
                          <HardDrive className="w-3.5 h-3.5 text-purple-500" /> Storage Limit:
                        </span>
                        <span className="font-mono">{formatBytes(p.storageLimitBytes)}</span>
                      </div>

                      <div className="flex items-center justify-between text-zinc-700 dark:text-zinc-300 font-medium">
                        <span className="flex items-center gap-1.5">
                          <Eye className="w-3.5 h-3.5 text-purple-500" /> Gallery Limit:
                        </span>
                        <span>{p.galleryLimit === -1 ? 'Unlimited' : `${p.galleryLimit} Collections`}</span>
                      </div>

                      <div className="flex items-center justify-between text-zinc-700 dark:text-zinc-300 font-medium">
                        <span className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-purple-500" /> Team Members:
                        </span>
                        <span>{p.maxTeamMembers === -1 ? 'Unlimited' : `${p.maxTeamMembers || 3} Members`}</span>
                      </div>
                    </div>

                    {p.supportedFeatures && p.supportedFeatures.length > 0 && (
                      <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80 space-y-1.5">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Features</div>
                        <ul className="text-[11px] text-zinc-600 dark:text-zinc-400 space-y-1">
                          {p.supportedFeatures.slice(0, 4).map((feat, idx) => (
                            <li key={idx} className="flex items-center gap-1.5">
                              <Check className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                              <span className="truncate">{feat}</span>
                            </li>
                          ))}
                          {p.supportedFeatures.length > 4 && (
                            <li className="text-[10px] text-zinc-400 italic">
                              +{p.supportedFeatures.length - 4} more features
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleTogglePlan(p)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                          p.status === 'active'
                            ? 'text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30'
                            : 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                        }`}
                      >
                        {p.status === 'active' ? 'Deactivate' : 'Activate'}
                      </button>

                      {p.status === 'inactive' && (
                        <button
                          onClick={() => handleDeletePlan(p)}
                          title="Delete Inactive Plan"
                          className="p-1.5 rounded-lg text-xs font-semibold text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <button
                      onClick={() => handleOpenEditPlan(p)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 flex items-center gap-1"
                    >
                      <Edit3 className="w-3.5 h-3.5" /> Edit Configuration
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: SUBSCRIPTION AUDIT TRAIL */}
      {/* ========================================================= */}
      {activeTab === 'audit' && (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden shadow-2xs space-y-4 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-serif font-bold text-zinc-900 dark:text-zinc-100">
                  Platform Administrative Audit Log
                </h2>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                  Showing {filteredAuditLogs.length} of {auditLogs.length} total events
                </span>
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">
                Immutable chronological record of administrative plan creations, assignments, tenant status changes, and quota adjustments
              </p>
            </div>

            <div className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl text-xs">
              <button
                onClick={() => setAuditFilter('all')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors flex items-center gap-1.5 ${
                  auditFilter === 'all'
                    ? 'bg-white dark:bg-zinc-900 text-purple-600 dark:text-purple-400 shadow-2xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
                }`}
              >
                <span>All</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  auditFilter === 'all'
                    ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300'
                    : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400'
                }`}>
                  {auditLogs.length}
                </span>
              </button>
              <button
                onClick={() => setAuditFilter('subscription')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors flex items-center gap-1.5 ${
                  auditFilter === 'subscription'
                    ? 'bg-white dark:bg-zinc-900 text-purple-600 dark:text-purple-400 shadow-2xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
                }`}
              >
                <span>Subscriptions</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  auditFilter === 'subscription'
                    ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300'
                    : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400'
                }`}>
                  {auditSubscriptionsCount}
                </span>
              </button>
              <button
                onClick={() => setAuditFilter('plan')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors flex items-center gap-1.5 ${
                  auditFilter === 'plan'
                    ? 'bg-white dark:bg-zinc-900 text-purple-600 dark:text-purple-400 shadow-2xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
                }`}
              >
                <span>Plans</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  auditFilter === 'plan'
                    ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300'
                    : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400'
                }`}>
                  {auditPlansCount}
                </span>
              </button>
              <button
                onClick={() => setAuditFilter('tenant')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors flex items-center gap-1.5 ${
                  auditFilter === 'tenant'
                    ? 'bg-white dark:bg-zinc-900 text-purple-600 dark:text-purple-400 shadow-2xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
                }`}
              >
                <span>Tenant Status</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  auditFilter === 'tenant'
                    ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300'
                    : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400'
                }`}>
                  {auditTenantsCount}
                </span>
              </button>
            </div>
          </div>

          {auditLogs.length === 0 ? (
            <div className="py-16 text-center space-y-2">
              <Clock className="w-8 h-8 text-zinc-400 mx-auto" />
              <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                No Platform Audit Events Yet
              </div>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                Privileged actions such as creating plans, modifying studio quotas, or changing tenant status will automatically generate immutable audit entries.
              </p>
            </div>
          ) : filteredAuditLogs.length === 0 ? (
            <div className="py-16 text-center space-y-3 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 mx-auto flex items-center justify-center">
                <Clock className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                  No matching audit records for "{auditFilter === 'subscription' ? 'Subscriptions' : auditFilter === 'plan' ? 'Plans' : 'Tenant Status'}"
                </div>
                <p className="text-xs text-zinc-500 max-w-md mx-auto">
                  {auditFilter === 'subscription' && 'No manual plan assignments, subscription status transitions, or storage quota modifications have been logged yet.'}
                  {auditFilter === 'plan' && 'No subscription plan definitions have been created, updated, or toggled in the catalog yet.'}
                  {auditFilter === 'tenant' && 'No tenant suspension or reactivation actions have been performed yet.'}
                </p>
              </div>
              <button
                onClick={() => setAuditFilter('all')}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 transition-colors"
              >
                View All {auditLogs.length} Records
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 dark:bg-zinc-800/40 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 font-semibold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-4 py-3">Actor Identity</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Target</th>
                    <th className="px-4 py-3">Administrative Note / Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                  {filteredAuditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                      <td className="px-4 py-3 font-mono text-[11px] text-zinc-400 whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>

                      <td className="px-4 py-3">
                        <div className="font-semibold text-zinc-800 dark:text-zinc-200">
                          {log.actorEmail}
                        </div>
                        <div className="text-[10px] font-mono text-zinc-400">
                          UID: {log.actorId ? log.actorId.slice(0, 10) + '...' : 'System'}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <Badge variant="purple">{log.action.replace(/_/g, ' ').toUpperCase()}</Badge>
                      </td>

                      <td className="px-4 py-3">
                        <div className="font-semibold text-zinc-800 dark:text-zinc-200">
                          {log.targetName}
                        </div>
                        <div className="text-[10px] text-zinc-400 capitalize">
                          {log.targetType.replace(/_/g, ' ')}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400 max-w-md">
                        {log.reason || 'No note recorded'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 4: BILLING & STORAGE BOUNDARY */}
      {/* ========================================================= */}
      {activeTab === 'boundary' && (
        <div className="space-y-4">
          <div className="p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xs space-y-2">
            <h2 className="text-base font-serif font-bold text-zinc-900 dark:text-zinc-100">
              Billing & Storage Infrastructure Boundaries
            </h2>
            <p className="text-xs text-zinc-500 leading-relaxed max-w-2xl">
              StudioCloud strictly documents the boundaries of its current phase. Automated charging and object storage measurement are intentionally disconnected to maintain zero paid billing requirements.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-5 rounded-2xl border border-amber-500/30 bg-amber-500/5 dark:bg-amber-950/15 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs text-amber-600 dark:text-amber-400 flex items-center gap-2">
                  <CreditCard className="w-4 h-4" /> Payment Gateway Integration
                </span>
                <Badge variant="amber">Not Connected</Badge>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                Stripe and Razorpay checkouts are intentionally disabled. No credit card information, bank accounts, recurring charges, or fabricated invoice records are generated. All subscription status changes represent manual administrative decisions.
              </p>
              <div className="text-[11px] font-mono text-zinc-500">
                Live Billing Active: <span className="text-rose-500 font-bold">FALSE</span>
              </div>
            </div>

            <div className="p-5 rounded-2xl border border-blue-500/30 bg-blue-500/5 dark:bg-blue-950/15 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs text-blue-600 dark:text-blue-400 flex items-center gap-2">
                  <HardDrive className="w-4 h-4" /> Cloud Storage Quota & Media
                </span>
                <Badge variant="blue">10 GB Decimal Planned</Badge>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                Default planned storage quota is preserved at <strong>10,000,000,000 bytes (10 GB decimal)</strong>. Media files are <strong>never automatically purged or deleted</strong> when a studio subscription expires or transitions to suspended.
              </p>
              <div className="text-[11px] font-mono text-zinc-500">
                Object Storage Attached: <span className="text-amber-500 font-bold">Not Connected</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: CREATE / EDIT PLAN (WITH LIVE PREVIEW) */}
      {/* ========================================================= */}
      {isPlanModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-3xl rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
              <div>
                <h3 className="text-lg font-serif font-bold text-zinc-900 dark:text-zinc-100">
                  {editingPlan ? `Edit Subscription Plan: ${editingPlan.name}` : 'Create New Subscription Plan'}
                </h3>
                <p className="text-xs text-zinc-500">
                  Configure pricing, quotas, and feature entitlements. Validated before saving.
                </p>
              </div>
              <button
                onClick={() => setIsPlanModalOpen(false)}
                className="p-1 text-zinc-400 hover:text-zinc-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {planFormError && (
              <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{planFormError}</span>
              </div>
            )}

            {!editingPlan && (
              <div className="p-3 rounded-2xl border border-purple-500/20 bg-purple-500/5 dark:bg-purple-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-purple-700 dark:text-purple-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Initial Starter Plan Template
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    Pre-fill Studio Starter ($29/mo, $290/yr, 10 GB decimal allocation, Active status)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPlanFormName('Studio Starter');
                    setPlanFormDesc('Essential client delivery & proofing for independent photographers');
                    setPlanFormPriceMonthly(29);
                    setPlanFormPriceAnnual(290);
                    setPlanFormCurrency('USD');
                    setPlanFormStorageGB(10);
                    setPlanFormGalleryLimit(15);
                    setPlanFormTeamLimit(3);
                    setPlanFormInterval('both');
                    setPlanFormStatus('active');
                    setPlanFormFeatures([
                      'Full Gallery Client Delivery',
                      'Client Proofing & Favourites',
                      'Custom Brand Watermark',
                      'Default 10 GB Allocation'
                    ]);
                  }}
                  className="px-3 py-1.5 text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-all shadow-2xs flex items-center gap-1.5 shrink-0"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" /> Pre-fill Studio Starter
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Form Controls */}
              <form onSubmit={handleSavePlan} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Plan Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Studio Pro"
                    value={planFormName}
                    onChange={(e) => setPlanFormName(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Description
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Brief description of intended audience..."
                    value={planFormDesc}
                    onChange={(e) => setPlanFormDesc(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                      Monthly Price ($) *
                    </label>
                    <input
                      type="number"
                      min={0}
                      required
                      value={planFormPriceMonthly}
                      onChange={(e) => setPlanFormPriceMonthly(Number(e.target.value))}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                      Annual Price ($) *
                    </label>
                    <input
                      type="number"
                      min={0}
                      required
                      value={planFormPriceAnnual}
                      onChange={(e) => setPlanFormPriceAnnual(Number(e.target.value))}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                      Currency *
                    </label>
                    <input
                      type="text"
                      maxLength={3}
                      required
                      value={planFormCurrency}
                      onChange={(e) => setPlanFormCurrency(e.target.value.toUpperCase())}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 uppercase focus:outline-hidden"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                      Storage (GB) *
                    </label>
                    <input
                      type="number"
                      min={1}
                      required
                      value={planFormStorageGB}
                      onChange={(e) => setPlanFormStorageGB(Number(e.target.value))}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden"
                    />
                    <span className="text-[10px] text-zinc-400 block truncate">{formatBytes(planFormStorageGB * 1000000000)}</span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                      Gallery Limit *
                    </label>
                    <input
                      type="number"
                      min={-1}
                      required
                      value={planFormGalleryLimit}
                      onChange={(e) => setPlanFormGalleryLimit(Number(e.target.value))}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden"
                    />
                    <span className="text-[10px] text-zinc-400 block truncate">
                      {planFormGalleryLimit === -1 ? 'Unlimited' : `${planFormGalleryLimit} coll.`}
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                      Team Members *
                    </label>
                    <input
                      type="number"
                      min={-1}
                      required
                      value={planFormTeamLimit}
                      onChange={(e) => setPlanFormTeamLimit(Number(e.target.value))}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden"
                    />
                    <span className="text-[10px] text-zinc-400 block truncate">
                      {planFormTeamLimit === -1 ? 'Unlimited' : `${planFormTeamLimit} seats`}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                      Billing Interval
                    </label>
                    <select
                      value={planFormInterval}
                      onChange={(e) => setPlanFormInterval(e.target.value as PlanBillingInterval)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                    >
                      <option value="both">Both (Monthly & Annual)</option>
                      <option value="monthly">Monthly Only</option>
                      <option value="annual">Annual Only</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                      Availability Status
                    </label>
                    <select
                      value={planFormStatus}
                      onChange={(e) => setPlanFormStatus(e.target.value as PlanStatus)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                    >
                      <option value="active">Active (Available)</option>
                      <option value="inactive">Inactive (Deactivated)</option>
                    </select>
                  </div>
                </div>

                {/* Features input */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Features Entitlements
                  </label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      placeholder="e.g. VIP Client Proofing"
                      value={newFeatureInput}
                      onChange={(e) => setNewFeatureInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddFeature(); } }}
                      className="flex-1 px-3 py-1.5 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                    />
                    <button
                      type="button"
                      onClick={handleAddFeature}
                      className="px-3 py-1.5 text-xs font-semibold bg-zinc-200 dark:bg-zinc-700 rounded-xl"
                    >
                      Add
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {planFormFeatures.map((feat) => (
                      <span
                        key={feat}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-500/20"
                      >
                        {feat}
                        <button
                          type="button"
                          onClick={() => handleRemoveFeature(feat)}
                          className="hover:text-rose-500"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPlanModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-zinc-500 hover:text-zinc-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingPlan}
                    className="px-5 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-xs"
                  >
                    {savingPlan ? 'Saving Plan...' : editingPlan ? 'Update Plan' : 'Save New Plan'}
                  </button>
                </div>
              </form>

              {/* LIVE CLIENT PREVIEW CARD */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-purple-500" /> Live Plan Card Preview
                </div>

                <div className="rounded-2xl border-2 border-purple-500/40 bg-zinc-50/50 dark:bg-zinc-950/50 p-5 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-semibold tracking-wider text-purple-600 dark:text-purple-400">
                      Tier Preview
                    </span>
                    <Badge variant={planFormStatus === 'active' ? 'emerald' : 'zinc'}>
                      {planFormStatus === 'active' ? 'Active Tier' : 'Inactive'}
                    </Badge>
                  </div>

                  <div>
                    <h4 className="text-xl font-serif font-bold text-zinc-900 dark:text-zinc-100">
                      {planFormName || 'Plan Name'}
                    </h4>
                    <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">
                      {planFormDesc || 'Plan description will appear here.'}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800">
                    <div className="text-3xl font-bold font-serif text-zinc-900 dark:text-zinc-100">
                      ${planFormPriceMonthly}
                      <span className="text-xs font-sans font-normal text-zinc-500"> / mo</span>
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      or ${planFormPriceAnnual} billed annually
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between font-medium text-zinc-700 dark:text-zinc-300">
                      <span>Cloud Storage:</span>
                      <span className="font-mono">{formatBytes(planFormStorageGB * 1000000000)}</span>
                    </div>
                    <div className="flex justify-between font-medium text-zinc-700 dark:text-zinc-300">
                      <span>Galleries Allowed:</span>
                      <span>{planFormGalleryLimit === -1 ? 'Unlimited' : `${planFormGalleryLimit} Collections`}</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 space-y-1.5">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Features Included</div>
                    <ul className="text-xs text-zinc-600 dark:text-zinc-400 space-y-1">
                      {planFormFeatures.map((f, i) => (
                        <li key={i} className="flex items-center gap-1.5">
                          <Check className="w-3 h-3 text-emerald-500" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: MANAGE STUDIO SUBSCRIPTION */}
      {/* ========================================================= */}
      {subModalStudio && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
              <div>
                <h3 className="text-base font-serif font-bold text-zinc-900 dark:text-zinc-100">
                  Manage Studio Subscription
                </h3>
                <p className="text-xs text-zinc-500">
                  Tenant: <strong className="text-zinc-900 dark:text-zinc-100">{subModalStudio.name}</strong> ({subModalStudio.id})
                </p>
              </div>
              <button
                onClick={() => setSubModalStudio(null)}
                className="p-1 text-zinc-400 hover:text-zinc-600 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {subModalError && (
              <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{subModalError}</span>
              </div>
            )}

            {subConfirmStep ? (
              <div className="space-y-4">
                {subModalStudio && (!subModalStudio.subscription?.planId || subModalStudio.plan === 'starter') && subTargetPlanId === 'basic' ? (
                  <div className="p-4 rounded-2xl border border-purple-500/30 bg-purple-500/10 text-xs text-purple-900 dark:text-purple-200 space-y-1">
                    <div className="font-semibold flex items-center gap-1.5 text-purple-900 dark:text-purple-100">
                      <CheckCircle2 className="w-4 h-4 text-purple-600 shrink-0" />
                      Legacy Subscription Migration Review
                    </div>
                    <p className="text-[11px] leading-relaxed">
                      Migrating <strong>{subModalStudio.name}</strong> from unassigned legacy 'starter' to catalog plan <strong>Basic</strong> (Document ID: <code className="font-mono">basic</code>). The studio's existing 10 GB quota and {subTargetStatus} status will be strictly preserved.
                    </p>
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-800 dark:text-amber-200 space-y-1">
                    <div className="font-semibold flex items-center gap-1.5 text-amber-900 dark:text-amber-100">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      Confirmation Required: Plan Reassignment
                    </div>
                    <p className="text-[11px] leading-relaxed">
                      Review proposed subscription and quota modifications for <strong>{subModalStudio.name}</strong>. Canceling preserves the current subscription without changes.
                    </p>
                  </div>
                )}

                {/* Comparison Diff Table */}
                <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden divide-y divide-zinc-200 dark:divide-zinc-800 text-xs">
                  <div className="grid grid-cols-3 p-3 bg-zinc-50 dark:bg-zinc-800/50 font-semibold text-zinc-500 text-[11px]">
                    <div>Parameter</div>
                    <div>Current Setting</div>
                    <div className="text-purple-600 dark:text-purple-400">Proposed New Setting</div>
                  </div>

                  <div className="grid grid-cols-3 p-3 items-center">
                    <div className="font-medium text-zinc-600 dark:text-zinc-400">Plan Tier</div>
                    <div className="text-zinc-800 dark:text-zinc-200">
                      <span className="font-semibold">{subModalStudio.subscription?.planName || subModalStudio.plan || 'Starter'}</span>
                      <span className="block text-[10px] font-mono text-zinc-400">
                        Document ID: {subModalStudio.subscription?.planId || subModalStudio.plan || 'starter'}
                      </span>
                    </div>
                    <div className="text-purple-600 dark:text-purple-400">
                      <span className="font-bold">{plans.find(p => p.id === subTargetPlanId)?.name || subTargetPlanId}</span>
                      <span className="block text-[10px] font-mono text-purple-500 font-semibold">
                        Document ID: {subTargetPlanId}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 p-3 items-center">
                    <div className="font-medium text-zinc-600 dark:text-zinc-400">Subscription Status</div>
                    <div>
                      {getStatusBadge(subModalStudio.subscription?.status || (subModalStudio.status === 'suspended' ? 'suspended' : 'active'))}
                    </div>
                    <div>
                      {getStatusBadge(subTargetStatus)}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 p-3 items-center">
                    <div className="font-medium text-zinc-600 dark:text-zinc-400">Storage Allocation</div>
                    <div className="font-mono text-zinc-800 dark:text-zinc-200">
                      {formatBytes(subModalStudio.storageAllocationBytes || 10000000000)}
                    </div>
                    <div className="font-mono font-bold text-purple-600 dark:text-purple-400">
                      {formatBytes(subTargetStorageGB * 1000000000)}
                      {plans.find(p => p.id === subTargetPlanId) && (
                        <span className="block text-[10px] font-sans font-normal text-zinc-400">
                          (Derived from {plans.find(p => p.id === subTargetPlanId)?.name} catalog quota: {formatBytes(plans.find(p => p.id === subTargetPlanId)!.storageLimitBytes)})
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 p-3 items-center">
                    <div className="font-medium text-zinc-600 dark:text-zinc-400">Billing Interval</div>
                    <div className="capitalize text-zinc-800 dark:text-zinc-200">
                      {subModalStudio.subscription?.billingInterval || 'monthly'}
                    </div>
                    <div className="capitalize font-semibold text-purple-600 dark:text-purple-400">
                      {subTargetBillingInterval}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 p-3 items-center">
                    <div className="font-medium text-zinc-600 dark:text-zinc-400">Expiration Date</div>
                    <div className="text-zinc-800 dark:text-zinc-200 text-[11px]">
                      {subModalStudio.subscription?.expiryDate ? new Date(subModalStudio.subscription.expiryDate).toLocaleDateString() : 'No Expiry'}
                    </div>
                    <div className="font-semibold text-purple-600 dark:text-purple-400 text-[11px]">
                      {subTargetExpiry ? new Date(subTargetExpiry).toLocaleDateString() : 'No Expiry'}
                    </div>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 space-y-1.5 text-xs">
                  <div className="font-semibold text-zinc-700 dark:text-zinc-300">
                    Administrator Note for Audit Trail:
                  </div>
                  <div className="p-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 font-mono text-[11px]">
                    {subReason}
                  </div>
                  <div className="text-[10px] text-zinc-500 pt-0.5">
                    Authorized Super Admin: <span className="font-semibold text-zinc-700 dark:text-zinc-300">{user?.email || 'Super Admin'}</span> • Payment Status: <span className="font-mono font-semibold text-purple-600 dark:text-purple-400">manual_admin_override</span> (Not connected to payment gateway)
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setSubConfirmStep(false)}
                    className="px-3.5 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 bg-zinc-100 dark:bg-zinc-800 rounded-xl"
                  >
                    ← Back to Edit
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSubConfirmStep(false);
                        setSubModalStudio(null);
                      }}
                      className="px-4 py-2 text-xs font-semibold text-zinc-500 hover:text-zinc-700"
                    >
                      Cancel & Keep Current
                    </button>

                    <button
                      type="button"
                      onClick={handleExecuteSubscriptionUpdate}
                      disabled={savingSubscription}
                      className="px-5 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-xs flex items-center gap-1.5"
                    >
                      {savingSubscription ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Saving...
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" /> Confirm & Apply Plan Reassignment
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleProceedToConfirmSubscription} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                      Assign Plan Tier
                    </label>
                    <select
                      value={subTargetPlanId}
                      onChange={(e) => handleSelectPlanForSubscription(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                    >
                      {/* Current studio plan if not present in the persisted catalog */}
                      {subModalStudio && subTargetPlanId && !plans.some(p => p.id === subTargetPlanId) && (
                        <option value={subTargetPlanId} disabled>
                          Current: {subModalStudio.subscription?.planName || subModalStudio.plan || 'Starter'} ({formatBytes(subModalStudio.storageAllocationBytes || 10000000000)}) — Legacy / Unassigned
                        </option>
                      )}
                      {plans.length > 0 ? (
                        plans.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({formatBytes(p.storageLimitBytes)}) — ${p.priceMonthly}/mo [ID: {p.id}]
                          </option>
                        ))
                      ) : (
                        <option value="" disabled>
                          No subscription plans configured in catalog
                        </option>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                      Subscription Status
                    </label>
                    <select
                      value={subTargetStatus}
                      onChange={(e) => setSubTargetStatus(e.target.value as SubscriptionStatus)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                    >
                      <option value="active">Active</option>
                      <option value="trial">Trial</option>
                      <option value="past_due">Past Due</option>
                      <option value="suspended">Suspended</option>
                      <option value="expired">Expired</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                      Storage Quota (GB)
                    </label>
                    <input
                      type="number"
                      min={1}
                      required
                      value={subTargetStorageGB}
                      onChange={(e) => setSubTargetStorageGB(Number(e.target.value))}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                    />
                    <span className="text-[10px] text-zinc-400">
                      {formatBytes(subTargetStorageGB * 1000000000)} decimal
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                      Expiry Date (Optional)
                    </label>
                    <input
                      type="date"
                      value={subTargetExpiry}
                      onChange={(e) => setSubTargetExpiry(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Administrative Reason / Note *
                  </label>
                  <textarea
                    rows={2}
                    required
                    placeholder="e.g. Upgraded to Pro per manual client invoice; verified terms compliance..."
                    value={subReason}
                    onChange={(e) => setSubReason(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden"
                  />
                  <span className="text-[10px] text-zinc-400">
                    Mandatory for all manual administrative plan adjustments and audit history records.
                  </span>
                </div>

                <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 text-[11px] text-zinc-600 dark:text-zinc-400 space-y-1">
                  <div className="font-semibold text-zinc-800 dark:text-zinc-200">
                    Truth in Billing Transparency:
                  </div>
                  <p>
                    Payment status will be recorded as <strong>Manual Admin Override</strong>. StudioCloud does not claim automated Stripe/Razorpay receipt or charge without real payment gateway verification.
                  </p>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setSubModalStudio(null)}
                    className="px-4 py-2 text-xs font-semibold text-zinc-500 hover:text-zinc-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-xs flex items-center gap-1.5"
                  >
                    Review & Confirm Assignment →
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: STUDIO TENANT DETAILS & STATUS INSPECTION */}
      {/* ========================================================= */}
      {detailStudio && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-2xl rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-2.5">
                <span 
                  className="w-3.5 h-3.5 rounded-full"
                  style={{ backgroundColor: detailStudio.branding?.accentColor || '#c5a059' }} 
                />
                <div>
                  <h3 className="text-base font-serif font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                    {detailStudio.name}
                    <Badge variant={(detailStudio.status === 'suspended' || detailStudio.subscription?.status === 'suspended') ? 'rose' : 'emerald'}>
                      {((detailStudio.status || 'active')).toUpperCase()}
                    </Badge>
                  </h3>
                  <p className="text-xs text-zinc-500 font-mono">
                    ID: {detailStudio.id} • Slug: /{detailStudio.slug}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDetailStudio(null)}
                className="p-1 text-zinc-400 hover:text-zinc-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {statusUpdateError && (
              <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{statusUpdateError}</span>
              </div>
            )}

            {/* Verified Tenant Record Banner */}
            <div className="p-3.5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-800 dark:text-emerald-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div>
                  <span className="font-semibold">Verified Registered Studio Tenant</span>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Existing studio record persisted in Firestore database. Validated multi-tenant isolation and owner credentials.
                  </p>
                </div>
              </div>
              <Badge variant="emerald">Verified Tenant</Badge>
            </div>

            {/* Profile Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 space-y-1">
                <div className="text-[10px] uppercase font-semibold text-zinc-400">Owner UID & Identity</div>
                <div className="font-mono text-zinc-800 dark:text-zinc-200 truncate select-all">
                  {detailStudio.ownerId || 'Not Set'}
                </div>
                <div className="text-[11px] text-zinc-500">
                  {detailStudio.branding?.contactEmail || 'No contact email recorded'}
                </div>
              </div>

              <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 space-y-1">
                <div className="text-[10px] uppercase font-semibold text-zinc-400">Current Assigned Plan</div>
                <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100 capitalize">
                  {detailStudio.subscription?.planName || detailStudio.plan || 'Studio Starter'}
                </div>
                <div className="text-[11px] text-zinc-500">
                  Quota: <span className="font-mono">{formatBytes(detailStudio.storageAllocationBytes || 10000000000)}</span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 space-y-1">
                <div className="text-[10px] uppercase font-semibold text-zinc-400">Branding & Vanity Subdomain</div>
                <div className="text-zinc-800 dark:text-zinc-200">
                  Color: <span className="font-mono">{detailStudio.branding?.accentColor || '#c5a059'}</span>
                </div>
                <div className="text-[11px] text-zinc-500">
                  Watermark: {detailStudio.branding?.watermarkText || 'None'}
                </div>
              </div>

              <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 space-y-1">
                <div className="text-[10px] uppercase font-semibold text-zinc-400">Registration Timestamps</div>
                <div className="text-zinc-800 dark:text-zinc-200 text-[11px]">
                  Created: {new Date(detailStudio.createdAt).toLocaleString()}
                </div>
                <div className="text-[11px] text-zinc-500">
                  Updated: {new Date(detailStudio.updatedAt).toLocaleString()}
                </div>
              </div>
            </div>

            {/* Tenant Status Management Control */}
            <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-purple-500" />
                  Administrative Tenant Status Control
                </div>
                <span className="text-[11px] text-zinc-500">
                  Current Status: <strong className="text-zinc-900 dark:text-zinc-100 capitalize">{detailStudio.status || 'active'}</strong>
                </span>
              </div>

              <p className="text-[11px] text-zinc-500">
                Suspending a tenant prevents studio members from performing mutations and halts new media uploads while strictly preserving existing records and uploaded assets.
              </p>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                  Mandatory Administrative Reason *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Terms violation review; temporary suspension per client request..."
                  value={statusChangeReason}
                  onChange={(e) => setStatusChangeReason(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                {detailStudio.status === 'suspended' ? (
                  <button
                    onClick={() => handleToggleTenantStatus('active')}
                    disabled={updatingStatus}
                    className="px-3.5 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-2xs"
                  >
                    {updatingStatus ? 'Updating...' : 'Reactivate Studio Tenant'}
                  </button>
                ) : (
                  <button
                    onClick={() => handleToggleTenantStatus('suspended')}
                    disabled={updatingStatus}
                    className="px-3.5 py-1.5 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-2xs"
                  >
                    {updatingStatus ? 'Updating...' : 'Suspend Studio Tenant'}
                  </button>
                )}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-2 flex items-center justify-between border-t border-zinc-100 dark:border-zinc-800">
              <button
                onClick={() => {
                  const s = detailStudio;
                  setDetailStudio(null);
                  handleOpenSubscriptionModal(s);
                }}
                className="px-3.5 py-1.5 text-xs font-semibold bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 hover:bg-purple-100 rounded-xl flex items-center gap-1.5"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" /> Manage Subscription & Plan
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDetailStudio(null)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-700"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    const s = detailStudio;
                    setDetailStudio(null);
                    onInspectStudio(s);
                  }}
                  className="px-4 py-1.5 text-xs font-semibold bg-zinc-900 hover:bg-black dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 rounded-xl flex items-center gap-1.5 shadow-2xs"
                >
                  Inspect Studio Workspace <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

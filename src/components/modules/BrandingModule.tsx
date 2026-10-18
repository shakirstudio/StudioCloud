import React, { useState, useEffect, useMemo } from 'react';
import { 
  Palette, 
  Save, 
  Check, 
  Globe, 
  Mail, 
  Phone, 
  ExternalLink, 
  Sparkles, 
  Eye, 
  FileText, 
  RotateCcw, 
  Image as ImageIcon, 
  Building2, 
  Clock, 
  DollarSign, 
  Calendar, 
  MapPin, 
  ShieldCheck, 
  AlertCircle, 
  Lock, 
  CheckCircle2, 
  Upload, 
  Trash2, 
  Info, 
  Layout, 
  Sliders, 
  Type, 
  Sun, 
  Moon, 
  X
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { 
  updateStudio, 
  DEFAULT_STUDIO_BRANDING, 
  SUPPORTED_FONTS, 
  isValidHexColor, 
  getFontFamilyStyle 
} from '../../services/studioService';
import { 
  SupportedFontFamily, 
  LogoPlacement, 
  GalleryCoverStyle, 
  GalleryTheme, 
  StudioBranding, 
  StudioRegionalPreferences, 
  StudioBusinessDetails 
} from '../../types';
import { Badge } from '../common/Badge';

const LUXURY_PALETTES = [
  { name: 'Champagne Gold', hex: '#c5a059', preview: '#c5a059' },
  { name: 'Nordic Sage', hex: '#52796f', preview: '#52796f' },
  { name: 'Obsidian Noir', hex: '#27272a', preview: '#27272a' },
  { name: 'Royal Indigo', hex: '#31425f', preview: '#31425f' },
  { name: 'Tuscan Terracotta', hex: '#a65b45', preview: '#a65b45' },
  { name: 'Emerald Luxury', hex: '#059669', preview: '#059669' },
  { name: 'Crimson Velvet', hex: '#dc2626', preview: '#dc2626' },
];

const SECONDARY_PALETTES = [
  { name: 'Zinc Charcoal', hex: '#27272a' },
  { name: 'Slate Gray', hex: '#334155' },
  { name: 'Warm Stone', hex: '#78716c' },
  { name: 'Pure White', hex: '#ffffff' },
  { name: 'Cream Ivory', hex: '#fef3c7' },
];

const GALLERY_BG_PALETTES = [
  { name: 'Darkroom Noir', hex: '#09090b', theme: 'dark' },
  { name: 'Deep Charcoal', hex: '#18181b', theme: 'dark' },
  { name: 'Midnight Slate', hex: '#0f172a', theme: 'dark' },
  { name: 'Editorial White', hex: '#ffffff', theme: 'light' },
  { name: 'Fine Art Linen', hex: '#fafaf9', theme: 'light' },
];

const TIMEZONES = [
  { value: 'UTC', label: 'UTC (Universal Coordinated Time)' },
  { value: 'America/New_York', label: 'Eastern Time (US & Canada) - New York' },
  { value: 'America/Chicago', label: 'Central Time (US & Canada) - Chicago' },
  { value: 'America/Denver', label: 'Mountain Time (US & Canada) - Denver' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (US & Canada) - Los Angeles' },
  { value: 'Europe/London', label: 'London, Edinburgh, Dublin (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris, Berlin, Rome, Madrid (CET/CEST)' },
  { value: 'Asia/Dubai', label: 'Dubai, Abu Dhabi (GST)' },
  { value: 'Asia/Kolkata', label: 'India Standard Time (IST) - Mumbai, Delhi' },
  { value: 'Asia/Singapore', label: 'Singapore, Hong Kong (SGT/HKT)' },
  { value: 'Asia/Tokyo', label: 'Tokyo, Seoul (JST/KST)' },
  { value: 'Australia/Sydney', label: 'Sydney, Melbourne (AEST/AEDT)' },
];

const CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar (USD)' },
  { code: 'EUR', symbol: '€', name: 'Euro (EUR)' },
  { code: 'GBP', symbol: '£', name: 'British Pound (GBP)' },
  { code: 'CAD', symbol: '$', name: 'Canadian Dollar (CAD)' },
  { code: 'AUD', symbol: '$', name: 'Australian Dollar (AUD)' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee (INR)' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen (JPY)' },
];

export const BrandingModule: React.FC = () => {
  const { activeStudio, reloadStudios, isSuperAdmin, activeRole } = useAuth();
  
  // Navigation Sub-Tabs
  const [activeTab, setActiveTab] = useState<'profile' | 'branding' | 'preferences' | 'domain'>('profile');

  // Loading & In-Flight Feedback
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Live Client Gallery Preview Modal
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);

  // Local file logo preview (in-browser)
  const [localLogoPreview, setLocalLogoPreview] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    // Studio Profile
    name: activeStudio?.name || '',
    displayName: activeStudio?.displayName || activeStudio?.name || '',
    slug: activeStudio?.slug || '',
    description: activeStudio?.description || '',
    
    // Logo & Visual Branding
    logoUrl: activeStudio?.branding?.logoUrl || '',
    logoPlacement: (activeStudio?.branding?.logoPlacement || 'left') as LogoPlacement,
    fontFamily: (activeStudio?.branding?.fontFamily || 'serif') as SupportedFontFamily,
    coverStyle: (activeStudio?.branding?.coverStyle || 'hero_gradient') as GalleryCoverStyle,
    galleryTheme: (activeStudio?.branding?.galleryTheme || 'dark') as GalleryTheme,

    // Colors
    accentColor: activeStudio?.branding?.accentColor || '#c5a059',
    secondaryColor: activeStudio?.branding?.secondaryColor || '#27272a',
    galleryBackgroundColor: activeStudio?.branding?.galleryBackgroundColor || '#09090b',
    galleryAccentColor: activeStudio?.branding?.galleryAccentColor || '#c5a059',

    // Watermark & Footer
    watermarkText: activeStudio?.branding?.watermarkText || `${activeStudio?.name || 'Studio'} Photography • PROOF`,
    footerText: activeStudio?.branding?.footerText || `© ${new Date().getFullYear()} ${activeStudio?.name || 'Studio'}. All rights reserved.`,

    // Contact Details
    contactEmail: activeStudio?.branding?.contactEmail || '',
    phone: activeStudio?.branding?.phone || '',
    address: activeStudio?.branding?.address || '',
    website: activeStudio?.branding?.website || '',

    // Business & Invoicing
    taxId: activeStudio?.businessDetails?.taxId || '',
    registrationNumber: activeStudio?.businessDetails?.registrationNumber || '',
    billingAddress: activeStudio?.businessDetails?.billingAddress || '',

    // Regional & Localization
    timezone: activeStudio?.regionalPreferences?.timezone || 'UTC',
    currency: activeStudio?.regionalPreferences?.currency || 'USD',
    dateFormat: activeStudio?.regionalPreferences?.dateFormat || 'YYYY-MM-DD',
  });

  // Keep form in sync when activeStudio changes
  useEffect(() => {
    if (activeStudio) {
      setFormData({
        name: activeStudio.name || '',
        displayName: activeStudio.displayName || activeStudio.name || '',
        slug: activeStudio.slug || '',
        description: activeStudio.description || '',
        logoUrl: activeStudio.branding?.logoUrl || '',
        logoPlacement: (activeStudio.branding?.logoPlacement || 'left') as LogoPlacement,
        fontFamily: (activeStudio.branding?.fontFamily || 'serif') as SupportedFontFamily,
        coverStyle: (activeStudio.branding?.coverStyle || 'hero_gradient') as GalleryCoverStyle,
        galleryTheme: (activeStudio.branding?.galleryTheme || 'dark') as GalleryTheme,
        accentColor: activeStudio.branding?.accentColor || '#c5a059',
        secondaryColor: activeStudio.branding?.secondaryColor || '#27272a',
        galleryBackgroundColor: activeStudio.branding?.galleryBackgroundColor || '#09090b',
        galleryAccentColor: activeStudio.branding?.galleryAccentColor || '#c5a059',
        watermarkText: activeStudio.branding?.watermarkText || `${activeStudio.name || 'Studio'} Photography • PROOF`,
        footerText: activeStudio.branding?.footerText || `© ${new Date().getFullYear()} ${activeStudio.name || 'Studio'}. All rights reserved.`,
        contactEmail: activeStudio.branding?.contactEmail || '',
        phone: activeStudio.branding?.phone || '',
        address: activeStudio.branding?.address || '',
        website: activeStudio.branding?.website || '',
        taxId: activeStudio.businessDetails?.taxId || '',
        registrationNumber: activeStudio.businessDetails?.registrationNumber || '',
        billingAddress: activeStudio.businessDetails?.billingAddress || '',
        timezone: activeStudio.regionalPreferences?.timezone || 'UTC',
        currency: activeStudio.regionalPreferences?.currency || 'USD',
        dateFormat: activeStudio.regionalPreferences?.dateFormat || 'YYYY-MM-DD',
      });
    }
  }, [activeStudio?.id]);

  if (!activeStudio) {
    return (
      <div className="p-8 text-center text-zinc-500">
        No active studio selected.
      </div>
    );
  }

  const isOwner = activeRole === 'owner' || isSuperAdmin;

  // Handle local logo file selection
  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setSaveError('Logo file size must be under 5 MB.');
        return;
      }
      const previewUrl = URL.createObjectURL(file);
      setLocalLogoPreview(previewUrl);
      setFormData((prev) => ({ ...prev, logoUrl: previewUrl }));
    }
  };

  // Color validation helpers
  const accentValid = isValidHexColor(formData.accentColor);
  const secondaryValid = isValidHexColor(formData.secondaryColor);
  const bgValid = isValidHexColor(formData.galleryBackgroundColor);
  const galleryAccentValid = isValidHexColor(formData.galleryAccentColor);

  // Reset to Defaults
  const handleResetDefaults = () => {
    setFormData((prev) => ({
      ...prev,
      accentColor: DEFAULT_STUDIO_BRANDING.accentColor,
      secondaryColor: DEFAULT_STUDIO_BRANDING.secondaryColor || '#27272a',
      galleryBackgroundColor: DEFAULT_STUDIO_BRANDING.galleryBackgroundColor || '#09090b',
      galleryAccentColor: DEFAULT_STUDIO_BRANDING.galleryAccentColor || '#c5a059',
      fontFamily: DEFAULT_STUDIO_BRANDING.fontFamily || 'serif',
      coverStyle: DEFAULT_STUDIO_BRANDING.coverStyle || 'hero_gradient',
      galleryTheme: DEFAULT_STUDIO_BRANDING.galleryTheme || 'dark',
      logoPlacement: DEFAULT_STUDIO_BRANDING.logoPlacement || 'left',
      watermarkText: `${activeStudio.name} Photography • PROOF`,
      footerText: `© ${new Date().getFullYear()} ${activeStudio.name}. All rights reserved.`,
    }));
    setResetModalOpen(false);
  };

  // Handle Form Submission
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeStudio) return;

    if (!isOwner) {
      setSaveError('Only authorized studio owners can modify studio settings & branding.');
      return;
    }

    // Validation
    const cleanName = formData.name.trim();
    if (cleanName.length < 2) {
      setSaveError('Studio name must be at least 2 characters.');
      return;
    }

    if (!accentValid || !secondaryValid || !bgValid || !galleryAccentValid) {
      setSaveError('One or more brand colour values are invalid HEX codes (e.g. #c5a059).');
      return;
    }

    const cleanSlug = formData.slug
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, '-');

    if (cleanSlug.length < 2) {
      setSaveError('Vanity slug must be at least 2 characters.');
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const updatedBranding: StudioBranding = {
        accentColor: formData.accentColor.trim(),
        primaryColor: formData.accentColor.trim(),
        secondaryColor: formData.secondaryColor.trim(),
        galleryBackgroundColor: formData.galleryBackgroundColor.trim(),
        galleryAccentColor: formData.galleryAccentColor.trim(),
        logoUrl: formData.logoUrl.trim() || undefined,
        logoPlacement: formData.logoPlacement,
        fontFamily: formData.fontFamily,
        coverStyle: formData.coverStyle,
        galleryTheme: formData.galleryTheme,
        watermarkText: formData.watermarkText.trim() || undefined,
        contactEmail: formData.contactEmail.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        address: formData.address.trim() || undefined,
        website: formData.website.trim() || undefined,
        footerText: formData.footerText.trim() || undefined,
      };

      const updatedRegional: StudioRegionalPreferences = {
        timezone: formData.timezone,
        currency: formData.currency,
        dateFormat: formData.dateFormat,
      };

      const updatedBusiness: StudioBusinessDetails = {
        taxId: formData.taxId.trim() || undefined,
        registrationNumber: formData.registrationNumber.trim() || undefined,
        billingAddress: formData.billingAddress.trim() || undefined,
      };

      await updateStudio(activeStudio.id, {
        name: cleanName,
        displayName: formData.displayName.trim() || cleanName,
        slug: cleanSlug,
        description: formData.description.trim() || undefined,
        branding: updatedBranding,
        regionalPreferences: updatedRegional,
        businessDetails: updatedBusiness,
      });

      await reloadStudios();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: any) {
      console.error('Error saving studio settings:', err);
      setSaveError(err?.message || 'Failed to persist studio settings to Firestore.');
    } finally {
      setIsSaving(false);
    }
  };

  const currentFontFamilyStyle = useMemo(() => {
    return getFontFamilyStyle(formData.fontFamily);
  }, [formData.fontFamily]);

  return (
    <div className="space-y-6 pb-16 max-w-5xl">
      {/* Top Header & Live Preview Trigger */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-serif font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
              Studio Settings & Branding
            </h1>
            <Badge variant="amber" size="sm">
              Customizer
            </Badge>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Configure studio identity, luxury brand colors, typography, client portal appearance, and business preferences for {activeStudio.name}.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPreviewModalOpen(true)}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 transition-colors flex items-center gap-1.5 shadow-2xs"
          >
            <Eye className="w-4 h-4 text-amber-500" />
            Live Gallery Preview
          </button>

          <button
            type="button"
            onClick={() => setResetModalOpen(true)}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors flex items-center gap-1.5"
            title="Reset Branding to Defaults"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Defaults
          </button>
        </div>
      </div>

      {/* Role permission badge if not owner */}
      {!isOwner && (
        <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-2">
          <Lock className="w-4 h-4 flex-shrink-0" />
          <span>You are viewing studio settings in read-only mode. Only the authorized studio owner can modify brand settings.</span>
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-2 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveTab('profile')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'profile'
              ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-2xs'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white bg-zinc-100 dark:bg-zinc-850/60'
          }`}
        >
          <Building2 className="w-4 h-4" />
          Studio Profile & Logo
        </button>

        <button
          onClick={() => setActiveTab('branding')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'branding'
              ? 'bg-amber-500 text-zinc-950 font-bold shadow-2xs'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white bg-zinc-100 dark:bg-zinc-850/60'
          }`}
        >
          <Palette className="w-4 h-4" />
          Branding Customization
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
          Regional & Business
        </button>

        <button
          onClick={() => setActiveTab('domain')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'domain'
              ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-2xs'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white bg-zinc-100 dark:bg-zinc-850/60'
          }`}
        >
          <Globe className="w-4 h-4" />
          Domain & Infrastructure
        </button>
      </div>

      {/* Global Error Banner */}
      {saveError && (
        <div className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs text-rose-500 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{saveError}</span>
          </div>
          <button onClick={() => setSaveError(null)} className="text-rose-400 hover:text-rose-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Global Success Banner */}
      {saveSuccess && (
        <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>Studio settings, profile, and branding customization persisted to Firestore!</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* ==================================================== */}
        {/* TAB 1: STUDIO PROFILE & LOGO */}
        {/* ==================================================== */}
        {activeTab === 'profile' && (
          <div className="space-y-6">
            {/* Identity Card */}
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-4 shadow-2xs">
              <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
                <h2 className="text-base font-serif font-bold text-zinc-900 dark:text-zinc-100">
                  Studio Identity & Vanity URL
                </h2>
                <Badge variant="slate" size="sm">Multi-Tenant Partitioned</Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Studio Legal / Business Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    disabled={!isOwner}
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Display / Brand Name (Shown to Clients)
                  </label>
                  <input
                    type="text"
                    disabled={!isOwner}
                    placeholder="e.g. Vance Fine Art & Weddings"
                    value={formData.displayName}
                    onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 disabled:opacity-60"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Tenant Slug (Public Vanity URL) <span className="text-rose-500">*</span>
                </label>
                <div className="flex items-center">
                  <span className="px-3 py-2 text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-500 border border-r-0 border-zinc-200 dark:border-zinc-700 rounded-l-xl font-mono">
                    studiocloud.io/p/
                  </span>
                  <input
                    type="text"
                    required
                    disabled={!isOwner}
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-r-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-mono disabled:opacity-60"
                  />
                </div>
                <p className="text-[10px] text-zinc-400 mt-1">
                  Unique subdomain path used for client-facing gallery delivery links.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Studio Bio & Description
                </label>
                <textarea
                  rows={3}
                  disabled={!isOwner}
                  placeholder="Tell clients about your photography style, years of experience, editorial philosophy, and specialties..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 disabled:opacity-60"
                />
              </div>
            </div>

            {/* Studio Logo & Visual Assets */}
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-4 shadow-2xs">
              <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
                <div>
                  <h2 className="text-base font-serif font-bold text-zinc-900 dark:text-zinc-100">
                    Studio Brand Logo
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Displayed in the client gallery header, invoice letterheads, and navigation bar
                  </p>
                </div>
                {formData.logoUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setFormData({ ...formData, logoUrl: '' });
                      setLocalLogoPreview(null);
                    }}
                    className="text-xs text-rose-500 hover:text-rose-600 flex items-center gap-1 font-semibold"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Remove Logo
                  </button>
                )}
              </div>

              {/* Logo Preview Display */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 p-4 rounded-xl border border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-850/40">
                <div className="w-24 h-24 rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center overflow-hidden flex-shrink-0 shadow-inner">
                  {formData.logoUrl ? (
                    <img 
                      src={formData.logoUrl} 
                      alt="Studio Logo Preview" 
                      className="w-full h-full object-contain p-2"
                    />
                  ) : (
                    <div className="text-center p-2">
                      <ImageIcon className="w-8 h-8 text-zinc-400 mx-auto mb-1" />
                      <span className="text-[9px] text-zinc-400 font-semibold block">No Logo</span>
                    </div>
                  )}
                </div>

                <div className="space-y-3 flex-1 min-w-0">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                      External Image URL (Recommended for Multi-Device)
                    </label>
                    <input
                      type="url"
                      disabled={!isOwner}
                      placeholder="https://example.com/logo.png"
                      value={formData.logoUrl}
                      onChange={(e) => {
                        setFormData({ ...formData, logoUrl: e.target.value });
                        setLocalLogoPreview(null);
                      }}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 disabled:opacity-60"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                      Or Choose File (In-Browser Local Preview)
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={!isOwner}
                      onChange={handleLogoFileChange}
                      className="text-xs text-zinc-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-zinc-900 file:text-white dark:file:bg-zinc-100 dark:file:text-zinc-900 hover:file:opacity-90 cursor-pointer"
                    />
                  </div>

                  {/* Storage constraint transparency notice */}
                  <div className="p-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 text-[11px] text-zinc-600 dark:text-zinc-400 flex items-start gap-2">
                    <Info className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Cloud Storage: Not Connected.</strong> To maintain free tier zero-billing status, uploaded image files are rendered in-browser for preview. For persistent multi-device display, provide a hosted image URL.
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Studio Contact Information */}
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-4 shadow-2xs">
              <h2 className="text-base font-serif font-bold text-zinc-900 dark:text-zinc-100">
                Contact & Studio Address
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Contact Email
                  </label>
                  <input
                    type="email"
                    disabled={!isOwner}
                    placeholder="studio@example.com"
                    value={formData.contactEmail}
                    onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Studio Phone
                  </label>
                  <input
                    type="tel"
                    disabled={!isOwner}
                    placeholder="+1 (555) 234-5678"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Official Website
                  </label>
                  <input
                    type="url"
                    disabled={!isOwner}
                    placeholder="https://www.vancestudio.com"
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Physical Studio Address
                  </label>
                  <input
                    type="text"
                    disabled={!isOwner}
                    placeholder="120 Arts District Blvd, Suite 400, Chicago, IL"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 disabled:opacity-60"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 2: BRANDING CUSTOMIZATION */}
        {/* ==================================================== */}
        {activeTab === 'branding' && (
          <div className="space-y-6">
            {/* Primary & Secondary Brand Colors */}
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-5 shadow-2xs">
              <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
                <div>
                  <h2 className="text-base font-serif font-bold text-zinc-900 dark:text-zinc-100">
                    Primary & Secondary Brand Palettes
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Curated color harmony applied to client portals, badges, action buttons, and accents
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div 
                    className="w-7 h-7 rounded-full border border-zinc-300 dark:border-zinc-700 shadow-xs"
                    style={{ backgroundColor: formData.accentColor }}
                    title="Primary Brand Accent"
                  />
                  <div 
                    className="w-7 h-7 rounded-full border border-zinc-300 dark:border-zinc-700 shadow-xs"
                    style={{ backgroundColor: formData.secondaryColor }}
                    title="Secondary Brand Color"
                  />
                </div>
              </div>

              {/* Primary Color Picker */}
              <div className="space-y-3">
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Primary Brand Accent Colour
                </label>

                <div className="flex flex-wrap items-center gap-2.5">
                  {LUXURY_PALETTES.map((pal) => (
                    <button
                      type="button"
                      key={pal.name}
                      onClick={() => setFormData({ ...formData, accentColor: pal.hex, galleryAccentColor: pal.hex })}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${
                        formData.accentColor.toLowerCase() === pal.hex.toLowerCase()
                          ? 'border-amber-500 bg-amber-500/10 text-zinc-900 dark:text-white shadow-xs font-bold'
                          : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 text-zinc-600 dark:text-zinc-400'
                      }`}
                    >
                      <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: pal.hex }} />
                      <span>{pal.name}</span>
                    </button>
                  ))}

                  <div className="flex items-center gap-2 ml-auto">
                    <input
                      type="color"
                      value={formData.accentColor}
                      onChange={(e) => setFormData({ ...formData, accentColor: e.target.value, galleryAccentColor: e.target.value })}
                      className="w-8 h-8 rounded-lg cursor-pointer border border-zinc-300 dark:border-zinc-700 p-0.5 bg-transparent"
                    />
                    <input
                      type="text"
                      value={formData.accentColor}
                      onChange={(e) => setFormData({ ...formData, accentColor: e.target.value, galleryAccentColor: e.target.value })}
                      className="w-24 px-2 py-1 text-xs font-mono rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 uppercase"
                    />
                  </div>
                </div>
                {!accentValid && (
                  <p className="text-[11px] text-rose-500">Please enter a valid HEX code (e.g. #c5a059).</p>
                )}
              </div>

              {/* Secondary Color Picker */}
              <div className="space-y-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Secondary Brand Colour
                </label>

                <div className="flex flex-wrap items-center gap-2.5">
                  {SECONDARY_PALETTES.map((pal) => (
                    <button
                      type="button"
                      key={pal.name}
                      onClick={() => setFormData({ ...formData, secondaryColor: pal.hex })}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${
                        formData.secondaryColor.toLowerCase() === pal.hex.toLowerCase()
                          ? 'border-amber-500 bg-amber-500/10 text-zinc-900 dark:text-white shadow-xs font-bold'
                          : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 text-zinc-600 dark:text-zinc-400'
                      }`}
                    >
                      <span className="w-3.5 h-3.5 rounded-full border border-zinc-300 dark:border-zinc-700" style={{ backgroundColor: pal.hex }} />
                      <span>{pal.name}</span>
                    </button>
                  ))}

                  <div className="flex items-center gap-2 ml-auto">
                    <input
                      type="color"
                      value={formData.secondaryColor}
                      onChange={(e) => setFormData({ ...formData, secondaryColor: e.target.value })}
                      className="w-8 h-8 rounded-lg cursor-pointer border border-zinc-300 dark:border-zinc-700 p-0.5 bg-transparent"
                    />
                    <input
                      type="text"
                      value={formData.secondaryColor}
                      onChange={(e) => setFormData({ ...formData, secondaryColor: e.target.value })}
                      className="w-24 px-2 py-1 text-xs font-mono rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 uppercase"
                    />
                  </div>
                </div>
                {!secondaryValid && (
                  <p className="text-[11px] text-rose-500">Please enter a valid HEX code.</p>
                )}
              </div>
            </div>

            {/* Typography & Font Selection */}
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-4 shadow-2xs">
              <div className="border-b border-zinc-100 dark:border-zinc-800 pb-3">
                <h2 className="text-base font-serif font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <Type className="w-4 h-4 text-amber-500" />
                  Professional Font Selection
                </h2>
                <p className="text-xs text-zinc-500">
                  Select typography for client-facing gallery headers, hero titles, and branding displays
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {SUPPORTED_FONTS.map((f) => {
                  const isSelected = formData.fontFamily === f.id;
                  const fontStyle = getFontFamilyStyle(f.id);
                  return (
                    <div
                      key={f.id}
                      onClick={() => setFormData({ ...formData, fontFamily: f.id })}
                      className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all space-y-2 ${
                        isSelected
                          ? 'border-amber-500 bg-amber-500/5 dark:bg-amber-950/20 shadow-xs'
                          : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-850/30'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{f.name}</span>
                        {isSelected && <Badge variant="gold" size="sm">Active</Badge>}
                      </div>
                      <div 
                        className="text-lg text-zinc-800 dark:text-zinc-200 tracking-tight"
                        style={{ fontFamily: fontStyle }}
                      >
                        Eleanor Vance Photography
                      </div>
                      <div className="text-[10px] text-zinc-400 font-mono">
                        {f.category}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Gallery Appearance & Cover Layout */}
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-5 shadow-2xs">
              <div className="border-b border-zinc-100 dark:border-zinc-800 pb-3">
                <h2 className="text-base font-serif font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <Layout className="w-4 h-4 text-amber-500" />
                  Client Gallery Appearance & Layout
                </h2>
                <p className="text-xs text-zinc-500">
                  Fine-tune theme modes, cover style layouts, and logo alignment in delivered collections
                </p>
              </div>

              {/* Theme Mode & Logo Placement Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Gallery Theme Mode
                  </label>
                  <select
                    value={formData.galleryTheme}
                    onChange={(e) => setFormData({ ...formData, galleryTheme: e.target.value as GalleryTheme })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  >
                    <option value="dark">Darkroom Noir (High Contrast Dark)</option>
                    <option value="light">Gallery White (Clean Editorial Light)</option>
                    <option value="system">System Synchronized</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Logo Placement
                  </label>
                  <select
                    value={formData.logoPlacement}
                    onChange={(e) => setFormData({ ...formData, logoPlacement: e.target.value as LogoPlacement })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  >
                    <option value="left">Left Aligned (Modern Standard)</option>
                    <option value="center">Center Centered (High Luxury)</option>
                    <option value="right">Right Aligned (Editorial Minimal)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Cover Header Appearance
                  </label>
                  <select
                    value={formData.coverStyle}
                    onChange={(e) => setFormData({ ...formData, coverStyle: e.target.value as GalleryCoverStyle })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  >
                    <option value="hero_gradient">Atmospheric Gradient Header</option>
                    <option value="split">Editorial Split Banner</option>
                    <option value="full">Full-Bleed Hero Cover</option>
                    <option value="minimal">Minimalist Clean Bar</option>
                  </select>
                </div>
              </div>

              {/* Gallery Background Color Selector */}
              <div className="space-y-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Client Gallery Background Canvas Colour
                </label>
                <div className="flex flex-wrap items-center gap-2.5">
                  {GALLERY_BG_PALETTES.map((pal) => (
                    <button
                      type="button"
                      key={pal.name}
                      onClick={() => setFormData({ 
                        ...formData, 
                        galleryBackgroundColor: pal.hex,
                        galleryTheme: pal.theme as GalleryTheme 
                      })}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${
                        formData.galleryBackgroundColor.toLowerCase() === pal.hex.toLowerCase()
                          ? 'border-amber-500 bg-amber-500/10 text-zinc-900 dark:text-white shadow-xs font-bold'
                          : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 text-zinc-600 dark:text-zinc-400'
                      }`}
                    >
                      <span className="w-3.5 h-3.5 rounded-full border border-zinc-300 dark:border-zinc-700" style={{ backgroundColor: pal.hex }} />
                      <span>{pal.name}</span>
                    </button>
                  ))}

                  <div className="flex items-center gap-2 ml-auto">
                    <input
                      type="color"
                      value={formData.galleryBackgroundColor}
                      onChange={(e) => setFormData({ ...formData, galleryBackgroundColor: e.target.value })}
                      className="w-8 h-8 rounded-lg cursor-pointer border border-zinc-300 dark:border-zinc-700 p-0.5 bg-transparent"
                    />
                    <input
                      type="text"
                      value={formData.galleryBackgroundColor}
                      onChange={(e) => setFormData({ ...formData, galleryBackgroundColor: e.target.value })}
                      className="w-24 px-2 py-1 text-xs font-mono rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 uppercase"
                    />
                  </div>
                </div>
                {!bgValid && (
                  <p className="text-[11px] text-rose-500">Please enter a valid HEX code for background.</p>
                )}
              </div>
            </div>

            {/* Proofing Watermark Configuration */}
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-4 shadow-2xs">
              <div className="border-b border-zinc-100 dark:border-zinc-800 pb-3">
                <h2 className="text-base font-serif font-bold text-zinc-900 dark:text-zinc-100">
                  Proofing Watermark Overlay
                </h2>
                <p className="text-xs text-zinc-500">
                  Protects unpurchased client proofing collections before final payment delivery
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Watermark Text
                </label>
                <input
                  type="text"
                  value={formData.watermarkText}
                  onChange={(e) => setFormData({ ...formData, watermarkText: e.target.value })}
                  placeholder="e.g. Vance Fine Art Photography • PROOF ONLY"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                />
              </div>

              {/* Live Watermark Sample Photo Preview */}
              <div className="space-y-1.5 pt-2">
                <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">
                  Interactive Watermark Preview
                </span>
                <div className="relative aspect-16/9 max-w-xl rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-950">
                  <img
                    src="https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=80"
                    alt="Watermark Sample"
                    className="w-full h-full object-cover opacity-85"
                  />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center rotate-[-20deg] select-none p-4 rounded-xl backdrop-blur-[1px]">
                      <span 
                        className="text-lg sm:text-2xl font-serif font-bold tracking-widest text-white/50 uppercase drop-shadow-md"
                        style={{ fontFamily: currentFontFamilyStyle }}
                      >
                        {formData.watermarkText || 'StudioCloud Watermark'}
                      </span>
                      <div className="text-[10px] tracking-widest text-white/40 uppercase font-mono mt-0.5">
                        Protected Proofing Sample
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Invoicing & Footer Legal Notice */}
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-4 shadow-2xs">
              <h2 className="text-base font-serif font-bold text-zinc-900 dark:text-zinc-100">
                Gallery & Invoice Footer Notice
              </h2>
              <div>
                <input
                  type="text"
                  value={formData.footerText}
                  onChange={(e) => setFormData({ ...formData, footerText: e.target.value })}
                  placeholder={`© ${new Date().getFullYear()} ${activeStudio.name}. All rights reserved.`}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                />
                <p className="text-[10px] text-zinc-400 mt-1">
                  Appears at the base of every client gallery delivery and downloadable receipt.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 3: REGIONAL & BUSINESS PREFERENCES */}
        {/* ==================================================== */}
        {activeTab === 'preferences' && (
          <div className="space-y-6">
            {/* Regional & Localization */}
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-4 shadow-2xs">
              <div className="border-b border-zinc-100 dark:border-zinc-800 pb-3">
                <h2 className="text-base font-serif font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-500" />
                  Regional & Localization Preferences
                </h2>
                <p className="text-xs text-zinc-500">
                  Format shoot dates, delivery timestamps, and financial ledger figures
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Default Timezone
                  </label>
                  <select
                    value={formData.timezone}
                    onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  >
                    {TIMEZONES.map((tz) => (
                      <option key={tz.value} value={tz.value}>
                        {tz.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Currency Preference
                  </label>
                  <select
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  >
                    {CURRENCIES.map((cur) => (
                      <option key={cur.code} value={cur.code}>
                        {cur.name} ({cur.symbol})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Date Format
                  </label>
                  <select
                    value={formData.dateFormat}
                    onChange={(e) => setFormData({ ...formData, dateFormat: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  >
                    <option value="YYYY-MM-DD">YYYY-MM-DD (ISO 8601)</option>
                    <option value="DD/MM/YYYY">DD/MM/YYYY (UK & European)</option>
                    <option value="MM/DD/YYYY">MM/DD/YYYY (US Standard)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Business & Invoicing Details */}
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-4 shadow-2xs">
              <div className="border-b border-zinc-100 dark:border-zinc-800 pb-3">
                <h2 className="text-base font-serif font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-amber-500" />
                  Business Registration & Billing Details
                </h2>
                <p className="text-xs text-zinc-500">
                  Included on client contract PDFs and official proofing receipts
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Tax / VAT Identification Number
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. US EIN 12-3456789 or GB VAT 987 6543 21"
                    value={formData.taxId}
                    onChange={(e) => setFormData({ ...formData, taxId: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Business Registration / Company Number
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. LLC Registration #892341"
                    value={formData.registrationNumber}
                    onChange={(e) => setFormData({ ...formData, registrationNumber: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Billing & Remittance Address
                </label>
                <textarea
                  rows={2}
                  placeholder="Official billing address for contracts and invoice headers..."
                  value={formData.billingAddress}
                  onChange={(e) => setFormData({ ...formData, billingAddress: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                />
              </div>
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 4: DOMAIN & INFRASTRUCTURE */}
        {/* ==================================================== */}
        {activeTab === 'domain' && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-4 shadow-2xs">
              <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
                <h2 className="text-base font-serif font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-amber-500" />
                  Custom Domains & Infrastructure Status
                </h2>
                <Badge variant="amber" size="sm">Not Configured</Badge>
              </div>

              <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 dark:bg-amber-950/20 text-xs text-zinc-700 dark:text-zinc-300 space-y-2">
                <div className="font-semibold text-amber-600 dark:text-amber-400">
                  Managed Vanity Path Routing Active
                </div>
                <p className="leading-relaxed">
                  StudioCloud provisions a secure, multi-tenant vanity URL path for your studio:
                </p>
                <div className="p-2.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 font-mono text-xs text-zinc-800 dark:text-zinc-200 select-all">
                  https://studiocloud.io/p/{formData.slug || activeStudio.slug}
                </div>
                <p className="leading-relaxed text-[11px] text-zinc-500">
                  Custom domain mapping (e.g. <code>gallery.vancestudio.com</code>) requires external DNS CNAME configuration and SSL certificate provisioning. To keep zero-billing mode intact, custom domains are labeled <strong>Not Configured</strong>.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-850/40 text-xs space-y-2">
                <div className="font-semibold text-zinc-800 dark:text-zinc-200">
                  Storage Quota & Billing Status
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-[11px]">
                  <div className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                    <span className="text-zinc-500">Planned Quota:</span>
                    <span className="font-mono font-semibold">10,000,000,000 Bytes (10 GB)</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                    <span className="text-zinc-500">Cloud Storage:</span>
                    <Badge variant="amber" size="sm">Not Connected</Badge>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Form Action Buttons Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
          <div className="text-[11px] text-zinc-400">
            Tenant: <span className="font-mono text-zinc-600 dark:text-zinc-300">@{activeStudio.slug}</span> • Multi-tenant Firestore rule isolation enforced
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={() => setPreviewModalOpen(true)}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 transition-colors flex items-center gap-1.5"
            >
              <Eye className="w-3.5 h-3.5" />
              Preview Client View
            </button>

            <button
              type="submit"
              disabled={isSaving || !isOwner}
              className="px-6 py-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-zinc-950 transition-colors shadow-2xs disabled:opacity-50 flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Persisting Changes...' : 'Save Settings & Branding'}
            </button>
          </div>
        </div>
      </form>

      {/* RESET CONFIRMATION MODAL */}
      {resetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl p-6 space-y-4">
            <h3 className="text-base font-serif font-bold text-zinc-900 dark:text-zinc-100">
              Reset Branding to Defaults?
            </h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              This will revert primary/secondary colors, gallery background, typography, and cover layout to clean luxury studio defaults. Your studio name, contact details, and logo URL will be preserved.
            </p>
            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setResetModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-zinc-500 hover:text-zinc-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleResetDefaults}
                className="px-4 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl shadow-2xs"
              >
                Confirm Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LIVE CLIENT GALLERY PREVIEW MODAL */}
      {previewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-5xl max-h-[92vh] overflow-y-auto rounded-3xl border border-zinc-800 shadow-2xl flex flex-col bg-zinc-950 text-zinc-100">
            {/* Top Modal Navigation */}
            <div className="sticky top-0 z-20 flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-md">
              <div className="flex items-center gap-2">
                <Badge variant="amber" size="sm">Live Client Portal Preview</Badge>
                <span className="text-xs text-zinc-400">
                  Previewing branding before applying to production
                </span>
              </div>
              <button
                onClick={() => setPreviewModalOpen(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Live Client Preview Surface */}
            <div 
              className={`p-6 sm:p-10 space-y-8 min-h-[500px] transition-colors ${
                formData.galleryTheme === 'light' ? 'bg-white text-zinc-900' : 'text-zinc-100'
              }`}
              style={{ 
                backgroundColor: formData.galleryBackgroundColor,
                color: formData.galleryTheme === 'light' ? '#18181b' : '#fafafa' 
              }}
            >
              {/* Header with configured logo placement */}
              <div className={`flex items-center ${
                formData.logoPlacement === 'center' ? 'justify-center text-center' :
                formData.logoPlacement === 'right' ? 'justify-end text-right' :
                'justify-start text-left'
              }`}>
                {formData.logoUrl ? (
                  <img
                    src={formData.logoUrl}
                    alt="Logo"
                    className="max-h-12 max-w-[200px] object-contain rounded-md"
                  />
                ) : (
                  <span 
                    className="text-xs font-mono uppercase tracking-widest font-bold"
                    style={{ color: formData.accentColor }}
                  >
                    {formData.displayName || formData.name || 'StudioCloud Photography'}
                  </span>
                )}
              </div>

              {/* Cover Presentation Specimen */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300">
                    Wedding & Elopement
                  </span>
                  <span className="text-xs opacity-60 font-mono">Client Proofing Suite</span>
                </div>

                <h1 
                  className="text-3xl sm:text-4xl font-bold tracking-tight"
                  style={{ fontFamily: currentFontFamilyStyle }}
                >
                  Elena & Michael — Tuscany Summer Nuptials
                </h1>

                <p className="text-xs opacity-75 max-w-xl leading-relaxed">
                  Curated fine-art collection capturing ceremony highlights, sunset portraits, and reception celebrations.
                </p>

                {/* Proofing Action Buttons in Accent Color */}
                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    className="px-4 py-2 rounded-xl text-xs font-bold text-zinc-950 shadow-xs flex items-center gap-1.5"
                    style={{ backgroundColor: formData.accentColor }}
                  >
                    <Check className="w-3.5 h-3.5" />
                    Approve Album Selection (24 / 40)
                  </button>

                  <button
                    type="button"
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold border transition-colors"
                    style={{ 
                      borderColor: formData.secondaryColor,
                      color: formData.galleryTheme === 'light' ? '#18181b' : '#fafafa'
                    }}
                  >
                    Filter Favourites (18)
                  </button>
                </div>
              </div>

              {/* Mock Photography Grid with Watermark */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-zinc-800/40">
                {[
                  'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=600&q=80',
                  'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=600&q=80',
                  'https://images.unsplash.com/photo-1583939003579-730e3918a45a?auto=format&fit=crop&w=600&q=80',
                ].map((src, i) => (
                  <div key={i} className="relative aspect-4/3 rounded-xl overflow-hidden border border-zinc-800 shadow-md group">
                    <img src={src} alt="Specimen" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center opacity-25 text-[10px] font-mono font-bold tracking-widest text-white rotate-[-20deg] select-none pointer-events-none">
                      {formData.watermarkText || 'PROOF ONLY'}
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer preview */}
              <div className="pt-6 border-t border-zinc-800/40 text-center text-xs opacity-70 space-y-1">
                <p>{formData.footerText || `© ${new Date().getFullYear()} ${formData.name}. All rights reserved.`}</p>
                {formData.contactEmail && <p className="text-[11px] font-mono">{formData.contactEmail} • {formData.phone}</p>}
              </div>
            </div>

            {/* Modal Bottom Bar */}
            <div className="p-4 border-t border-zinc-800 bg-zinc-950 flex items-center justify-between">
              <span className="text-xs text-zinc-500 font-mono">
                Font: {formData.fontFamily} • Accent: {formData.accentColor} • Theme: {formData.galleryTheme}
              </span>
              <button
                type="button"
                onClick={() => setPreviewModalOpen(false)}
                className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-white"
              >
                Done Previewing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

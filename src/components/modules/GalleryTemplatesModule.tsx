import React, { useState, useEffect, useMemo } from 'react';
import { 
  Layout, 
  Sparkles, 
  Eye, 
  Palette, 
  Type, 
  Monitor, 
  Tablet, 
  Smartphone, 
  Check, 
  Save, 
  RotateCcw, 
  Sliders, 
  Layers, 
  Camera, 
  Info, 
  CheckCircle2, 
  AlertCircle, 
  Plus, 
  Trash2, 
  ExternalLink, 
  Image as ImageIcon,
  Heart,
  Star,
  MessageSquare,
  ShieldCheck,
  ChevronRight,
  Filter
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { 
  getBuiltInGalleryTemplates, 
  getStudioTemplates, 
  saveStudioTemplate, 
  deleteStudioTemplate, 
  updateStudio,
  getGalleries,
  updateGalleryDesignSettings,
  getFontFamilyStyle,
  isValidHexColor
} from '../../services/studioService';
import { 
  StudioGalleryTemplate, 
  GalleryTemplateCategory, 
  GalleryLayoutType, 
  GalleryColumnsCount, 
  GalleryGridSpacing, 
  SupportedFontFamily, 
  GalleryCoverStyle, 
  GalleryTheme, 
  LogoPlacement,
  GalleryDesignSettings,
  Gallery
} from '../../types';
import { Badge } from '../common/Badge';

// Sample preview photos for the live interactive sandbox
const SAMPLE_GALLERY_PHOTOS = [
  {
    id: 'sample_1',
    url: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=80',
    title: 'The Sacred Vows',
    orientation: 'landscape',
    aspect: 'aspect-16/10',
  },
  {
    id: 'sample_2',
    url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=1200&q=80',
    title: 'Editorial Silhouette',
    orientation: 'portrait',
    aspect: 'aspect-3/4',
  },
  {
    id: 'sample_3',
    url: 'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=1200&q=80',
    title: 'Golden Sunset Promenade',
    orientation: 'portrait',
    aspect: 'aspect-4/5',
  },
  {
    id: 'sample_4',
    url: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&w=1200&q=80',
    title: 'Couture Veil Movement',
    orientation: 'landscape',
    aspect: 'aspect-16/9',
  },
  {
    id: 'sample_5',
    url: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&w=1200&q=80',
    title: 'Nocturne Celebration',
    orientation: 'portrait',
    aspect: 'aspect-3/4',
  },
  {
    id: 'sample_6',
    url: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1200&q=80',
    title: 'Architectural Heritage',
    orientation: 'landscape',
    aspect: 'aspect-4/3',
  },
];

const LUXURY_PALETTES = [
  { name: 'Champagne Gold', hex: '#c5a059' },
  { name: 'Nordic Sage', hex: '#52796f' },
  { name: 'Obsidian Noir', hex: '#ffffff' },
  { name: 'Royal Indigo', hex: '#31425f' },
  { name: 'Tuscan Terracotta', hex: '#a65b45' },
  { name: 'Emerald Luxury', hex: '#059669' },
  { name: 'Crimson Velvet', hex: '#dc2626' },
];

const THEME_OPTIONS: { id: GalleryTheme; label: string; bg: string; text: string }[] = [
  { id: 'dark', label: 'Darkroom Noir', bg: '#09090b', text: '#f4f4f5' },
  { id: 'light', label: 'Fine Art Linen', bg: '#fafaf9', text: '#18181b' },
  { id: 'system', label: 'Adaptive System', bg: '#18181b', text: '#f4f4f5' },
];

const FONTS: { id: SupportedFontFamily; label: string; sample: string }[] = [
  { id: 'cormorant', label: 'Cormorant Garamond', sample: 'Luxury Romance & Fine Art' },
  { id: 'playfair', label: 'Playfair Display', sample: 'Editorial Grand Titles' },
  { id: 'cinzel', label: 'Cinzel Classical', sample: 'Monumental Couture' },
  { id: 'serif', label: 'Classic Serif', sample: 'Timeless Elegance' },
  { id: 'sans', label: 'Modern Sans', sample: 'Clean & Contemporary' },
  { id: 'inter', label: 'Inter Swiss Minimal', sample: 'Architectural Balance' },
  { id: 'montserrat', label: 'Montserrat Bold', sample: 'High-Impact Display' },
];

interface GalleryTemplatesModuleProps {
  onNavigateToGalleries?: () => void;
}

export const GalleryTemplatesModule: React.FC<GalleryTemplatesModuleProps> = ({
  onNavigateToGalleries,
}) => {
  const { activeStudio, reloadStudios } = useAuth();
  
  // Custom templates & studio galleries
  const [customTemplates, setCustomTemplates] = useState<StudioGalleryTemplate[]>([]);
  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Category filter for catalog
  const [selectedCategory, setSelectedCategory] = useState<'all' | GalleryTemplateCategory>('all');
  
  // Active editing / preview template
  const builtInTemplates = useMemo(() => getBuiltInGalleryTemplates(), []);
  const allTemplates = useMemo(() => [...customTemplates, ...builtInTemplates], [customTemplates, builtInTemplates]);
  
  const [activeTemplate, setActiveTemplate] = useState<StudioGalleryTemplate>(builtInTemplates[0]);
  const [templateCustomName, setTemplateCustomName] = useState<string>(builtInTemplates[0].name);
  
  // Sandbox Live Controls State
  const [viewportMode, setViewportMode] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [designerTab, setDesignerTab] = useState<'layout' | 'typography' | 'branding' | 'theme'>('layout');
  
  // Working draft state inside the designer
  const [draftLayout, setDraftLayout] = useState<GalleryLayoutType>(builtInTemplates[0].layout);
  const [draftColumns, setDraftColumns] = useState<GalleryColumnsCount>(builtInTemplates[0].columns);
  const [draftSpacing, setDraftSpacing] = useState<GalleryGridSpacing>(builtInTemplates[0].spacing);
  const [draftCoverStyle, setDraftCoverStyle] = useState<GalleryCoverStyle>(builtInTemplates[0].coverStyle);
  const [draftFont, setDraftFont] = useState<SupportedFontFamily>(builtInTemplates[0].fontFamily);
  const [draftAccentColor, setDraftAccentColor] = useState<string>(builtInTemplates[0].accentColor);
  const [draftTheme, setDraftTheme] = useState<GalleryTheme>(builtInTemplates[0].galleryTheme);
  const [draftLogoPlacement, setDraftLogoPlacement] = useState<LogoPlacement>(builtInTemplates[0].logoPlacement);
  
  // In-flight saving feedback
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  
  // Modal for applying template to existing galleries
  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const [applyStep, setApplyStep] = useState<'select' | 'confirm'>('select');
  const [selectedGalleryIdToApply, setSelectedGalleryIdToApply] = useState<string>('');
  const [isApplying, setIsApplying] = useState(false);
  const [applySuccess, setApplySuccess] = useState<string | null>(null);

  // Load custom templates and galleries for active studio
  useEffect(() => {
    if (!activeStudio) return;
    let isMounted = true;
    async function loadData() {
      setLoading(true);
      try {
        const [templatesRes, galleriesRes] = await Promise.allSettled([
          getStudioTemplates(activeStudio!.id),
          getGalleries(activeStudio!.id)
        ]);
        if (isMounted) {
          if (templatesRes.status === 'fulfilled' && templatesRes.value) {
            setCustomTemplates(templatesRes.value);
          }
          if (galleriesRes.status === 'fulfilled' && galleriesRes.value) {
            setGalleries(galleriesRes.value);
          }
        }
      } catch (err) {
        console.error('Error loading gallery templates:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadData();
    return () => { isMounted = false; };
  }, [activeStudio]);

  // Sync draft controls when active template changes
  const handleSelectTemplate = (template: StudioGalleryTemplate) => {
    setActiveTemplate(template);
    setTemplateCustomName(template.name);
    setDraftLayout(template.layout);
    setDraftColumns(template.columns);
    setDraftSpacing(template.spacing);
    setDraftCoverStyle(template.coverStyle);
    setDraftFont(template.fontFamily);
    setDraftAccentColor(template.accentColor);
    setDraftTheme(template.galleryTheme);
    setDraftLogoPlacement(template.logoPlacement);
    setSaveSuccessMessage(null);
    setSaveErrorMessage(null);
  };

  // Filter templates by category
  const filteredTemplates = useMemo(() => {
    if (selectedCategory === 'all') return allTemplates;
    return allTemplates.filter((t) => t.category === selectedCategory);
  }, [allTemplates, selectedCategory]);

  // Handle saving as custom studio template
  const handleSaveAsCustomTemplate = async () => {
    if (!activeStudio) {
      setSaveErrorMessage('Active studio tenant session is required.');
      return;
    }
    setIsSaving(true);
    setSaveSuccessMessage(null);
    setSaveErrorMessage(null);

    try {
      const trimmedCustomName = templateCustomName?.trim();
      const templateName = trimmedCustomName && trimmedCustomName.length >= 2
        ? trimmedCustomName
        : activeTemplate.studioId === 'system'
        ? `${activeStudio.name} — ${activeTemplate.name}`
        : activeTemplate.name;

      const saved = await saveStudioTemplate(activeStudio.id, {
        id: activeTemplate.studioId === 'system' ? undefined : activeTemplate.id,
        name: templateName,
        category: activeTemplate.category,
        description: `Customized ${activeTemplate.category} gallery design system with ${draftLayout} layout and ${draftFont} typography.`,
        layout: draftLayout,
        columns: draftColumns,
        spacing: draftSpacing,
        coverStyle: draftCoverStyle,
        fontFamily: draftFont,
        accentColor: draftAccentColor,
        galleryTheme: draftTheme,
        logoPlacement: draftLogoPlacement,
        isStudioDefault: false,
        sampleCoverUrl: activeTemplate.sampleCoverUrl,
      });

      // Refresh custom templates list
      const updatedList = await getStudioTemplates(activeStudio.id);
      setCustomTemplates(updatedList);
      setActiveTemplate(saved);
      setTemplateCustomName(saved.name);
      setSaveSuccessMessage(`Template "${saved.name}" successfully persisted to studio tenant boundary.`);
    } catch (err: any) {
      setSaveErrorMessage(err.message || 'Failed to save template. Please review input fields.');
    } finally {
      setIsSaving(false);
    }
  };

  // Set as default studio gallery template
  const handleSetStudioDefault = async (template: StudioGalleryTemplate) => {
    if (!activeStudio) return;
    setIsSaving(true);
    setSaveSuccessMessage(null);
    try {
      await updateStudio(activeStudio.id, {
        branding: {
          ...activeStudio.branding,
          defaultTemplateId: template.id,
          defaultLayout: draftLayout || template.layout,
          galleryTheme: draftTheme || template.galleryTheme,
          accentColor: draftAccentColor || template.accentColor,
          fontFamily: draftFont || template.fontFamily,
          coverStyle: draftCoverStyle || template.coverStyle,
        }
      });
      await reloadStudios();
      setSaveSuccessMessage(`"${template.name}" established as default template for ${activeStudio.name}.`);
    } catch (err: any) {
      setSaveErrorMessage(err.message || 'Failed to set studio default template.');
    } finally {
      setIsSaving(false);
    }
  };

  // Apply current design to an existing gallery
  const handleApplyToGallery = async () => {
    if (!activeStudio || !selectedGalleryIdToApply) return;
    setIsApplying(true);
    setApplySuccess(null);
    try {
      const designPayload: GalleryDesignSettings = {
        templateId: activeTemplate.id,
        templateType: activeTemplate.category,
        layout: draftLayout,
        columns: draftColumns,
        spacing: draftSpacing,
        coverStyle: draftCoverStyle,
        fontFamily: draftFont,
        accentColor: draftAccentColor,
        galleryTheme: draftTheme,
        logoPlacement: draftLogoPlacement,
        customCoverUrl: activeTemplate.sampleCoverUrl,
      };

      await updateGalleryDesignSettings(activeStudio.id, selectedGalleryIdToApply, designPayload);
      
      const targetGal = galleries.find(g => g.id === selectedGalleryIdToApply);
      setApplySuccess(`Design successfully applied to "${targetGal?.title || 'collection'}".`);
      setTimeout(() => {
        setApplyModalOpen(false);
        setApplySuccess(null);
      }, 1500);
    } catch (err: any) {
      setSaveErrorMessage(err.message || 'Failed to apply design settings to gallery.');
    } finally {
      setIsApplying(false);
    }
  };

  // Handle template deletion (only for custom templates)
  const handleDeleteCustomTemplate = async (templateId: string, name: string) => {
    if (!activeStudio) return;
    if (!window.confirm(`Delete custom template "${name}"? Existing galleries will preserve their saved settings.`)) {
      return;
    }
    try {
      await deleteStudioTemplate(activeStudio.id, templateId, name);
      const updatedList = await getStudioTemplates(activeStudio.id);
      setCustomTemplates(updatedList);
      if (activeTemplate.id === templateId) {
        handleSelectTemplate(builtInTemplates[0]);
      }
    } catch (err: any) {
      setSaveErrorMessage(err.message || 'Failed to delete custom template.');
    }
  };

  const currentFontFamilyCss = getFontFamilyStyle(draftFont);
  const isLightModePreview = draftTheme === 'light';

  return (
    <div className="space-y-8 animate-in fade-in max-w-7xl mx-auto pb-16">
      {/* Top Banner: Module Title & Transparent Infrastructure Notice */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center justify-center shadow-xs">
              <Layout className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-serif font-bold text-zinc-900 dark:text-white tracking-tight flex items-center gap-2.5">
                Gallery Templates & Design System
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Architectural layouts, luxury typography, and bespoke colorways isolated to <strong className="text-zinc-800 dark:text-zinc-200">@{activeStudio?.slug || 'tenant'}</strong>.
              </p>
            </div>
          </div>
        </div>

        {/* Honest Infrastructure Status Indicator */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 flex items-center gap-2 text-zinc-600 dark:text-zinc-400 font-mono text-[11px]">
            <Info className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>
              <strong>Object Storage Status: Not Connected.</strong> Interactive preview renders locally.
            </span>
          </div>

          {onNavigateToGalleries && (
            <button
              onClick={onNavigateToGalleries}
              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 transition-colors shadow-xs flex items-center gap-1.5"
            >
              <span>Manage Collections</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Notifications / Alerts */}
      {saveSuccessMessage && (
        <div className="p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{saveSuccessMessage}</span>
          </div>
          <button onClick={() => setSaveSuccessMessage(null)} className="text-xs hover:underline shrink-0">
            Dismiss
          </button>
        </div>
      )}

      {saveErrorMessage && (
        <div className="p-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-400 text-xs flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{saveErrorMessage}</span>
          </div>
          <button onClick={() => setSaveErrorMessage(null)} className="text-xs hover:underline shrink-0">
            Dismiss
          </button>
        </div>
      )}

      {/* SECTION 1: TEMPLATE CATALOG WITH CATEGORY FILTER */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-serif font-bold text-zinc-900 dark:text-white">
              Signature Presentation Catalog
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Select any pre-configured template to inspect in the live sandbox or customize for your studio.
            </p>
          </div>

          {/* Category Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            {(['all', 'wedding', 'pre_wedding', 'portrait', 'events', 'portfolio'] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium capitalize transition-all whitespace-nowrap ${
                  selectedCategory === cat
                    ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 font-semibold shadow-xs'
                    : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                {cat === 'pre_wedding' ? 'Pre-Wedding' : cat}
              </button>
            ))}
          </div>
        </div>

        {/* Templates Grid Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {filteredTemplates.map((tmpl) => {
            const isSelected = activeTemplate.id === tmpl.id;
            const isDefault = activeStudio?.branding?.defaultTemplateId === tmpl.id;

            return (
              <div
                key={tmpl.id}
                onClick={() => handleSelectTemplate(tmpl)}
                className={`group relative rounded-2xl overflow-hidden border p-3 flex flex-col justify-between cursor-pointer transition-all ${
                  isSelected
                    ? 'border-amber-500 bg-amber-500/5 dark:bg-amber-500/10 shadow-lg ring-1 ring-amber-500'
                    : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 hover:border-zinc-300 dark:hover:border-zinc-700 shadow-xs hover:shadow-md'
                }`}
              >
                {/* Thumbnail Preview Image */}
                <div className="relative aspect-16/10 rounded-xl overflow-hidden bg-zinc-950 mb-3 border border-zinc-200 dark:border-zinc-800">
                  {tmpl.sampleCoverUrl ? (
                    <img
                      src={tmpl.sampleCoverUrl}
                      alt={tmpl.name}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-500">
                      <Camera className="w-8 h-8 opacity-40" />
                    </div>
                  )}
                  
                  {/* Category Pill Overlay */}
                  <div className="absolute top-2 left-2 flex items-center gap-1.5">
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-black/80 text-white backdrop-blur-xs border border-white/10">
                      {tmpl.category === 'pre_wedding' ? 'Pre-Wedding' : tmpl.category}
                    </span>
                  </div>

                  {/* Studio Default Badge */}
                  {isDefault && (
                    <div className="absolute top-2 right-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-400 text-zinc-950 shadow-xs flex items-center gap-1">
                        <Check className="w-2.5 h-2.5" /> Default
                      </span>
                    </div>
                  )}

                  {/* Active Selected Indicator */}
                  {isSelected && (
                    <div className="absolute bottom-2 right-2">
                      <div className="w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center shadow-md">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Card Meta & Description */}
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-start justify-between gap-1">
                    <h3 className="font-serif font-bold text-sm text-zinc-900 dark:text-white leading-snug">
                      {tmpl.name}
                    </h3>
                  </div>

                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                    {tmpl.description}
                  </p>
                </div>

                {/* Specs Badges Footer */}
                <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/80 mt-3 flex items-center justify-between text-[10px] font-mono text-zinc-500 dark:text-zinc-400">
                  <div className="flex items-center gap-1.5">
                    <span className="capitalize">{tmpl.layout}</span>
                    <span>•</span>
                    <span className="capitalize">{tmpl.fontFamily}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div
                      className="w-3 h-3 rounded-full border border-black/20"
                      style={{ backgroundColor: tmpl.accentColor }}
                      title={`Accent: ${tmpl.accentColor}`}
                    />
                    <span className="uppercase">{tmpl.galleryTheme}</span>
                  </div>
                </div>

                {/* Custom Template Indicator */}
                {tmpl.studioId !== 'system' && (
                  <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between text-[10px]">
                    <span className="text-amber-500 font-medium">Custom Studio Template</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCustomTemplate(tmpl.id, tmpl.name);
                      }}
                      className="text-rose-500 hover:text-rose-600 p-1 rounded hover:bg-rose-500/10 transition-colors"
                      title="Delete custom template"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* SECTION 2: INTERACTIVE LIVE SANDBOX & DESIGNER */}
      <section className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 shadow-lg overflow-hidden">
        {/* Designer Control Toolbar */}
        <div className="p-4 sm:p-6 border-b border-zinc-200 dark:border-zinc-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-zinc-50/50 dark:bg-zinc-900/80">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 font-mono">
              Live Sandbox:
            </span>
            <input
              type="text"
              value={templateCustomName}
              onChange={(e) => setTemplateCustomName(e.target.value)}
              placeholder={activeTemplate.name}
              className="text-sm font-serif font-bold text-zinc-900 dark:text-white bg-transparent border-b border-dashed border-zinc-300 dark:border-zinc-700 hover:border-amber-500 focus:border-amber-500 focus:outline-none px-1 py-0.5 min-w-[200px]"
              title="Click to rename this template configuration"
            />
            <Badge variant="amber" size="sm">
              {activeTemplate.category}
            </Badge>
          </div>

          {/* Viewport Device Switcher */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500 font-medium hidden sm:inline">Viewport:</span>
            <div className="p-1 rounded-xl bg-zinc-200/80 dark:bg-zinc-800 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setViewportMode('desktop')}
                className={`p-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                  viewportMode === 'desktop'
                    ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
                title="Desktop Viewport (100% width)"
              >
                <Monitor className="w-3.5 h-3.5" />
                <span className="text-[11px] hidden md:inline">Desktop</span>
              </button>

              <button
                type="button"
                onClick={() => setViewportMode('tablet')}
                className={`p-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                  viewportMode === 'tablet'
                    ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
                title="Tablet Viewport (768px width)"
              >
                <Tablet className="w-3.5 h-3.5" />
                <span className="text-[11px] hidden md:inline">Tablet</span>
              </button>

              <button
                type="button"
                onClick={() => setViewportMode('mobile')}
                className={`p-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                  viewportMode === 'mobile'
                    ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
                title="Mobile Viewport (375px width)"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span className="text-[11px] hidden md:inline">Mobile</span>
              </button>
            </div>
          </div>

          {/* Action Buttons: Save Custom / Set Default / Apply to Gallery */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleSetStudioDefault(activeTemplate)}
              disabled={isSaving}
              className="px-3 py-1.5 rounded-xl text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Set as Studio Default</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setApplyStep('select');
                setSelectedGalleryIdToApply('');
                setApplyModalOpen(true);
              }}
              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 hover:bg-zinc-800 transition-colors shadow-xs flex items-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Apply to Collection</span>
            </button>

            <button
              type="button"
              onClick={handleSaveAsCustomTemplate}
              disabled={isSaving}
              className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-amber-400 hover:bg-amber-300 text-zinc-950 transition-colors shadow-xs flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Saving...' : 'Save Template'}</span>
            </button>
          </div>
        </div>

        {/* Interactive Customization Sub-Tabs */}
        <div className="border-b border-zinc-200 dark:border-zinc-800 px-4 sm:px-6 py-2.5 flex items-center gap-2 overflow-x-auto bg-zinc-100/50 dark:bg-zinc-950/40">
          <button
            type="button"
            onClick={() => setDesignerTab('layout')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              designerTab === 'layout'
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" /> Layout & Grid ({draftLayout})
          </button>

          <button
            type="button"
            onClick={() => setDesignerTab('typography')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              designerTab === 'typography'
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
            }`}
          >
            <Type className="w-3.5 h-3.5" /> Typography ({draftFont})
          </button>

          <button
            type="button"
            onClick={() => setDesignerTab('branding')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              designerTab === 'branding'
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
            }`}
          >
            <Palette className="w-3.5 h-3.5" /> Palette & Header
          </button>

          <button
            type="button"
            onClick={() => setDesignerTab('theme')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              designerTab === 'theme'
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
            }`}
          >
            <Layers className="w-3.5 h-3.5" /> Canvas Canvas ({draftTheme})
          </button>
        </div>

        {/* Tab Controls Tray */}
        <div className="p-4 sm:p-6 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs">
          {designerTab === 'layout' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {/* Layout Mode */}
              <div className="space-y-2">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300 block">
                  Gallery Layout Geometry
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['grid', 'masonry', 'large_image'] as const).map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setDraftLayout(l)}
                      className={`p-2.5 rounded-xl border text-center transition-all ${
                        draftLayout === l
                          ? 'border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold'
                          : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-850 text-zinc-600 dark:text-zinc-400'
                      }`}
                    >
                      <div className="capitalize">{l === 'large_image' ? 'Editorial' : l}</div>
                      <div className="text-[10px] text-zinc-400 font-normal mt-0.5">
                        {l === 'grid' ? 'Even Grid' : l === 'masonry' ? 'Flowing' : 'Full Spread'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Column Count */}
              <div className="space-y-2">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300 block">
                  Grid Columns (Desktop)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {([2, 3, 4] as const).map((col) => (
                    <button
                      key={col}
                      type="button"
                      onClick={() => setDraftColumns(col)}
                      className={`p-2.5 rounded-xl border text-center transition-all ${
                        draftColumns === col
                          ? 'border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold'
                          : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-850 text-zinc-600 dark:text-zinc-400'
                      }`}
                    >
                      <div>{col} Columns</div>
                      <div className="text-[10px] text-zinc-400 font-normal mt-0.5">
                        {col === 2 ? 'Large' : col === 3 ? 'Balanced' : 'Compact'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Spacing / Gaps */}
              <div className="space-y-2">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300 block">
                  Whitespace & Padding
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['compact', 'normal', 'spacious'] as const).map((sp) => (
                    <button
                      key={sp}
                      type="button"
                      onClick={() => setDraftSpacing(sp)}
                      className={`p-2.5 rounded-xl border text-center transition-all ${
                        draftSpacing === sp
                          ? 'border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold'
                          : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-850 text-zinc-600 dark:text-zinc-400'
                      }`}
                    >
                      <div className="capitalize">{sp}</div>
                      <div className="text-[10px] text-zinc-400 font-normal mt-0.5">
                        {sp === 'compact' ? '8px' : sp === 'normal' ? '16px' : '32px'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {designerTab === 'typography' && (
            <div className="space-y-3">
              <label className="font-semibold text-zinc-700 dark:text-zinc-300 block">
                Primary Gallery Typography & Heading Font
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {FONTS.map((font) => (
                  <button
                    key={font.id}
                    type="button"
                    onClick={() => setDraftFont(font.id)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      draftFont === font.id
                        ? 'border-amber-500 bg-amber-500/10 ring-1 ring-amber-500'
                        : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-850 hover:border-zinc-300'
                    }`}
                  >
                    <div className="font-bold text-sm text-zinc-900 dark:text-white" style={{ fontFamily: getFontFamilyStyle(font.id) }}>
                      {font.label}
                    </div>
                    <div className="text-[11px] text-zinc-500 mt-1 truncate" style={{ fontFamily: getFontFamilyStyle(font.id) }}>
                      {font.sample}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {designerTab === 'branding' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Accent Color */}
              <div className="space-y-2">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300 block">
                  Accent Palette Color
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {LUXURY_PALETTES.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => setDraftAccentColor(p.hex)}
                      className={`w-7 h-7 rounded-full border-2 transition-transform ${
                        draftAccentColor.toLowerCase() === p.hex.toLowerCase()
                          ? 'scale-110 border-white ring-2 ring-amber-500'
                          : 'border-transparent hover:scale-105'
                      }`}
                      style={{ backgroundColor: p.hex }}
                      title={`${p.name} (${p.hex})`}
                    />
                  ))}
                  <div className="flex items-center gap-1 ml-2">
                    <span className="text-zinc-500 font-mono text-[11px]">#</span>
                    <input
                      type="text"
                      value={draftAccentColor.replace('#', '')}
                      onChange={(e) => {
                        const val = '#' + e.target.value.trim();
                        if (isValidHexColor(val) || e.target.value.length <= 6) {
                          setDraftAccentColor(val);
                        }
                      }}
                      className="w-20 px-2 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-850 font-mono text-xs uppercase"
                      maxLength={7}
                    />
                  </div>
                </div>
              </div>

              {/* Cover Style */}
              <div className="space-y-2">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300 block">
                  Header Cover Geometry
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['full', 'split', 'minimal', 'hero_gradient'] as const).map((cs) => (
                    <button
                      key={cs}
                      type="button"
                      onClick={() => setDraftCoverStyle(cs)}
                      className={`p-2 rounded-xl border text-center transition-all ${
                        draftCoverStyle === cs
                          ? 'border-amber-500 bg-amber-500/10 text-amber-500 font-semibold'
                          : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-850 text-zinc-600 dark:text-zinc-400'
                      }`}
                    >
                      <span className="capitalize">{cs.replace('_', ' ')}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Logo Placement */}
              <div className="space-y-2">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300 block">
                  Brand Logo Placement
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['left', 'center', 'right'] as const).map((lp) => (
                    <button
                      key={lp}
                      type="button"
                      onClick={() => setDraftLogoPlacement(lp)}
                      className={`p-2 rounded-xl border text-center capitalize transition-all ${
                        draftLogoPlacement === lp
                          ? 'border-amber-500 bg-amber-500/10 text-amber-500 font-semibold'
                          : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-850 text-zinc-600 dark:text-zinc-400'
                      }`}
                    >
                      {lp}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {designerTab === 'theme' && (
            <div className="space-y-3">
              <label className="font-semibold text-zinc-700 dark:text-zinc-300 block">
                Gallery Background Canvas Theme
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {THEME_OPTIONS.map((th) => (
                  <button
                    key={th.id}
                    type="button"
                    onClick={() => setDraftTheme(th.id)}
                    className={`p-3.5 rounded-xl border flex items-center gap-3 transition-all ${
                      draftTheme === th.id
                        ? 'border-amber-500 bg-amber-500/10 ring-1 ring-amber-500'
                        : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-850'
                    }`}
                  >
                    <div
                      className="w-6 h-6 rounded-lg border border-black/30 shadow-xs"
                      style={{ backgroundColor: th.bg }}
                    />
                    <div className="text-left">
                      <div className="font-semibold text-zinc-900 dark:text-white">
                        {th.label}
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono">
                        {th.bg}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* LIVE SIMULATED CLIENT GALLERY VIEWPORT */}
        <div className="p-4 sm:p-8 bg-zinc-950/20 dark:bg-black/40 flex justify-center overflow-x-auto min-h-[500px]">
          <div
            className={`transition-all duration-300 rounded-3xl overflow-hidden border shadow-2xl ${
              viewportMode === 'mobile'
                ? 'w-[375px] max-w-full border-zinc-800'
                : viewportMode === 'tablet'
                ? 'w-[768px] max-w-full border-zinc-800'
                : 'w-full max-w-6xl border-zinc-200 dark:border-zinc-800'
            }`}
            style={{
              backgroundColor: isLightModePreview ? '#fafaf9' : '#09090b',
              color: isLightModePreview ? '#18181b' : '#f4f4f5',
            }}
          >
            {/* Viewport Frame Header */}
            <div
              className={`px-4 py-2 border-b flex items-center justify-between text-[11px] font-mono ${
                isLightModePreview
                  ? 'border-zinc-200 bg-zinc-100/80 text-zinc-600'
                  : 'border-zinc-800 bg-zinc-900/80 text-zinc-400'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                <span className="ml-2 truncate">
                  studiocloud.live/{activeStudio?.slug || 'studio'}/collection-preview
                </span>
              </div>
              <div className="capitalize">{viewportMode} Viewport</div>
            </div>

            {/* Simulated Hero Header */}
            <div className={`p-6 sm:p-10 border-b ${
              isLightModePreview ? 'border-zinc-200 bg-white' : 'border-zinc-900 bg-zinc-950'
            }`}>
              {/* Logo / Brand Name */}
              <div className={`mb-6 flex ${
                draftLogoPlacement === 'center' ? 'justify-center' :
                draftLogoPlacement === 'right' ? 'justify-end' :
                'justify-start'
              }`}>
                {activeStudio?.branding?.logoUrl ? (
                  <img
                    src={activeStudio.branding.logoUrl}
                    alt={activeStudio.name}
                    className="max-h-10 object-contain rounded"
                  />
                ) : (
                  <span
                    className="text-xs uppercase tracking-widest font-mono font-bold"
                    style={{ color: draftAccentColor }}
                  >
                    {activeStudio?.name || 'StudioCloud Photography'}
                  </span>
                )}
              </div>

              {/* Cover Style Presentation */}
              {draftCoverStyle === 'split' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                  <div className="space-y-3">
                    <span
                      className="text-[10px] uppercase font-bold tracking-widest px-2.5 py-0.5 rounded-full border inline-block"
                      style={{
                        borderColor: `${draftAccentColor}40`,
                        color: draftAccentColor,
                        backgroundColor: `${draftAccentColor}10`
                      }}
                    >
                      {activeTemplate.category === 'pre_wedding' ? 'Pre-Wedding' : activeTemplate.category} Showcase
                    </span>
                    <h1
                      className="text-2xl sm:text-4xl font-bold tracking-tight"
                      style={{ fontFamily: currentFontFamilyCss }}
                    >
                      {activeTemplate.name}
                    </h1>
                    <p className={`text-xs sm:text-sm leading-relaxed ${
                      isLightModePreview ? 'text-zinc-600' : 'text-zinc-400'
                    }`}>
                      {activeTemplate.description}
                    </p>
                  </div>
                  <div className="aspect-16/10 rounded-2xl overflow-hidden shadow-xl border border-black/10">
                    <img
                      src={activeTemplate.sampleCoverUrl || SAMPLE_GALLERY_PHOTOS[0].url}
                      alt="Cover"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              ) : draftCoverStyle === 'full' ? (
                <div className="relative rounded-2xl overflow-hidden min-h-[240px] sm:min-h-[300px] flex flex-col justify-end p-6 border border-black/10 shadow-xl">
                  <img
                    src={activeTemplate.sampleCoverUrl || SAMPLE_GALLERY_PHOTOS[0].url}
                    alt="Cover"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
                  <div className="relative z-10 space-y-2 text-white">
                    <span
                      className="text-[10px] uppercase font-bold tracking-widest px-2.5 py-0.5 rounded-full border inline-block"
                      style={{
                        borderColor: `${draftAccentColor}60`,
                        color: draftAccentColor,
                        backgroundColor: 'rgba(0,0,0,0.6)'
                      }}
                    >
                      {activeTemplate.category === 'pre_wedding' ? 'Pre-Wedding' : activeTemplate.category} Showcase
                    </span>
                    <h1
                      className="text-2xl sm:text-4xl font-bold tracking-tight"
                      style={{ fontFamily: currentFontFamilyCss }}
                    >
                      {activeTemplate.name}
                    </h1>
                    <p className="text-xs sm:text-sm text-zinc-300 max-w-xl">
                      {activeTemplate.description}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 max-w-2xl">
                  <span
                    className="text-[10px] uppercase font-bold tracking-widest px-2.5 py-0.5 rounded-full border inline-block"
                    style={{
                      borderColor: `${draftAccentColor}40`,
                      color: draftAccentColor,
                      backgroundColor: `${draftAccentColor}10`
                    }}
                  >
                    {activeTemplate.category === 'pre_wedding' ? 'Pre-Wedding' : activeTemplate.category} Showcase
                  </span>
                  <h1
                    className="text-2xl sm:text-4xl font-bold tracking-tight"
                    style={{ fontFamily: currentFontFamilyCss }}
                  >
                    {activeTemplate.name}
                  </h1>
                  <p className={`text-xs sm:text-sm leading-relaxed ${
                    isLightModePreview ? 'text-zinc-600' : 'text-zinc-400'
                  }`}>
                    {activeTemplate.description}
                  </p>
                </div>
              )}
            </div>

            {/* Navigation / Proofing Simulator Filter Bar */}
            <div className={`px-6 sm:px-10 py-3 border-b flex items-center justify-between text-xs ${
              isLightModePreview ? 'border-zinc-200 bg-zinc-100/50' : 'border-zinc-900 bg-zinc-950/60'
            }`}>
              <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
                <span className="px-3 py-1 rounded-lg bg-zinc-800 text-white text-[11px] font-semibold">
                  All Photos (6)
                </span>
                <span className="px-3 py-1 rounded-lg text-zinc-500 text-[11px] flex items-center gap-1">
                  <Heart className="w-3 h-3 text-rose-500" /> Favourites
                </span>
                <span className="px-3 py-1 rounded-lg text-zinc-500 text-[11px] flex items-center gap-1">
                  <Star className="w-3 h-3 text-amber-500" /> Album
                </span>
              </div>
              <div className="text-[11px] font-mono text-zinc-500 hidden sm:block">
                Layout: <span className="capitalize">{draftLayout}</span> • {draftColumns} Col
              </div>
            </div>

            {/* LIVE PHOTO RENDERING IN CONFIGURED LAYOUT */}
            <div className={`p-6 sm:p-10 ${
              draftSpacing === 'compact' ? 'p-3 sm:p-4' :
              draftSpacing === 'spacious' ? 'p-8 sm:p-14' :
              'p-6 sm:p-10'
            }`}>
              {/* 1. MASONRY LAYOUT */}
              {draftLayout === 'masonry' && (
                <div
                  className={`columns-1 sm:columns-2 ${
                    draftColumns === 4 ? 'lg:columns-4' :
                    draftColumns === 2 ? 'lg:columns-2' :
                    'lg:columns-3'
                  } ${
                    draftSpacing === 'compact' ? 'gap-3 space-y-3' :
                    draftSpacing === 'spacious' ? 'gap-8 space-y-8' :
                    'gap-5 space-y-5'
                  }`}
                >
                  {SAMPLE_GALLERY_PHOTOS.map((photo) => (
                    <div
                      key={photo.id}
                      className="group relative rounded-2xl overflow-hidden break-inside-avoid border border-black/10 shadow-md transition-all hover:scale-[1.01]"
                    >
                      <img
                        src={photo.url}
                        alt={photo.title}
                        className="w-full h-auto object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-4 flex flex-col justify-end text-white text-xs">
                        <div className="font-semibold">{photo.title}</div>
                        <div className="text-[10px] text-zinc-400 font-mono">Masonry Flow</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 2. LARGE IMAGE / EDITORIAL SHOWCASE */}
              {draftLayout === 'large_image' && (
                <div className={`grid grid-cols-1 ${
                  draftColumns >= 3 ? 'md:grid-cols-2' : 'max-w-4xl mx-auto'
                } ${
                  draftSpacing === 'compact' ? 'gap-4' :
                  draftSpacing === 'spacious' ? 'gap-12' :
                  'gap-8'
                }`}>
                  {SAMPLE_GALLERY_PHOTOS.map((photo, i) => (
                    <div
                      key={photo.id}
                      className="group space-y-3 rounded-2xl overflow-hidden"
                    >
                      <div className="relative aspect-16/10 rounded-2xl overflow-hidden border border-black/10 shadow-xl bg-black">
                        <img
                          src={photo.url}
                          alt={photo.title}
                          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                        />
                      </div>
                      <div className="flex items-center justify-between text-xs px-1">
                        <div>
                          <div className="font-bold text-sm tracking-tight" style={{ fontFamily: currentFontFamilyCss }}>
                            0{i + 1}. {photo.title}
                          </div>
                          <div className="text-[11px] text-zinc-500 font-mono">Editorial Full Frame</div>
                        </div>
                        <span
                          className="text-[10px] font-mono px-2 py-0.5 rounded border"
                          style={{ borderColor: `${draftAccentColor}40`, color: draftAccentColor }}
                        >
                          Curated
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 3. CLASSIC GRID LAYOUT */}
              {draftLayout === 'grid' && (
                <div
                  className={`grid grid-cols-1 sm:grid-cols-2 ${
                    draftColumns === 4 ? 'lg:grid-cols-4' :
                    draftColumns === 2 ? 'lg:grid-cols-2' :
                    'lg:grid-cols-3'
                  } ${
                    draftSpacing === 'compact' ? 'gap-3' :
                    draftSpacing === 'spacious' ? 'gap-8' :
                    'gap-5'
                  }`}
                >
                  {SAMPLE_GALLERY_PHOTOS.map((photo) => (
                    <div
                      key={photo.id}
                      className="group relative aspect-4/3 rounded-2xl overflow-hidden border border-black/10 shadow-md transition-all hover:scale-[1.01]"
                    >
                      <img
                        src={photo.url}
                        alt={photo.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-4 flex flex-col justify-end text-white text-xs">
                        <div className="font-semibold">{photo.title}</div>
                        <div className="text-[10px] text-zinc-400 font-mono">Even Grid</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Simulated Gallery Footer */}
            <div className={`p-8 border-t text-center space-y-2 text-xs ${
              isLightModePreview ? 'border-zinc-200 bg-zinc-100/40 text-zinc-500' : 'border-zinc-900 bg-zinc-950 text-zinc-500'
            }`}>
              <div className="font-serif font-bold text-sm text-zinc-900 dark:text-white">
                {activeStudio?.name || 'StudioCloud Photography'}
              </div>
              <p className="text-[11px]">
                {activeStudio?.branding?.footerText || 'All rights reserved. Verified client delivery powered by StudioCloud SaaS.'}
              </p>
              <div className="text-[10px] font-mono opacity-60">
                Tenant: @{activeStudio?.slug || 'studio'} • Template: {activeTemplate.name}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* MODAL: APPLY TEMPLATE DESIGN DIRECTLY TO AN EXISTING STUDIO GALLERY */}
      {applyModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 space-y-6 shadow-2xl animate-in fade-in">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                  <Layout className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-serif font-bold text-lg text-zinc-900 dark:text-white">
                    Apply Design to Collection
                  </h3>
                  <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
                    {applyStep === 'select' ? 'Step 1 of 2: Select Collection' : 'Step 2 of 2: Confirmation Required'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setApplyModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                ✕
              </button>
            </div>

            {applySuccess ? (
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>{applySuccess}</span>
              </div>
            ) : applyStep === 'select' ? (
              /* STEP 1: SELECT COLLECTION */
              <div className="space-y-4 text-xs">
                <p className="text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  Select an eligible collection belonging to <strong className="text-zinc-800 dark:text-zinc-200">@{activeStudio?.slug || 'studio'}</strong> to apply the active <strong className="text-zinc-800 dark:text-zinc-200">{activeTemplate.name}</strong> presentation configuration.
                </p>

                {galleries.length === 0 ? (
                  <div className="p-4 rounded-xl bg-zinc-100 dark:bg-zinc-850 text-center text-zinc-500">
                    No active galleries found in this studio tenant. Create a gallery first in Galleries & Proofs.
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="font-semibold text-zinc-700 dark:text-zinc-300 block">
                      Choose Target Gallery ({galleries.length} studio collections)
                    </label>
                    <select
                      value={selectedGalleryIdToApply}
                      onChange={(e) => setSelectedGalleryIdToApply(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-850 text-xs text-zinc-900 dark:text-white"
                    >
                      <option value="">Select an eligible collection...</option>
                      {galleries.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.title} • {g.eventType ? g.eventType.toUpperCase() : 'EVENT'} • {g.status.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {selectedGalleryIdToApply && (() => {
                  const targetGal = galleries.find(g => g.id === selectedGalleryIdToApply);
                  if (!targetGal) return null;
                  return (
                    <div className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-850 border border-zinc-200 dark:border-zinc-800 space-y-1.5">
                      <div className="flex items-center justify-between font-medium">
                        <span className="text-zinc-900 dark:text-white font-semibold">{targetGal.title}</span>
                        <Badge variant="amber" size="sm">{targetGal.status}</Badge>
                      </div>
                      <div className="text-[11px] text-zinc-500 flex flex-wrap gap-2">
                        <span>Client: {targetGal.clientName || 'General'}</span>
                        <span>•</span>
                        <span>Shoot: {targetGal.shootDate || 'Unscheduled'}</span>
                        <span>•</span>
                        <span>Current Layout: {targetGal.designSettings?.layout || 'Default'}</span>
                      </div>
                    </div>
                  );
                })()}

                <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setApplyModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => setApplyStep('confirm')}
                    disabled={!selectedGalleryIdToApply}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 disabled:opacity-40 transition-colors shadow-xs flex items-center gap-1.5"
                  >
                    <span>Next: Review & Confirm</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : applyStep === 'confirm' ? (
              /* STEP 2: CONFIRMATION STEP BEFORE APPLYING CHANGES */
              <div className="space-y-4 text-xs">
                {(() => {
                  const targetGal = galleries.find(g => g.id === selectedGalleryIdToApply);
                  return (
                    <div className="space-y-3.5">
                      {/* Target Gallery Summary */}
                      <div className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-850 border border-zinc-200 dark:border-zinc-800 space-y-2">
                        <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                          Target Gallery Collection
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm text-zinc-900 dark:text-white">
                            {targetGal?.title || selectedGalleryIdToApply}
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 capitalize">
                            {targetGal?.eventType || 'Wedding'}
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-500 font-mono">
                          Tenant ID: @{activeStudio?.slug || 'studio'} • Gallery ID: {selectedGalleryIdToApply}
                        </div>
                      </div>

                      {/* Design Configuration Diff */}
                      <div className="p-3.5 rounded-2xl bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 space-y-2">
                        <div className="text-[10px] font-mono uppercase tracking-wider text-amber-500 font-semibold">
                          Design Configuration to Apply
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <div>
                            <span className="text-zinc-400">Template:</span>{' '}
                            <strong className="text-zinc-900 dark:text-white">{activeTemplate.name}</strong>
                          </div>
                          <div>
                            <span className="text-zinc-400">Layout:</span>{' '}
                            <strong className="capitalize text-zinc-900 dark:text-white">{draftLayout} ({draftColumns} Col)</strong>
                          </div>
                          <div>
                            <span className="text-zinc-400">Spacing:</span>{' '}
                            <strong className="capitalize text-zinc-900 dark:text-white">{draftSpacing}</strong>
                          </div>
                          <div>
                            <span className="text-zinc-400">Typography:</span>{' '}
                            <strong className="capitalize text-zinc-900 dark:text-white">{draftFont}</strong>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-zinc-400">Palette:</span>
                            <span
                              className="w-2.5 h-2.5 rounded-full inline-block border border-black/20"
                              style={{ backgroundColor: draftAccentColor }}
                            />
                            <strong className="font-mono text-zinc-900 dark:text-white">{draftAccentColor}</strong>
                          </div>
                          <div>
                            <span className="text-zinc-400">Canvas Theme:</span>{' '}
                            <strong className="capitalize text-zinc-900 dark:text-white">{draftTheme}</strong>
                          </div>
                        </div>
                      </div>

                      {/* Data Safety & Confirmation Prompt */}
                      <div className="p-3 rounded-2xl bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 text-[11px] leading-relaxed flex items-start gap-2.5">
                        <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                        <div>
                          <strong>Confirmation Required:</strong> Applying this design system will update the visual presentation settings of this gallery. Existing uploaded media, client selections, proofing flags, and password protections will remain completely untouched.
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setApplyStep('select')}
                    className="px-3.5 py-2 rounded-xl text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    ← Back to Selection
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setApplyModalOpen(false)}
                      className="px-3.5 py-2 rounded-xl text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyToGallery}
                      disabled={isApplying}
                      className="px-4 py-2 rounded-xl text-xs font-semibold bg-amber-400 hover:bg-amber-300 text-zinc-950 disabled:opacity-50 transition-colors shadow-xs flex items-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{isApplying ? 'Applying Design...' : 'Confirm & Apply Design'}</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};
